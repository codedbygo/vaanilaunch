import { z } from "zod";

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.email("Please enter a valid email"),
  message: z.string().trim().min(1, "Please write a message").max(5000),
});
export type ContactForm = z.infer<typeof contactFormSchema>;

export const contactResultSchema = z.object({ ok: z.literal(true) });
