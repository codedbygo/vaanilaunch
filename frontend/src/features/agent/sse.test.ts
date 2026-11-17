import { describe, expect, it } from "vitest";

import type { AgentEvent } from "./schemas";
import { createSseParser } from "./sse";

describe("createSseParser", () => {
  it("reassembles events split across chunks and skips malformed ones", () => {
    const got: AgentEvent[] = [];
    const feed = createSseParser((e) => got.push(e));
    const step = { id: "t1", tool: "check_slug", label: "Reserving", status: "running" };

    feed('data: {"type":"message","da');
    feed('ta":"Namaste"}\n\ndata: not json\n\n');
    feed(`data: ${JSON.stringify({ type: "step", data: step })}\n\n`);
    feed('data: {"type":"unknown","data":1}\n\n: comment line\n\n');
    feed('data: {"type":"done","data":null}\n\n');

    expect(got).toEqual([
      { type: "message", data: "Namaste" },
      { type: "step", data: step },
      { type: "done", data: null },
    ]);
  });
});
