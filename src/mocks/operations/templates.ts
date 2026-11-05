import type { MockShiftTemplate } from "../db/types"
import type { MockTenant } from "../tenancy/tenants"

/** Kiracının varsayılan vardiya şablonları (plan §Batch 2.1) */
export function buildShiftTemplates(tenant: MockTenant): MockShiftTemplate[] {
  const slug = tenant.slug
  const id = (key: string) => `tpl-${slug}-${key}`
  const base = { tenantId: slug, isActive: true, rotation: null }
  return [
    {
      ...base,
      id: id("sabah"),
      code: "S",
      name: "Sabah",
      kind: "standard",
      segments: [{ start: "07:00", end: "15:00" }],
      breakMinutes: 30,
      color: "sky",
    },
    {
      ...base,
      id: id("aksam"),
      code: "A",
      name: "Akşam",
      kind: "standard",
      segments: [{ start: "15:00", end: "23:00" }],
      breakMinutes: 30,
      color: "amber",
    },
    {
      ...base,
      id: id("gece"),
      code: "G",
      name: "Gece",
      kind: "standard",
      segments: [{ start: "23:00", end: "07:00" }],
      breakMinutes: 30,
      color: "indigo",
    },
    {
      ...base,
      id: id("parcali"),
      code: "P",
      name: "Parçalı (sabah + akşam)",
      kind: "split",
      segments: [
        { start: "07:00", end: "11:00" },
        { start: "16:00", end: "20:00" },
      ],
      breakMinutes: 0,
      color: "emerald",
    },
    {
      ...base,
      id: id("gunduz12"),
      code: "G12",
      name: "Gündüz 12 saat",
      kind: "standard",
      segments: [{ start: "07:00", end: "19:00" }],
      breakMinutes: 60,
      color: "rose",
    },
    {
      ...base,
      id: id("gece12"),
      code: "Ge12",
      name: "Gece 12 saat",
      kind: "standard",
      segments: [{ start: "19:00", end: "07:00" }],
      breakMinutes: 60,
      color: "slate",
    },
    {
      ...base,
      id: id("rotasyon"),
      code: "R6",
      name: "12 saat 2 gündüz – 2 gece – 2 izin",
      kind: "rotation",
      segments: [],
      breakMinutes: 0,
      color: "slate",
      rotation: [
        { kind: "shift", templateId: id("gunduz12") },
        { kind: "shift", templateId: id("gunduz12") },
        { kind: "shift", templateId: id("gece12") },
        { kind: "shift", templateId: id("gece12") },
        { kind: "off" },
        { kind: "off" },
      ],
    },
  ]
}
