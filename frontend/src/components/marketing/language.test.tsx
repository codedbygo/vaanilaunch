import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useManageStore } from "@/app/stores/manage-store";
import { Hero } from "@/components/marketing/Hero";
import { Nav } from "@/components/marketing/Nav";
import { Studio } from "@/features/agent/components/Studio";
import { initialSession } from "@/features/agent/session";
import type { LaunchSession } from "@/features/agent/useLaunchSession";
import { useLocaleStore } from "@/lib/i18n";
import { server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

describe("language picker", () => {
  it("lists every language in its own script and switches the page", async () => {
    renderWithProviders(<Nav onStart={vi.fn()} />);
    const picker = screen.getByRole("combobox", { name: "Language" });
    expect(screen.getByRole("option", { name: "తెలుగు" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ગુજરાતી" })).toBeInTheDocument();

    await userEvent.selectOptions(picker, "ta-IN");
    expect(useLocaleStore.getState().locale).toBe("ta-IN");
    expect(screen.getAllByRole("link", { name: "எப்படி வேலை செய்கிறது" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole("navigation", { name: "முதன்மை மெனு" })).toBeInTheDocument();

    // A value outside the list (an edited DOM) changes nothing.
    fireEvent.change(picker, { target: { value: "xx" } });
    expect(useLocaleStore.getState().locale).toBe("ta-IN");
  });
});

describe("hero greeting", () => {
  it("shows no duplicate translation of the Telugu example on a Telugu page", () => {
    useLocaleStore.setState({ locale: "te-IN" });
    render(<Hero onStart={vi.fn()} />);
    expect(screen.getAllByText(/రాజమండ్రిలో నా శాకాహార/)).toHaveLength(1);
  });

  it("opens with the visitor's own greeting", () => {
    useLocaleStore.setState({ locale: "kn-IN" });
    render(<Hero onStart={vi.fn()} />);
    expect(screen.getByText("ನಮಸ್ಕಾರ")).toBeInTheDocument();
    expect(screen.getByText(/ರಾಜಮಂಡ್ರಿಯಲ್ಲಿರುವ/)).toBeInTheDocument(); // translated example request
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಒಂದು ವೆಬ್‌ಸೈಟ್ ಬೇಕು.",
    );
  });
});

describe("studio in the owner's language", () => {
  it("says what the running tool is doing, and the welcome follows a language change live", () => {
    const state = {
      ...initialSession("Namaste!", "studio.welcome"),
      busy: true,
      steps: [{ id: "1", tool: "save_draft", label: "Building store", status: "running" as const }],
    };
    const session: LaunchSession = {
      state,
      lang: "en-IN",
      photos: [],
      send: vi.fn(() => Promise.resolve()),
      addPhotos: vi.fn(() => Promise.resolve()),
      removePhoto: vi.fn(),
      approve: vi.fn(() => Promise.resolve()),
      note: vi.fn(),
      setCelebrate: vi.fn(),
      failed: false,
      serverVoice: false,
      retry: vi.fn(() => Promise.resolve()),
    };
    renderWithProviders(<Studio session={session} ref={createRef()} />);

    expect(screen.getAllByText("Building your store").length).toBeGreaterThan(0);
    expect(screen.getByText(/Tell me about your business/)).toBeInTheDocument();

    act(() => {
      useLocaleStore.getState().setLocale("hi-IN");
    });
    expect(screen.getAllByText("आपका स्टोर बना रहा है").length).toBeGreaterThan(0);
    expect(screen.getByText(/अपने काम के बारे में बताइए/)).toBeInTheDocument();
  });

  it("offers Try again after a failed turn", async () => {
    const retry = vi.fn(() => Promise.resolve());
    const session: LaunchSession = {
      state: initialSession("hi"),
      lang: "en-IN",
      photos: [],
      send: vi.fn(() => Promise.resolve()),
      addPhotos: vi.fn(() => Promise.resolve()),
      removePhoto: vi.fn(),
      approve: vi.fn(() => Promise.resolve()),
      note: vi.fn(),
      setCelebrate: vi.fn(),
      failed: true,
      serverVoice: false,
      retry,
    };
    renderWithProviders(<Studio session={session} ref={createRef()} />);
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("navigation", () => {
  it("opens the mobile menu, closes it on a link, and starts from the menu button", async () => {
    const onStart = vi.fn();
    renderWithProviders(<Nav onStart={onStart} />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getAllByRole("link", { name: "Features" }).at(-1)!);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    const ctas = screen.getAllByRole("button", { name: "Create my website" });
    await userEvent.click(ctas.at(-1)!);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("links to Examples only when real stores exist", async () => {
    server.use(http.get("*/api/sites", () => HttpResponse.json([])));
    const { unmount } = renderWithProviders(<Nav onStart={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("link", { name: "Examples" })).not.toBeInTheDocument();
    unmount();
    server.use(
      http.get("*/api/sites", () =>
        HttpResponse.json([
          { slug: "a", name: "A", tagline: "t", url: "https://a.vaanilaunch.in" },
        ]),
      ),
    );
    renderWithProviders(<Nav onStart={vi.fn()} />);
    expect(await screen.findByRole("link", { name: "Examples" })).toHaveAttribute(
      "href",
      "#stores",
    );
  });

  it("asks the agent to undo the last change from the studio", async () => {
    useManageStore.getState().setCreds({ slug: "lakshmi-tiffins", key: "secret" });
    const send = vi.fn(() => Promise.resolve());
    const session: LaunchSession = {
      state: initialSession("hi"),
      lang: "en-IN",
      photos: [],
      send,
      addPhotos: vi.fn(() => Promise.resolve()),
      removePhoto: vi.fn(),
      approve: vi.fn(() => Promise.resolve()),
      note: vi.fn(),
      setCelebrate: vi.fn(),
      failed: false,
      serverVoice: false,
      retry: vi.fn(() => Promise.resolve()),
    };
    renderWithProviders(<Studio session={session} ref={createRef()} />);
    expect(screen.getByText("Quick changes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Undo last change/ }));
    expect(send).toHaveBeenCalledWith("Undo the last change, please.");
    useManageStore.getState().clear();
  });
});
