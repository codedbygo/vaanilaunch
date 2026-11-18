import { useEffect, useRef } from "react";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { ChatMessage } from "../session";
import { RichText } from "./RichText";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  /** What the agent is doing now, already in the owner's language. */
  activity: string | undefined;
}

export function ChatPanel({ messages, busy, activity }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  // Keep the newest message in view: a sync with the DOM, not derived state.
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label={t("chat.label")}
      className="flex max-h-120 min-h-80 flex-1 flex-col gap-2.5 overflow-auto p-0.5"
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            "max-w-5/6 rounded-2xl px-4 py-2.5 text-base break-words whitespace-pre-wrap",
            m.role === "me"
              ? "self-end rounded-br-md bg-primary text-primary-foreground"
              : "self-start rounded-bl-md bg-secondary",
          )}
        >
          {m.images && m.images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {m.images.map((u) => (
                <img
                  key={u}
                  src={u}
                  alt=""
                  className="size-14 rounded-lg border-2 border-white/30 object-cover"
                />
              ))}
            </div>
          )}
          {m.i18nKey ? t(m.i18nKey) : m.role === "bot" ? <RichText text={m.text} /> : m.text}
        </div>
      ))}
      {busy && (
        <div
          role="status"
          className="flex items-center gap-2.5 self-start rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-muted-foreground"
        >
          <span className="inline-flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((d) => (
              <i
                key={d}
                className="size-1.5 animate-bounce rounded-full bg-saffron"
                style={{ animationDelay: `${String(d * 150)}ms` }}
              />
            ))}
          </span>
          {activity ?? t("chat.thinking")}
        </div>
      )}
    </div>
  );
}
