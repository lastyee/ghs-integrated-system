import { z } from "zod";

export const studentProfileUpdateSchema = z.object({
  phone: z.string().trim().max(30, "Nomor HP maksimal 30 karakter").nullable().optional(),
  address: z.string().trim().max(255, "Alamat maksimal 255 karakter").nullable().optional(),
}).strict();

export type StudentProfileUpdateInput = z.infer<typeof studentProfileUpdateSchema>;
