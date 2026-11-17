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
  orders: z.array(orderSchema),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
