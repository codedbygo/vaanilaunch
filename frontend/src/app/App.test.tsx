import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useManageStore } from "@/app/stores/manage-store";
import { server, sse } from "@/test/msw";
import { createTestQueryClient } from "@/test/render";

import { App } from "./App";

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App queryClient={createTestQueryClient()} history={history} />);
  return history;
}

const draftStep = {
  id: "t2",
  tool: "save_draft",
  label: "Building store “Lakshmi Tiffins” (3 products)",
  status: "done",
  result: {
    needs_approval: true,
    slug: "lakshmi-tiffins",
    preview_url: "/s/lakshmi-tiffins?preview=1",
    products: 3,
    _manage: { slug: "lakshmi-tiffins", key: "secret-key" },
    _preview: "9999999999.tok",
  },
};
const publishStep = {
  id: "t3",
  tool: "publish_site",
  label: "Publishing",
  status: "done",
  result: {
    live: true,
    url: "http://localhost:8000/s/lakshmi-tiffins",
    dns: { skipped: true },
    _manage: { slug: "lakshmi-tiffins", key: "secret-key" },
  },
};

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    useManageStore.getState().clear();
  });

  it("renders the story and the launch studio", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Speak your business.",
    );
    expect(screen.getByRole("region", { name: "Launch studio" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Responsible by design" })).toBeInTheDocument();
  });

  it("launches a store: draft, approval, publish, launch dialog", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/agent", async ({ request }) => {
        bodies.push(await request.json());
        return bodies.length === 1
          ? sse([
              {
                type: "step",
                data: {
                  id: "t1",
                  tool: "check_slug",
                  label: "Reserving",
                  status: "done",
                  result: { slug: "lakshmi-tiffins" },
                },
              },
              { type: "step", data: draftStep },
              { type: "message", data: "Please **approve** the preview." },
            ])
          : sse([
              { type: "step", data: publishStep },
              { type: "message", data: "Your store is live!" },
            ]);
      }),
    );
    renderAt("/");
    const user = userEvent.setup();
    const studio = await screen.findByRole("region", { name: "Launch studio" });

    await user.type(
      within(studio).getByRole("textbox", { name: "Message" }),
      "I sell idli batter in Vijayawada{Enter}",
    );
    expect(await within(studio).findByText(/approve/, { selector: "b" })).toBeInTheDocument();
    expect(bodies[0]).toMatchObject({
      text: "I sell idli batter in Vijayawada\n\n[Preferred language: Telugu]",
      images: [],
    });
    expect(within(studio).getByTitle("Store preview")).toHaveAttribute(
      "src",
      "/s/lakshmi-tiffins?preview=1&t=9999999999.tok",
    );
    expect(useManageStore.getState().creds).toEqual({ slug: "lakshmi-tiffins", key: "secret-key" });

    await user.click(within(studio).getByRole("button", { name: /approve & publish/i }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Lakshmi Tiffins is live!" }),
    ).toBeInTheDocument();
    expect(
      within(dialog)
        .getByRole("img", { name: /qr code/i })
        .getAttribute("src"),
    ).toContain("/api/qr?data=http%3A%2F%2Flocalhost%3A8000");
    expect(JSON.stringify(bodies[1])).toContain("I approve the preview");
    expect(bodies[1]).toMatchObject({
      manageSlug: "lakshmi-tiffins",
      manageKey: "secret-key",
    });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(within(studio).getByRole("tab", { name: "Orders" })).toBeInTheDocument();
  });

  it("turns a manage link into stored credentials and removes the key from the URL", async () => {
    const history = renderAt("/?manage=lakshmi-tiffins&key=secret-key");
    expect(
      await screen.findByRole("heading", { name: "Managing Lakshmi Tiffins" }),
    ).toBeInTheDocument();
    expect(history.location.search).toBe("");
    expect(useManageStore.getState().creds).toEqual({ slug: "lakshmi-tiffins", key: "secret-key" });
    expect(await screen.findByText("LT-1001")).toBeInTheDocument();
  });

  it("shows a server error in the chat", async () => {
    server.use(
      http.post("*/api/agent", () =>
        HttpResponse.json({ detail: "Too many requests — please wait a bit." }, { status: 429 }),
      ),
    );
    renderAt("/");
    const user = userEvent.setup();
    const studio = await screen.findByRole("region", { name: "Launch studio" });
    await user.click(within(studio).getByRole("button", { name: /i bake custom cakes/i }));
    expect(await within(studio).findByText(/too many requests/i)).toBeInTheDocument();
  });

  it("renders the not-found route for an unknown path", async () => {
    renderAt("/nowhere");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
