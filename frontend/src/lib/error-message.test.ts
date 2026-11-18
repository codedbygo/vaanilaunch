import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { errorKey } from "@/lib/error-message";

describe("errorKey", () => {
  it("maps each status the API documents to a catalog message, never the log text", () => {
    const http = (status: number) => new ApiError("http", status, `POST /x: ${String(status)}`);
    expect(errorKey(new ApiError("network", 0, "offline"))).toBe("error.network");
    expect(errorKey(http(429))).toBe("error.tooMany");
    expect(errorKey(http(409))).toBe("error.busy");
    expect(errorKey(http(428))).toBe("error.reload");
    expect(errorKey(http(403))).toBe("error.forbidden");
    expect(errorKey(http(400))).toBe("error.badPhoto");
    expect(errorKey(http(413))).toBe("error.badPhoto");
  });

  it("gives the generic message for an unknown status and for anything that is not an ApiError", () => {
    expect(errorKey(new ApiError("http", 503, "down"))).toBe("error.generic");
    expect(errorKey(new Error("boom"))).toBe("error.generic");
    expect(errorKey("weird")).toBe("error.generic");
  });
});
