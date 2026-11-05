import { z } from "zod"

/**
 * Yetki kataloğu. Roller bu yetkilerin kümesidir; kiracı sistem rollerini şablon olarak
 * kullanır veya özel rol tanımlar. Hassas yetkiler özel role atanamaz.
 */
export const PERMISSION_GROUPS = [
  {
    id: "master-data",
    label: "Ana veri",
    permissions: [
      { id: "personnel:read", label: "Personeli görüntüle" },
      { id: "personnel:write", label: "Personel ekle ve düzenle" },
      { id: "location:read", label: "Lokasyonları görüntüle" },
      { id: "location:write", label: "Lokasyon ekle ve düzenle" },
      { id: "location:tags", label: "QR/NFC etiketlerini yönet" },
      { id: "customer:read", label: "Müşterileri görüntüle" },
      { id: "customer:write", label: "Müşteri ekle ve düzenle" },
      { id: "import:run", label: "Excel'den içe aktar" },
    ],
  },
  {
    id: "organization",
    label: "Organizasyon ve ayarlar",
    permissions: [
      { id: "org:read", label: "Organizasyonu ve tüzel kişilikleri görüntüle" },
      { id: "org:write", label: "Organizasyonu ve tüzel kişilikleri düzenle" },
      { id: "user:read", label: "Kullanıcıları görüntüle" },
      { id: "user:write", label: "Kullanıcı davet et ve düzenle" },
      { id: "role:write", label: "Rolleri yönet" },
      { id: "tenant:settings", label: "Firma ayarlarını düzenle" },
      { id: "audit:read", label: "Denetim kayıtlarını görüntüle" },
    ],
  },
  {
    id: "operations",
    label: "Saha operasyonu",
    permissions: [
      { id: "schedule:read", label: "Vardiya planını görüntüle" },
      { id: "schedule:write", label: "Vardiya planla" },
      { id: "attendance:read", label: "Yoklamayı görüntüle" },
      { id: "attendance:correct", label: "Yoklama düzelt" },
      { id: "alarm:respond", label: "Alarmlara müdahale et" },
      { id: "alarm:escalate", label: "Alarm eskalasyonu" },
      { id: "leave:read", label: "İzin ve raporları görüntüle" },
      { id: "leave:request", label: "Personel adına izin talebi gir" },
      { id: "leave:approve", label: "İzin talebini onayla veya reddet" },
    ],
  },
  {
    id: "timesheet",
    label: "Puantaj ve bordro",
    permissions: [
      { id: "timesheet:read", label: "Puantajı görüntüle" },
      { id: "timesheet:approve_region", label: "Puantaj bölge onayı" },
      { id: "timesheet:approve_hr", label: "Puantaj İK onayı" },
      {
        id: "timesheet:approve_customer",
        label: "Puantajı müşteri adına onayla (portal)",
      },
      { id: "payroll:export", label: "Bordro dışa aktar" },
      { id: "payroll:profiles", label: "Bordro aktarım profillerini yönet" },
    ],
  },
  {
    id: "contracts",
    label: "Sözleşme ve hakediş",
    permissions: [
      { id: "contract:read", label: "Sözleşmeleri görüntüle" },
      { id: "contract:write", label: "Sözleşme düzenle" },
      { id: "progress_payment:read", label: "Hakedişi görüntüle" },
      { id: "progress_payment:approve", label: "Hakediş onayla" },
    ],
  },
  {
    id: "quality",
    label: "Kalite ve iş emirleri",
    permissions: [
      { id: "quality:read", label: "Denetimleri görüntüle" },
      { id: "quality:write", label: "Denetim şablonu ve planı düzenle" },
      { id: "work_order:read", label: "İş emirlerini görüntüle" },
      { id: "work_order:write", label: "İş emri yönet" },
    ],
  },
  {
    id: "inventory",
    label: "Stok ve zimmet",
    permissions: [
      { id: "inventory:read", label: "Stok ve zimmeti görüntüle" },
      { id: "inventory:write", label: "Stok hareketi ve zimmet" },
    ],
  },
  {
    id: "ohs",
    label: "İSG ve özlük",
    permissions: [
      { id: "ohs:read", label: "İSG eğitim ve sertifikaları görüntüle" },
      { id: "ohs:write", label: "İSG kayıtlarını düzenle" },
      { id: "personnel_file:read", label: "Dijital özlük dosyası" },
      { id: "health:read", label: "Sağlık verisi görüntüle (özel nitelikli)" },
      { id: "health:write", label: "Sağlık verisi düzenle (özel nitelikli)" },
    ],
  },
] as const

type TenantPermission =
  (typeof PERMISSION_GROUPS)[number]["permissions"][number]["id"]

/** Yalnızca Puantio işletmecisinin platform rollerinde bulunur */
export const PLATFORM_PERMISSIONS = [
  "platform:tenants",
  "platform:support",
] as const

export type Permission =
  TenantPermission | (typeof PLATFORM_PERMISSIONS)[number]

export const TENANT_PERMISSIONS: readonly TenantPermission[] =
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map((item) => item.id))

export const ALL_PERMISSIONS: readonly Permission[] = [
  ...TENANT_PERMISSIONS,
  ...PLATFORM_PERMISSIONS,
]

/** KVKK özel nitelikli veri: yalnızca sistem rolüne (İSG uzmanı) bağlanabilir */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = [
  "health:read",
  "health:write",
]

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.map((item) => [item.id, item.label])
  )
)

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value)
}

export const permissionSchema = z.string().refine(isPermission)

/** Bilinmeyen yetkiler (yeni sürümde eklenmiş) sessizce yok sayılır */
export const permissionListSchema = z
  .array(z.string())
  .transform((items) => items.filter(isPermission))
