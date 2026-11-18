import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useManageStore } from "@/app/stores/manage-store";
import { Composer } from "@/features/agent/components/Composer";
import { LaunchDialog } from "@/features/agent/components/LaunchDialog";
import { RichText } from "@/features/agent/components/RichText";
import { Timeline } from "@/features/agent/components/Timeline";
import { MILESTONES, type MilestoneState } from "@/features/agent/milestones";
import { initialSession } from "@/features/agent/session";
import type { LaunchSession } from "@/features/agent/useLaunchSession";
import { Dashboard } from "@/features/manage/components/Dashboard";
import { OwnerSettings } from "@/features/manage/components/OwnerSettings";
import { dashboardSchema } from "@/features/manage/schemas";
import { Showcase } from "@/features/stores/components/Showcase";
import { dashboard, server } from "@/test/msw";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const creds = { slug: "lakshmi-tiffins", key: "secret" };

function fakeSession(over: Partial<LaunchSession> = {}): LaunchSession {
  return {
    state: initialSession("hi"),
    lang: "te-IN",
    photos: [],
    send: vi.fn(() => Promise.resolve()),
    addPhotos: vi.fn(() => Promise.resolve()),
    removePhoto: vi.fn(),
    approve: vi.fn(() => Promise.resolve()),
    note: vi.fn(),
    setCelebrate: vi.fn(),
    failed: false,
    retry: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

interface FakeRec {
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function installMic() {
  const recs: FakeRec[] = [];
  class Rec {
    onresult = null;
    onerror = null;
    onend: (() => void) | null = null;
    constructor() {
      recs.push(this);
    }
    start() {
      return undefined;
    }
    stop() {
      this.onend?.();
    }
  }
  vi.stubGlobal("SpeechRecognition", Rec);
  return recs;
}

describe("Composer", () => {
  it("puts what was heard in the box to check and fix, sends only on Send, and reports mic errors", async () => {
    const recs = installMic();
    const session = fakeSession();
    render(<Composer session={session} />);
    const user = userEvent.setup();
    const mic = screen.getByRole("button", { name: /speak in తెలుగు/i });
    await user.click(mic);
    expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument();
    expect(screen.getByText("Listening… take your time")).toBeInTheDocument();
    act(() => {
      recs[0]?.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: "ఇడ్లీ 80" }], { isFinal: true })],
      });
    });
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box).toHaveValue("ఇడ్లీ 80");
    expect(box).toHaveFocus();
    expect(session.send).not.toHaveBeenCalled(); // nothing goes until the owner has checked it
    await user.clear(box);
    await user.type(box, "ఇడ్లీ 90");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(session.send).toHaveBeenCalledWith("ఇడ్లీ 90");

    await user.click(screen.getByRole("button", { name: /speak in/i }));
    act(() => {
      recs[1]?.onerror?.({ error: "not-allowed" });
      recs[1]?.onend?.();
    });
    expect(session.note).toHaveBeenCalledWith(expect.stringMatching(/permission/i));
  });

  it("handles photos, the file picker and empty Enter", async () => {
    const session = fakeSession({
      photos: [{ key: "k1", url: "/media/a.jpg", id: "aaaaaaaaaaaaaaaa" }],
    });
    render(<Composer session={session} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(session.removePhoto).toHaveBeenCalledWith("k1");
    const picker = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!picker) throw new Error("no file input");
    const click = vi.spyOn(picker, "click");
    await user.click(screen.getByRole("button", { name: "Add product photos" }));
    expect(click).toHaveBeenCalled();
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    expect(session.addPhotos).toHaveBeenCalledWith([]);
    Object.defineProperty(picker, "files", { value: null, configurable: true });
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    expect(session.addPhotos).toHaveBeenLastCalledWith([]);
  });

  it("does not send on Enter when there is nothing to send, and disables the mic while busy", async () => {
    const session = fakeSession({ state: { ...initialSession("hi"), busy: true } });
    render(<Composer session={session} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "{Enter}");
    expect(session.send).not.toHaveBeenCalled();
    expect(screen.getByText("Voice needs Chrome or Edge")).toBeInTheDocument();
  });
});

describe("LaunchDialog", () => {
  it("names the store, copies the link and works without a timer", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <LaunchDialog
        open
        onOpenChange={vi.fn()}
        url="https://x.vaani.in"
        name=""
        launchMs={null}
        creds={null}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your store is live!" })).toBeInTheDocument();
    expect(screen.getByText("Your store is online.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://x.vaani.in");
    expect(await screen.findByRole("button", { name: "Copied ✓" })).toBeInTheDocument();
  });
});

