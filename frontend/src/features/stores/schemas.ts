import { z } from "zod";

export const storeCardSchema = z.object({
  slug: z.string(),
  name: z.string().nullable(),
  tagline: z.string().nullable(),
  city: z.string().nullable().optional(),
  url: z.string(),
  color: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  languages: z.array(z.string().nullable()).optional(),
});
export type StoreCard = z.infer<typeof storeCardSchema>;

export const storeListSchema = z.array(storeCardSchema);
