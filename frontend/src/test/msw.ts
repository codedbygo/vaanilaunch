import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * Mock Service Worker for unit tests: one default handler per route the app calls.
 * An unhandled request fails the test. Tests that need another answer call server.use().
 */

/** An SSE body the way FastAPI streams it: one `data:` line per event, then done. */
export function sse(events: unknown[]): Response {
  const body = [...events, { type: "done", data: null }]
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("");
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

export const dashboard = {
  slug: "lakshmi-tiffins",
  name: "Lakshmi Tiffins",
  status: "live",
  url: "http://localhost:8000/s/lakshmi-tiffins",
  products: 3,
  orders: [
    {
      ref: "LT-1001",
      status: "pending_payment",
      total: 230,
      items: [
        { name: "Idli batter", qty: 1 },
        { name: "Mango pickle", qty: 1 },
      ],
      customer: { name: "Ravi", phone: "9000000001", note: "" },
    },
  ],
};

export const handlers = [
  http.get("*/api/sites", () => HttpResponse.json([])),
  http.get("*/api/manage", () => HttpResponse.json(dashboard)),
  http.post("*/api/manage/orders/:ref", async ({ params, request }) => {
    const body = (await request.json()) as { status: string };
    return HttpResponse.json({ ...dashboard.orders[0], ref: params.ref, status: body.status });
  }),
  http.post("*/api/agent", () => sse([{ type: "message", data: "Hello from the agent" }])),
  http.post("*/api/approve", () => HttpResponse.json({ approved: true })),
  http.post("*/api/upload", () =>
    HttpResponse.json({ id: "0123456789abcdef", url: "/media/0123456789abcdef.jpg" }),
  ),
  http.post("*/api/contact", () => HttpResponse.json({ ok: true })),
];

export const server = setupServer(...handlers);
