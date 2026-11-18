import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { dashboard, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { Dashboard } from "./Dashboard";

const creds = { slug: "lakshmi-tiffins", key: "secret" };

describe("Dashboard", () => {
  it("shows the store, its orders, and marks an order paid", async () => {
    let posted: unknown;
    server.use(
      http.post("*/api/manage/orders/:ref", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ ...dashboard.orders[0], status: "paid" });
      }),
    );
    renderWithProviders(<Dashboard creds={creds} />);
    expect(screen.getByRole("status", { name: "Loading your store" })).toBeInTheDocument();

    expect(await screen.findByText("Lakshmi Tiffins")).toBeInTheDocument();
    expect(screen.getByText("LT-1001")).toBeInTheDocument();
    expect(screen.getByText("Payment pending")).toBeInTheDocument();
    expect(screen.getByText("Idli batter × 1, Mango pickle × 1")).toBeInTheDocument();

    server.use(
      http.post("*/api/manage", () =>
        HttpResponse.json({ ...dashboard, orders: [{ ...dashboard.orders[0], status: "paid" }] }),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /money received/i }));
    await waitFor(() => {
      expect(posted).toEqual({ slug: "lakshmi-tiffins", key: "secret", status: "paid" });
    });
    expect(await screen.findByRole("button", { name: /mark delivered/i })).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    server.use(
      http.post("*/api/manage", () =>
        HttpResponse.json({ ...dashboard, status: "draft", orders: [] }),
      ),
    );
    renderWithProviders(<Dashboard creds={creds} />);
    expect(await screen.findByText(/no orders yet/i)).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    server.use(
      http.post("*/api/manage", () =>
        HttpResponse.json({ detail: "Invalid manage link" }, { status: 403 }),
      ),
    );
    renderWithProviders(<Dashboard creds={creds} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your store/i);
    server.use(http.post("*/api/manage", () => HttpResponse.json(dashboard)));
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("LT-1001")).toBeInTheDocument();
  });
});
