import { z } from "zod"

/** Seçim kutuları için sunucu taraflı arama yanıtı (`/…/options?q=`) */
export const optionListSchema = z.object({
  items: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      description: z.string().optional(),
    })
  ),
})
export type OptionList = z.infer<typeof optionListSchema>
