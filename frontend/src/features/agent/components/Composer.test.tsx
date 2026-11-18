import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app/App";
import { useManageStore } from "@/app/stores/manage-store";
import { server, sse } from "@/test/msw";
import { createTestQueryClient } from "@/test/render";

// jsdom has no image decoding or canvas; the browser resize step is stubbed, the upload is real (MSW).
function stubImagePipeline() {
  vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 2048, height: 1024 }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => undefined,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,/9j/AA==",
  );
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview" }));
}

describe("Composer", () => {
  beforeEach(() => {
    localStorage.clear();
    useManageStore.getState().clear();
  });

  it("one language choice switches the page, the agent hint and the app messages; sends photos without typing", async () => {
    stubImagePipeline();
    const uploads: unknown[] = [];
    const agentBodies: unknown[] = [];
    server.use(
      http.post("*/api/upload", async ({ request }) => {
        uploads.push(await request.json());
        return HttpResponse.json({ id: "0123456789abcdef", url: "/media/0123456789abcdef.jpg" });
      }),
      http.post("*/api/agent", async ({ request }) => {
        agentBodies.push(await request.json());
        return sse([{ type: "message", data: "Nice photos" }]);
      }),
    );
    render(
      <App
        queryClient={createTestQueryClient()}
        history={createMemoryHistory({ initialEntries: ["/"] })}
      />,
    );
    const user = userEvent.setup();
    const studio = await screen.findByRole("region", { name: "Launch studio" });

    // The one language picker, in the top bar.
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "hi-IN");
    // The whole app follows: document language, page text, and the studio's own labels.
    expect(document.documentElement.lang).toBe("hi-IN");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("बस उसके बारे में बताइए।");
    expect(localStorage.getItem("vl_lang")).toBe("hi-IN");
    const file = new File(["x"], "idli.jpg", { type: "image/jpeg" });
    const input = studio.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    await user.upload(input, file);

    expect(await within(studio).findByRole("button", { name: "फ़ोटो हटाएँ" })).toBeInTheDocument();
    expect(uploads).toEqual([{ dataUrl: "data:image/jpeg;base64,/9j/AA==" }]);

    await user.click(within(studio).getByRole("button", { name: "भेजें" }));
    expect(await within(studio).findByText("Nice photos")).toBeInTheDocument();
    expect(agentBodies[0]).toMatchObject({
      images: ["0123456789abcdef"],
      text: "📷 ये मेरे प्रोडक्ट की फ़ोटो हैं।\n\n[Preferred language: Hindi]",
    });
    await waitFor(() => {
      expect(within(studio).queryByRole("button", { name: "फ़ोटो हटाएँ" })).not.toBeInTheDocument();
    });
  });

  it("tells the owner when a photo upload fails", async () => {
    stubImagePipeline();
    server.use(
      http.post("*/api/upload", () =>
        HttpResponse.json({ detail: "Invalid image" }, { status: 400 }),
      ),
    );
    render(
      <App
        queryClient={createTestQueryClient()}
        history={createMemoryHistory({ initialEntries: ["/"] })}
      />,
    );
    const studio = await screen.findByRole("region", { name: "Launch studio" });
    const input = studio.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    await userEvent.upload(input, new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(await within(studio).findByText(/photo upload failed/i)).toBeInTheDocument();
  });
});
