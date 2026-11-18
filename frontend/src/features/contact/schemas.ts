import { z } from "zod";

import { isMessageKey, type MessageKey } from "@/lib/i18n";

// Error messages are catalog keys; the form shows them in the visitor's language.
export const contactFormSchema = z.object({
  name: z.string().trim().min(1, "contact.error.name").max(100, "contact.error.name"),
  email: z.email("contact.error.email"),
  message: z.string().trim().min(1, "contact.error.message").max(5000, "contact.error.message"),
});
export type ContactForm = z.infer<typeof contactFormSchema>;

/** A field error as a catalog key; anything outside the catalog reads as the generic message. */
export const asKey = (msg: string | undefined): MessageKey | undefined =>
  msg === undefined ? undefined : isMessageKey(msg) ? msg : "error.generic";

export const contactResultSchema = z.object({ ok: z.literal(true) });
