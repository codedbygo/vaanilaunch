import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useManageStore } from "@/app/stores/manage-store";
import { Hero } from "@/components/marketing/Hero";
import { ContactForm } from "@/features/contact/components/ContactForm";
import { apiFetch } from "@/lib/api";
import { dashboard, server, sse } from "@/test/msw";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

import { App } from "./App";

const draftStep = {
  id: "d1",
  tool: "save_draft",
  label: "Building store “Lakshmi Tiffins” (3 products)",
  status: "done",
  result: {
    needs_approval: true,
    slug: "lakshmi-tiffins",
    preview_url: "/s/lakshmi-tiffins?preview=1",
    products: 3,
    _manage: { slug: "lakshmi-tiffins", key: "k" },
    _preview: "9.t",
  },
};
const publishStep = {
  id: "p1",
  tool: "publish_site",
  label: "Publishing",
  status: "done",
  result: { live: true, url: "http://localhost:8000/s/lakshmi-tiffins" },
};

describe("App, more paths", () => {
  beforeEach(() => {
    localStorage.clear();
    useManageStore.getState().clear();
  });

  it("runs with the browser's own history", async () => {
    render(<App queryClient={createTestQueryClient()} />);
    expect(await screen.findByRole("region", { name: "Launch studio" })).toBeInTheDocument();
  });

  it("Start speaking scrolls to the studio and focuses the message box", async () => {
    render(
      <App
        queryClient={createTestQueryClient()}
        history={createMemoryHistory({ initialEntries: ["/"] })}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: /start speaking/i }));
    const studio = screen.getByRole("region", { name: "Launch studio" });
    expect(within(studio).getByRole("textbox", { name: "Message" })).toHaveFocus();
  });

  it("previews a draft store from a manage link with a short-lived token", async () => {
    server.use(
      http.post("*/api/manage", () => HttpResponse.json({ ...dashboard, status: "draft" })),
    );
    useManageStore.getState().setCreds({ slug: "lakshmi-tiffins", key: "k" });
    render(
      <App
        queryClient={createTestQueryClient()}
        history={createMemoryHistory({ initialEntries: ["/"] })}
      />,
    );
    const frame = await screen.findByTitle("Store preview");
    expect(frame).toHaveAttribute("src", "/s/lakshmi-tiffins?t=9999999999.previewtoken");
    expect(frame).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    // after a reload the draft can still be approved, proven by the saved private key
    let approved: unknown;
    server.use(
      http.post("*/api/approve", async ({ request }) => {
        approved = await request.json();
        return HttpResponse.json({ approved: true });
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /approve & publish/i }));
    await waitFor(() => {
      expect(approved).toMatchObject({ slug: "lakshmi-tiffins", key: "k" });
    });
  });

  it("shows Approved while publishing, reopens the QR, and Change focuses the box", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/agent", async () => {
        calls += 1;
        if (calls === 1) return sse([{ type: "step", data: draftStep }]);
        await delay(150);
        return sse([{ type: "step", data: publishStep }]);
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
    await user.type(within(studio).getByRole("textbox", { name: "Message" }), "I sell idli{Enter}");
    await user.click(await within(studio).findByRole("button", { name: /change/i }));
    expect(within(studio).getByRole("textbox", { name: "Message" })).toHaveFocus();
    await user.click(within(studio).getByRole("button", { name: /approve & publish/i }));
    expect(await within(studio).findByText("Approved. Publishing…")).toBeInTheDocument();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await user.click(within(studio).getByRole("button", { name: "Show QR code" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("Hero", () => {
  it("cycles the greeting through the languages", () => {
    vi.useFakeTimers();
    render(<Hero onStart={vi.fn()} />);
    expect(screen.getByText("నమస్తే")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByText("नमस्ते")).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("ContactForm", () => {
  it("shows only the errors that apply", async () => {
    renderWithProviders(<ContactForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your name"), "Lakshmi");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.queryByText("Please enter your name")).not.toBeInTheDocument();
    expect(screen.getByText("Please write a message")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "lakshmi@shop.in");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.queryByText("Please enter a valid email")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Message"), "Hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.queryByText("Please write a message")).not.toBeInTheDocument();
    expect(screen.getByText("Please enter a valid email")).toBeInTheDocument();
  });
});

describe("library edge cases", () => {
  it("still reports an HTTP error when the error body can't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Error",
          text: () => Promise.reject(new Error("x")),
        }),
      ),
    );
    await expect(apiFetch("/x", { parse: (v: unknown) => v } as never)).rejects.toMatchObject({
      status: 500,
    });
  });

  it("ignores a saved manage link with the wrong shape", async () => {
    localStorage.setItem("vl_manage", JSON.stringify({ slug: 1 }));
    vi.resetModules();
    const { useManageStore: fresh } = await import("./stores/manage-store");
    expect(fresh.getState().creds).toBeNull();
  });
});
