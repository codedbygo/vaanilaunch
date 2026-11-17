import { agentEventSchema, type AgentEvent } from "./schemas";

/**
 * createSseParser turns chunks of a text/event-stream body into validated agent events.
 * Chunks can split an event anywhere, so it buffers until the blank line that ends one.
 * A malformed event is skipped rather than ending the whole conversation.
 */
export function createSseParser(onEvent: (event: AgentEvent) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      let json: unknown;
      try {
        json = JSON.parse(part.slice(6));
      } catch {
        continue;
      }
      const parsed = agentEventSchema.safeParse(json);
      if (parsed.success) onEvent(parsed.data);
    }
  };
}
