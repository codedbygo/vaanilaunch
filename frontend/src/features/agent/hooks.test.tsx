import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useManageStore } from "@/app/stores/manage-store";
import { server } from "@/test/msw";
import { createTestQueryClient } from "@/test/render";

import { streamAgent, uploadPhoto } from "./api";
import { useClock } from "./components/useClock";
import { useLaunchSession } from "./useLaunchSession";
import { useSpeech } from "./useSpeech";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

function stubCanvas(ok = true) {
  vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 100, height: 100 }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ok ? ({ drawImage: () => undefined } as unknown as CanvasRenderingContext2D) : null,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x" }));
}

describe("useLaunchSession", () => {
  beforeEach(() => {
    useManageStore.getState().clear();
  });

  it("works without crypto.randomUUID (phones on plain http)", () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(undefined as never);
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    const { result } = renderHook(() => useLaunchSession(), { wrapper });
    expect(result.current.state.messages).toHaveLength(1);
    Object.defineProperty(crypto, "randomUUID", {
      value: () => "00000000-0000-4000-8000-000000000000",
      configurable: true,
    });
  });

  it("ignores empty sends, removes photos, adds notes, and approve without a draft is a no-op", async () => {
    const { result } = renderHook(() => useLaunchSession(), { wrapper });
    await act(() => result.current.send("   "));
    expect(result.current.state.busy).toBe(false);
    act(() => {
      result.current.note("hello");
    });
    expect(result.current.state.messages.at(-1)?.text).toBe("hello");
    await act(() => result.current.approve());
    expect(result.current.state.messages).toHaveLength(2);
  });

  it("waits for uploads, handles several photos and a failed approval", async () => {
    stubCanvas();
    let release: () => void = () => undefined;
    server.use(
      http.post("*/api/upload", async () => {
        await new Promise<void>((r) => {
          release = r;
        });
        return HttpResponse.json({ id: "aaaaaaaaaaaaaaaa", url: "/media/a.jpg" });
      }),
    );
    const { result } = renderHook(() => useLaunchSession(), { wrapper });
    let uploading: Promise<void> = Promise.resolve();
    act(() => {
      uploading = result.current.addPhotos([new File(["a"], "a.jpg"), new File(["b"], "b.jpg")]);
    });
    await waitFor(() => {
      expect(result.current.photos).toHaveLength(1);
    });
    await act(() => result.current.send("with photos"));
    expect(result.current.state.messages.at(-1)?.text).toMatch(/still uploading/);
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 10));
      release();
      await uploading;
    });
    expect(result.current.photos.map((p) => p.id)).toEqual([
      "aaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaa",
    ]);
    const first = result.current.photos[0]?.key ?? "";
    act(() => {
      result.current.removePhoto(first);
    });
    expect(result.current.photos).toHaveLength(1);
  });

  it("reports a failed approval and non-Error failures", async () => {
    server.use(
      http.post("*/api/agent", () =>
        HttpResponse.text(
          `data: ${JSON.stringify({ type: "step", data: { id: "1", tool: "save_draft", label: "x", status: "done", result: { needs_approval: true, slug: "s", preview_url: "/s/s?preview=1", products: 1 } } })}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
      http.post("*/api/approve", () =>
        HttpResponse.json({ detail: "Not your draft" }, { status: 403 }),
      ),
    );
    const { result } = renderHook(() => useLaunchSession(), { wrapper });
    await act(() => result.current.send("build it"));
    expect(result.current.state.draft?.slug).toBe("s");
    await act(() => result.current.approve());
    expect(result.current.state.messages.at(-1)?.text).toMatch(/⚠️/);
    // A browser API rejecting with a bare string: the message must still read well.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the non-Error case is the point
    vi.stubGlobal("createImageBitmap", () => Promise.reject("not an image"));
    await act(() => result.current.addPhotos([new File(["x"], "x.jpg")]));
    expect(result.current.state.messages.at(-1)?.text).toBe("⚠️ Photo upload failed: not an image");
  });
});

describe("agent API error paths", () => {
  it("uses the status text, then a generic HTTP code, when the body has no detail", async () => {
    server.use(
      http.post(
        "*/api/agent",
        () => new HttpResponse("oops", { status: 502, statusText: "Bad Gateway" }),
      ),
    );
    await expect(
      streamAgent({ sessionId: "s", text: "t", images: [] }, () => undefined),
    ).rejects.toThrow("Bad Gateway");
    server.use(
      http.post("*/api/agent", () =>
        HttpResponse.json({ detail: 42 }, { status: 599, statusText: "" }),
      ),
    );
    await expect(
      streamAgent({ sessionId: "s", text: "t", images: [] }, () => undefined),
    ).rejects.toThrow("HTTP 599");
    server.use(http.post("*/api/agent", () => HttpResponse.error()));
    await expect(
      streamAgent({ sessionId: "s", text: "t", images: [] }, () => undefined),
    ).rejects.toThrow(/reach the server/);
  });

  it("refuses photos when the browser has no canvas", async () => {
    stubCanvas(false);
    await expect(uploadPhoto(new File(["x"], "x.jpg"))).rejects.toThrow(/cannot process photos/);
  });
});

describe("useSpeech failure to start", () => {
  it("resets when the browser refuses to start recognition", () => {
    class Broken {
      start() {
        throw new Error("not allowed");
      }
    }
    vi.stubGlobal("SpeechRecognition", Broken);
    const { result } = renderHook(() =>
      useSpeech({ lang: "te-IN", onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() }),
    );
    act(() => {
      result.current.toggle();
    });
    expect(result.current.listening).toBe(false);
  });
});

describe("useClock", () => {
  it("ticks only while running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { result, rerender } = renderHook(({ on }) => useClock(on), {
      initialProps: { on: true },
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(4_000);
    rerender({ on: false });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(4_000);
    vi.useRealTimers();
  });
});
