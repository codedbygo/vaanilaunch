import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

import { contactFormSchema, contactResultSchema, type ContactForm as Values } from "../schemas";

type Errors = Partial<Record<keyof Values, string>>;

// Messages go to the platform's Titan mailbox through POST /api/contact.
export function ContactForm() {
  const [errors, setErrors] = useState<Errors>({});
  const send = useMutation({
    mutationFn: (v: Values) =>
      apiFetch("/api/contact", contactResultSchema, { method: "POST", body: JSON.stringify(v) }),
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = contactFormSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name" || field === "email" || field === "message")
          next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    send.mutate(parsed.data, {
      onSuccess: () => {
        form.reset();
      },
    });
  };

  const field = (name: keyof Values, label: string, control: ReactNode) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`contact-${name}`}>{label}</Label>
      {control}
      {errors[name] && (
        <p id={`contact-${name}-error`} className="text-sm text-destructive">
          {errors[name]}
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
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Talk to us</h2>
        <p className="mt-2.5 max-w-xl text-lg text-muted-foreground">
          Questions, partnerships, or want VaaniLaunch for your self-help group? Messages go
          straight to our Titan mailbox.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-3 rounded-2xl bg-card p-6 shadow-soft"
      >
        {field(
          "name",
          "Your name",
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
          "Email",
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
          "Message",
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
          {send.isPending ? "Sending…" : "Send message"}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {send.isSuccess && "Thanks! We will reply soon."}
          {send.isError && "Could not send right now. Please try again later."}
        </p>
      </form>
    </section>
  );
}
