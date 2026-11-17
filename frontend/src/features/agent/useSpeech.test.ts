import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSpeech } from "./useSpeech";

interface Fake {
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  starts: number;
  lang: string;
  continuous: boolean;
}

function installFakeRecognition() {
  const made: Fake[] = [];
  class FakeRecognition {
    onresult = null;
    onerror = null;
    onend: (() => void) | null = null;
    starts = 0;
    lang = "";
    continuous = false;
    interimResults = false;
    constructor() {
      made.push(this);
    }
    start() {
      this.starts++;
    }
    stop() {
      this.onend?.();
    }
  }
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  const say = (text: string, isFinal: boolean) => {
    made[0]?.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: text }], { isFinal })],
    });
  };
  const silence = () => {
    made[0]?.onerror?.({ error: "no-speech" });
    made[0]?.onend?.();
  };
  return { made, say, silence };
}

describe("useSpeech", () => {
  it("keeps listening through pauses and sends everything when the user taps stop", () => {
    const mic = installFakeRecognition();
    const onText = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() =>
      useSpeech({ lang: "te-IN", onText, onEnd, onError: vi.fn() }),
    );
    expect(result.current.supported).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.listening).toBe(true);
    expect(mic.made[0]).toMatchObject({ lang: "te-IN", continuous: true });

    act(() => {
      mic.say("నేను విజయవాడలో", true);
      mic.silence();
    });
    act(() => {
      mic.say("టిఫిన్", false);
    });
    expect(onEnd).not.toHaveBeenCalled();
    expect(mic.made[0]?.starts).toBe(2); // restarted after the pause
    expect(onText).toHaveBeenLastCalledWith("నేను విజయవాడలో టిఫిన్");

    act(() => {
      mic.say("టిఫిన్ సర్వీస్", true);
      result.current.toggle();
    });
    expect(onEnd).toHaveBeenCalledWith("నేను విజయవాడలో టిఫిన్ సర్వీస్");
    expect(result.current.listening).toBe(false);
  });

  it("reports real errors and stops", () => {
    const mic = installFakeRecognition();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() =>
      useSpeech({ lang: "hi-IN", onText: vi.fn(), onEnd, onError }),
    );
    act(() => {
      result.current.toggle();
    });
    act(() => {
      mic.made[0]?.onerror?.({ error: "not-allowed" });
      mic.made[0]?.onend?.();
    });
    expect(onError).toHaveBeenCalledWith("not-allowed");
    expect(onEnd).toHaveBeenCalledWith("");
    expect(result.current.listening).toBe(false);
  });

  it("is unsupported without the Web Speech API", () => {
    const { result } = renderHook(() =>
      useSpeech({ lang: "en-IN", onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() }),
    );
    expect(result.current.supported).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.listening).toBe(false);
  });
});
