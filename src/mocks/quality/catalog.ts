import type { AreaType } from "@/entities/location"
import type { ServiceLine } from "@/entities/tenant"

import type { MockIssueCatalogEntry } from "../db/types"

const ALL_INDOOR: AreaType[] = [
  "office",
  "corridor",
  "kitchen",
  "dining",
  "meeting",
  "lobby",
  "patient_room",
]

const entry = (
  code: string,
  label: string,
  serviceLine: ServiceLine,
  areaTypes: AreaType[],
  priority: MockIssueCatalogEntry["priority"] = "normal"
): MockIssueCatalogEntry => ({
  code,
  label,
  serviceLine,
  areaTypes,
  priority,
  isActive: true,
})

/**
 * Varsayılan sorun kataloğu (alan tipi × hizmet hattı). Kiracı düzenler; QR sayfası yalnızca
 * alanın tipine ve lokasyonun hizmet hatlarına uyan etkin maddeleri gösterir.
 */
export const DEFAULT_ISSUE_CATALOG: MockIssueCatalogEntry[] = [
  entry("paper_towel", "Kağıt havlu bitti", "cleaning", ["restroom"], "high"),
  entry("toilet_paper", "Tuvalet kağıdı yok", "cleaning", ["restroom"], "high"),
  entry("soap", "Sabun yok", "cleaning", ["restroom", "kitchen"], "high"),
  entry(
    "dirty",
    "Kirli",
    "cleaning",
    ["restroom", ...ALL_INDOOR, "parking"],
    "normal"
  ),
  entry("odor", "Kötü koku", "cleaning", ["restroom", "kitchen", "dining"]),
  entry("trash_full", "Çöp kutusu dolu", "cleaning", [
    "restroom",
    ...ALL_INDOOR,
    "outdoor",
    "parking",
  ]),
  entry(
    "wet_floor",
    "Zemin ıslak / kaygan",
    "cleaning",
    ["restroom", "corridor", "lobby", "kitchen"],
    "urgent"
  ),
  entry(
    "lighting",
    "Aydınlatma arızası",
    "technical",
    ["restroom", ...ALL_INDOOR, "parking", "technical"],
    "high"
  ),
  entry("hvac", "Klima / ısıtma arızası", "technical", ALL_INDOOR, "high"),
  entry(
    "water_leak",
    "Su kaçağı",
    "technical",
    ["restroom", "kitchen", "technical"],
    "urgent"
  ),
  entry("plumbing", "Musluk / sifon arızası", "technical", [
    "restroom",
    "kitchen",
  ]),
  entry(
    "garden_care",
    "Çim / bitki bakımı gerekli",
    "landscaping",
    ["outdoor"],
    "low"
  ),
  entry("irrigation", "Sulama arızası", "landscaping", ["outdoor"]),
  entry(
    "pest",
    "Haşere görüldü",
    "pest_control",
    ["restroom", "kitchen", "dining", "outdoor"],
    "high"
  ),
  entry(
    "security_issue",
    "Güvenlik sorunu",
    "security",
    ["lobby", "parking", "checkpoint", "outdoor"],
    "urgent"
  ),
  entry(
    "other",
    "Diğer",
    "cleaning",
    [
      "restroom",
      ...ALL_INDOOR,
      "parking",
      "outdoor",
      "technical",
      "checkpoint",
      "other",
    ],
    "low"
  ),
]
