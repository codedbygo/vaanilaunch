import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { ContactForm } from "./ContactForm";

describe("ContactForm", () => {
  it("shows field errors, then sends a valid message", async () => {
    let sent: unknown;
    server.use(
      http.post("*/api/contact", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWithProviders(<ContactForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByText("Please enter your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText("Your name"), "Lakshmi");
    await user.type(screen.getByLabelText("Email"), "lakshmi@example.com");
    await user.type(screen.getByLabelText("Message"), "I want a store");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/thanks! we will reply soon/i)).toBeInTheDocument();
    expect(sent).toEqual({
      name: "Lakshmi",
      email: "lakshmi@example.com",
      message: "I want a store",
    });
    expect(screen.getByLabelText("Your name")).toHaveValue("");
  });

  it("says so when the mailbox is not reachable", async () => {
    server.use(
      http.post("*/api/contact", () =>
        HttpResponse.json({ detail: "Mail not configured" }, { status: 503 }),
      ),
    );
    renderWithProviders(<ContactForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your name"), "A");
    await user.type(screen.getByLabelText("Email"), "a@b.in");
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText(/could not send right now/i)).toBeInTheDocument();
  });
});
