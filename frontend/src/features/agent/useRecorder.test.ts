import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/msw";

import { SEGMENT_MS, useRecorder } from "./useRecorder";

interface FakeRecorder {
  mimeType: string;
  stop: () => void;
}

/** A MediaRecorder that hands back a clip of `size` bytes when stopped. */
function installRecorder(size = 4000, supported: string[] = ["audio/webm;codecs=opus"]) {
  const made: FakeRecorder[] = [];
  const track = { stop: vi.fn() };
  const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [track] }));
  class FakeMediaRecorder {
    static isTypeSupported = (t: string) => supported.includes(t);
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_s: unknown, opts?: { mimeType?: string }) {
      this.mimeType = opts?.mimeType ?? "";
      made.push(this);
    }
    start() {
      return undefined;
    }
    stop() {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return { made, track, getUserMedia };
}

function transcripts(...texts: string[]) {
  const bodies: { audio: string; lang: string }[] = [];
  server.use(
    http.post("*/api/transcribe", async ({ request }) => {
      bodies.push((await request.json()) as { audio: string; lang: string });
      return HttpResponse.json({ text: texts[bodies.length - 1] ?? "" });
    }),
  );
  return bodies;
}

const callbacks = () => ({
  onText: vi.fn(),
  onEnd: vi.fn(),
  onError: vi.fn(),
  onFail: vi.fn(),
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

describe("useRecorder", () => {
  it("records with noise suppression, sends the clip in the owner's language, and returns the text", async () => {
    const mic = installRecorder();
    const bodies = transcripts("అమీర్‌పేట్‌లో మహిళల పీజీ");
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "te-IN", ...cb }));
    expect(result.current.supported).toBe(true);
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(mic.getUserMedia).toHaveBeenCalledWith({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    expect(result.current.listening).toBe(true);
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(cb.onEnd).toHaveBeenCalledWith("అమీర్‌పేట్‌లో మహిళల పీజీ");
    });
    expect(bodies[0]?.lang).toBe("te-IN");
    expect(bodies[0]?.audio).toMatch(/^data:audio\/webm;codecs=opus;base64,/);
    expect(mic.track.stop).toHaveBeenCalled(); // the microphone is released
    expect(result.current.listening).toBe(false);
    expect(result.current.transcribing).toBe(false);
  });

  it("cuts long speech into pieces under the 30-second limit and joins the text in order", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mic = installRecorder();
    transcripts("I want to start", "a women's PG in Gachibowli");
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "en-IN", ...cb }));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(SEGMENT_MS); // first piece ends by itself, recording continues
    });
    expect(mic.made).toHaveLength(2);
    await waitFor(() => {
      expect(cb.onText).toHaveBeenCalledWith("I want to start");
    });
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(cb.onEnd).toHaveBeenCalledWith("I want to start a women's PG in Gachibowli");
    });
  });

  it("explains a blocked or missing microphone", async () => {
    const mic = installRecorder();
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "hi-IN", ...cb }));
    mic.getUserMedia.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(cb.onError).toHaveBeenLastCalledWith("not-allowed");
    mic.getUserMedia.mockRejectedValueOnce(new DOMException("none", "NotFoundError"));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(cb.onError).toHaveBeenLastCalledWith("audio-capture");
    expect(result.current.listening).toBe(false);
  });

  it("hands back what was heard and asks for the fallback when the service fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installRecorder();
    let n = 0;
    server.use(
      http.post("*/api/transcribe", () =>
        ++n === 1
          ? HttpResponse.json({ text: "Ameerpet PG" })
          : HttpResponse.json({ detail: "Speech service unavailable" }, { status: 503 }),
      ),
    );
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "en-IN", ...cb }));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(SEGMENT_MS);
    });
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(cb.onFail).toHaveBeenCalledWith("Ameerpet PG");
    });
    expect(cb.onEnd).not.toHaveBeenCalled();
  });

  it("forgets everything when the message is sent mid-recording, and skips tiny clicks", async () => {
    installRecorder();
    const bodies = transcripts("should not appear");
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "ta-IN", ...cb }));
    act(() => {
      result.current.cancel(); // nothing recording: nothing to stop
    });
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => {
      expect(result.current.listening).toBe(false);
    });
    expect(cb.onText).not.toHaveBeenCalled();
    expect(cb.onEnd).not.toHaveBeenCalled();

    installRecorder(10); // a click, not speech
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(cb.onEnd).toHaveBeenCalledWith("");
    });
    expect(bodies).toHaveLength(0);
  });

  it("stops cleanly when cancelled while the permission prompt is open, and records on Safari", async () => {
    const mic = installRecorder(4000, ["audio/mp4"]);
    let grant: (v: unknown) => void = () => undefined;
    mic.getUserMedia.mockImplementationOnce(
      () => new Promise((resolve) => (grant = resolve)) as never,
    );
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "en-IN", ...cb }));
    act(() => {
      result.current.toggle();
    });
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      grant({ getTracks: () => [mic.track] });
      await Promise.resolve();
    });
    expect(mic.track.stop).toHaveBeenCalled();
    expect(mic.made).toHaveLength(0);
    expect(result.current.listening).toBe(false);

    transcripts("hello");
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(mic.made[0]?.mimeType).toBe("audio/mp4");
  });

  it("records without a preferred format and reports no support where recording is missing", async () => {
    const mic = installRecorder(4000, []);
    transcripts("ok");
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "en-IN", ...cb }));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(mic.made[0]?.mimeType).toBe("");
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(cb.onEnd).toHaveBeenCalledWith("ok");
    });
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    const bare = renderHook(() => useRecorder({ lang: "en-IN", ...callbacks() }));
    expect(bare.result.current.supported).toBe(false);
  });
});

describe("useRecorder: unreadable recording", () => {
  it("treats a recording the browser can't read as a service failure", async () => {
    installRecorder();
    const bodies = transcripts("never");
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "en-IN", ...cb }));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(cb.onFail).toHaveBeenCalledWith("");
    });
    expect(bodies).toHaveLength(0);
    vi.restoreAllMocks();
  });
});

describe("useRecorder: sent while transcribing", () => {
  it("drops a transcription that finishes after the message was sent", async () => {
    installRecorder();
    let release: () => void = () => undefined;
    server.use(
      http.post("*/api/transcribe", async () => {
        await new Promise<void>((r) => (release = r));
        return HttpResponse.json({ text: "old words" });
      }),
    );
    const cb = callbacks();
    const { result } = renderHook(() => useRecorder({ lang: "en-IN", ...cb }));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(result.current.transcribing).toBe(true);
    });
    act(() => {
      result.current.cancel(); // Send tapped while the clip is still being transcribed
      release();
    });
    await waitFor(() => {
      expect(result.current.transcribing).toBe(false);
    });
    expect(cb.onText).not.toHaveBeenCalled();
    expect(cb.onEnd).not.toHaveBeenCalled();
  });
});
