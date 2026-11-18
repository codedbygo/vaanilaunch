import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useT, type MessageKey } from "@/lib/i18n";

import {
  asKey,
  contactFormSchema,
  contactResultSchema,
  type ContactForm as Values,
} from "../schemas";

type Errors = Partial<Record<keyof Values, MessageKey>>;

// Messages go to the platform's mailbox through POST /api/contact.
export function ContactForm() {
  const [errors, setErrors] = useState<Errors>({});
  const { t } = useT();
  const send = useMutation({
    mutationFn: (v: Values) =>
      apiFetch("/api/contact", contactResultSchema, { method: "POST", body: JSON.stringify(v) }),
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = contactFormSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      const name = asKey(fieldErrors.name?.[0]);
      const email = asKey(fieldErrors.email?.[0]);
      const message = asKey(fieldErrors.message?.[0]);
      setErrors({
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(message ? { message } : {}),
      });
      return;
    }
    setErrors({});
    send.mutate(parsed.data, {
      onSuccess: () => {
        form.reset();
      },
    });
  };

  const field = (name: keyof Values, label: MessageKey, control: ReactNode) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`contact-${name}`}>{t(label)}</Label>
      {control}
      {errors[name] && (
        <p id={`contact-${name}-error`} className="text-sm text-destructive">
          {t(errors[name])}
        </p>
      )}
    </div>
  );
  const describedBy = (name: keyof Values) => (errors[name] ? `contact-${name}-error` : undefined);

  return (
    <section
      id="contact"
      className="mx-auto grid max-w-6xl items-start gap-8 px-4 pt-16 sm:px-12 sm:pt-24 md:grid-cols-2"
    >
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("contact.title")}</h2>
        <p className="mt-2.5 max-w-xl text-lg text-muted-foreground">{t("contact.sub")}</p>
      </div>
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-3 rounded-2xl bg-card p-6 shadow-soft"
      >
        {field(
          "name",
          "contact.name",
          <Input
            id="contact-name"
            name="name"
            maxLength={100}
            aria-invalid={!!errors.name}
            aria-describedby={describedBy("name")}
          />,
        )}
        {field(
          "email",
          "contact.email",
          <Input
            id="contact-email"
            name="email"
            type="email"
            aria-invalid={!!errors.email}
            aria-describedby={describedBy("email")}
          />,
        )}
        {field(
          "message",
          "contact.message",
          <Textarea
            id="contact-message"
            name="message"
            rows={4}
            maxLength={5000}
            aria-invalid={!!errors.message}
            aria-describedby={describedBy("message")}
          />,
        )}
        <Button
          type="submit"
          disabled={send.isPending}
          className="rounded-full bg-brand text-white shadow-brand"
        >
          {send.isPending ? t("contact.sending") : t("contact.send")}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {send.isSuccess && t("contact.sent")}
          {send.isError && t("contact.failed")}
        </p>
      </form>
    </section>
  );
}
