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
    const end = buffer.lastIndexOf("\n\n");
    if (end === -1) return;
    const complete = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    for (const part of complete.split("\n\n")) {
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
