import { z } from "zod";

export const orderStatusSchema = z.enum(["pending_payment", "paid", "delivered", "cancelled"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderSchema = z.object({
  ref: z.string(),
  status: orderStatusSchema,
  total: z.number(),
  items: z.array(z.object({ name: z.string().nullable(), qty: z.number() })),
  customer: z.object({ name: z.string(), phone: z.string(), note: z.string().optional() }),
});
export type Order = z.infer<typeof orderSchema>;

export const dashboardSchema = z.object({
  slug: z.string(),
  name: z.string().nullable(),
  status: z.enum(["draft", "live"]),
  url: z.string(),
  products: z.number(),
  preview_token: z.string(),
  owner_email: z.string().nullable().optional(),
  owner_email_verified: z.boolean().optional(),
  orders: z.array(orderSchema),
  // What the store really has; older servers don't send it.
  checklist: z
    .array(
      z.object({
        key: z.enum([
          "name",
          "description",
          "photos",
          "phone",
          "hours",
          "location",
          "seo_title",
          "seo_description",
          "published",
        ]),
        done: z.boolean(),
      }),
    )
    .optional(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