describe("RichText", () => {
  it("turns http links into safe links and keeps the rest as text", () => {
    render(<RichText text={"Live at https://x.vaani.in and **bold** <b>not html</b>"} />);
    expect(screen.getByRole("link", { name: "https://x.vaani.in" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByText("bold").tagName).toBe("B");
    expect(screen.getByText(/<b>not html<\/b>/)).toBeInTheDocument();
  });
});

describe("Timeline", () => {
  it("lists available domains with their prices in any currency", () => {
    const domains = MILESTONES.map((m): MilestoneState => ({
      ...m,
      label: m.key,
      by: m.actor,
      status: "idle",
    }));
    const withDomains = domains.map((m) =>
      m.key === "domains"
        ? {
            ...m,
            status: "done" as const,
            domains: [
              { domain: "a.in", price: 799, currency: "INR" },
              { domain: "b.in", price: 12, currency: "USD" },
              { domain: "c.in", price: 9 },
              { domain: "d.in", price: null },
            ],
          }
        : m,
    );
    render(<Timeline milestones={withDomains} />);
    expect(screen.getByRole("link", { name: /a\.in/ })).toHaveTextContent("₹799");
    expect(screen.getByRole("link", { name: /b\.in/ })).toHaveTextContent("USD 12");
    expect(screen.getByRole("link", { name: /c\.in/ })).toHaveTextContent("c.in9");
    expect(screen.getByRole("link", { name: /d\.in/ })).toHaveTextContent(/^d\.in$/);
  });
});

describe("Dashboard and owner settings", () => {
  beforeEach(() => {
    useManageStore.getState().clear();
  });

  it("shows unnamed items, notes and the store slug, and marks an order delivered", async () => {
    let posted: unknown;
    server.use(
      http.post("*/api/manage", () =>
        HttpResponse.json({
          ...dashboard,
          name: null,
          owner_email: null,
          orders: [
            {
              ...dashboard.orders[0],
              status: "paid",
              items: [{ name: null, qty: 2 }],
              customer: { name: "Ravi", phone: "900", note: "gate 2" },
            },
          ],
        }),
      ),
      http.post("*/api/manage/orders/:ref", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ ...dashboard.orders[0], status: "delivered" });
      }),
    );
    renderWithProviders(<Dashboard creds={creds} />);
    expect(await screen.findByText("lakshmi-tiffins")).toBeInTheDocument();
    expect(screen.getByText("Item × 2")).toBeInTheDocument();
    expect(screen.getByText(/gate 2/)).toBeInTheDocument();
    expect(screen.getByText(/not set/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mark delivered" }));
    await waitFor(() => {
      expect(posted).toMatchObject({ status: "delivered" });
    });
  });

  it("shows a toast when an order update fails", async () => {
    server.use(http.post("*/api/manage/orders/:ref", () => HttpResponse.json({}, { status: 500 })));
    const toast = await import("sonner");
    const err = vi.spyOn(toast.toast, "error");
    renderWithProviders(<Dashboard creds={creds} />);
    await userEvent.click(await screen.findByRole("button", { name: /money received/i }));
    await waitFor(() => {
      expect(err).toHaveBeenCalledWith(expect.stringMatching(/could not update the order/i));
    });
  });

  it("confirms an email, and resets the private link after a second click", async () => {
    useManageStore.getState().setCreds(creds);
    const client = createTestQueryClient();
    const view = (verified: boolean) => (
      <QueryClientProvider client={client}>
        <OwnerSettings
          creds={creds}
          dash={dashboardSchema.parse({ ...dashboard, owner_email_verified: verified })}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view(true));
    expect(screen.getByText(/lakshmi@shop.in \(confirmed\)/)).toBeInTheDocument();
    rerender(view(false));
    expect(screen.getByText(/waiting for you to click/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset my private link" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Reset my private link" }));
    await user.click(screen.getByRole("button", { name: "Yes, reset it" }));
    await waitFor(() => {
      expect(useManageStore.getState().creds).toEqual({
        slug: "lakshmi-tiffins",
        key: "rotated-key",
      });
    });
    expect(screen.getByRole("button", { name: "Reset my private link" })).toBeInTheDocument();
  });

  it("reports a failed reset", async () => {
    server.use(http.post("*/api/manage/rotate", () => HttpResponse.json({}, { status: 403 })));
    const toast = await import("sonner");
    const err = vi.spyOn(toast.toast, "error");
    renderWithProviders(<OwnerSettings creds={creds} dash={dashboardSchema.parse(dashboard)} />);
    await userEvent.click(screen.getByRole("button", { name: "Reset my private link" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, reset it" }));
    await waitFor(() => {
      expect(err).toHaveBeenCalledWith(expect.stringMatching(/could not reset/i));
    });
  });
});

describe("Showcase", () => {
  it("shows a placeholder letter for a store without a name", async () => {
    server.use(
      http.get("*/api/sites", () =>
        HttpResponse.json([{ slug: "a", name: null, tagline: null, url: "/s/a" }]),
      ),
    );
    renderWithProviders(<Showcase />);
    expect(await screen.findByText("?")).toBeInTheDocument();
  });
});

describe("launch checklist", () => {
  it("scores only what the store really has and links the QR code", async () => {
    const checklist = [
      { key: "name", done: true },
      { key: "description", done: true },
      { key: "photos", done: false },
      { key: "phone", done: true },
      { key: "hours", done: false },
      { key: "location", done: true },
      { key: "seo_title", done: true },
      { key: "seo_description", done: true },
      { key: "published", done: true },
    ];
    server.use(http.post("*/api/manage", () => HttpResponse.json({ ...dashboard, checklist })));
    renderWithProviders(<Dashboard creds={creds} />);
    const card = await screen.findByRole("region", { name: "Launch readiness" });
    expect(card).toHaveTextContent("78%");
    expect(card).toHaveTextContent("○ Business hours");
    expect(card).toHaveTextContent("✓ Website published");
    expect(card).toHaveTextContent(/Tell the agent what is missing/);
    expect(screen.getByRole("link", { name: /Download QR code/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/qr?data=") as unknown,
    );
  });

  it("shows 100% without the hint when everything is done, and no QR for a draft", async () => {
    const checklist = ["name", "published"].map((key) => ({ key, done: true }));
    server.use(
      http.post("*/api/manage", () =>
        HttpResponse.json({ ...dashboard, status: "draft", checklist }),
      ),
    );
    renderWithProviders(<Dashboard creds={creds} />);
    const card = await screen.findByRole("region", { name: "Launch readiness" });
    expect(card).toHaveTextContent("100%");
    expect(card).not.toHaveTextContent(/Tell the agent/);
    expect(screen.queryByRole("link", { name: /Download QR code/ })).not.toBeInTheDocument();
  });
});
