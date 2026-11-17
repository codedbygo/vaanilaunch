import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { Showcase } from "./Showcase";

describe("Showcase", () => {
  it("lists live stores and refuses non-http links", async () => {
    server.use(
      http.get("*/api/sites", () =>
        HttpResponse.json([
          {
            slug: "a",
            name: "Lakshmi Tiffins",
            tagline: "Taste of home",
            city: "Vijayawada",
            url: "https://a.vaani.in",
            languages: ["తెలుగు", "English"],
            image: "/media/x.jpg",
          },
          { slug: "b", name: "Bad", tagline: null, url: "javascript:alert(1)", image: null },
        ]),
      ),
    );
    renderWithProviders(<Showcase />);
    const link = await screen.findByRole("link", { name: /lakshmi tiffins/i });
    expect(link).toHaveAttribute("href", "https://a.vaani.in");
    expect(screen.getByText("Vijayawada — తెలుగు · English")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /bad/i })).toHaveAttribute("href", "#");
  });

  it("renders nothing when no store is live yet", async () => {
    const { container } = renderWithProviders(<Showcase />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
