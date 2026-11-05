import { describe, expect, it } from "vitest"

import {
  buildOrgTree,
  descendantIds,
  orgUnitPath,
  type OrgUnit,
} from "@/entities/org-unit"
import { can, permissionListSchema } from "@/entities/session"
import {
  applyBranding,
  buildTenantUrl,
  buildTerms,
  documentTitle,
  hasModule,
  resolveTenantSlug,
  tenantConfigSchema,
  tenantInitials,
} from "@/entities/tenant"
import { buildMockTenants, toTenantConfig } from "@/mocks/tenancy/tenants"

const tenant = toTenantConfig(buildMockTenants()[0]!)

describe("kiracı yapılandırması", () => {
  it("alt alan adından kiracı çözülür, aksi halde varsayılan", () => {
    const options = { baseDomain: "puantio.com", fallback: "demo" }
    expect(
      resolveTenantSlug({ hostname: "lavanta.puantio.com", ...options })
    ).toBe("lavanta")
    expect(
      resolveTenantSlug({ hostname: "LAVANTA.Puantio.com", ...options })
    ).toBe("lavanta")
    expect(resolveTenantSlug({ hostname: "a.b.puantio.com", ...options })).toBe(
      "demo"
    )
    expect(resolveTenantSlug({ hostname: "localhost", ...options })).toBe(
      "demo"
    )
    expect(buildTenantUrl("lavanta", "puantio.com")).toBe(
      "https://lavanta.puantio.com/"
    )
  })

  it("mock kiracılar sözleşmeye uyar; bilinmeyen modüller yok sayılır", () => {
    for (const mock of buildMockTenants()) {
      expect(tenantConfigSchema.safeParse(toTenantConfig(mock)).success).toBe(
        true
      )
    }
    const parsed = tenantConfigSchema.parse({
      ...tenant,
      modules: ["core", "yeni-modul"],
    })
    expect(parsed.modules).toEqual(["core"])
  })

  it("geofence varsayılanı sınır dışındaysa yapılandırma reddedilir", () => {
    const result = tenantConfigSchema.safeParse({
      ...tenant,
      rules: { ...tenant.rules, geofence: { min: 50, max: 100, default: 500 } },
    })
    expect(result.success).toBe(false)
  })

  it("modül kontrolü: çekirdek her zaman açık", () => {
    expect(hasModule({ ...tenant, modules: [] }, "core")).toBe(true)
    expect(hasModule({ ...tenant, modules: ["core"] }, "contracts")).toBe(false)
  })

  it("terminoloji ve baş harfler", () => {
    const terms = buildTerms(tenant.terminology)
    expect(terms.lower(terms.location)).toBe("lokasyon")
    expect(terms.lower(terms.location, true)).toBe("lokasyonlar")
    expect(
      buildTerms({
        ...tenant.terminology,
        location: { singular: "İşyeri", plural: "İşyerleri" },
      }).lower({ singular: "İşyeri", plural: "İşyerleri" })
    ).toBe("işyeri")
    expect(tenantInitials("Lavanta Tesis Hizmetleri")).toBe("LT")
  })

  it("TC-1.0-06 marka uygulanır; düşük kontrastlı renk uygulanmaz, geri alınabilir", () => {
    const root = document.createElement("div")
    const cleanup = applyBranding(tenant, root)
    expect(root.style.getPropertyValue("--primary")).toBe("#5b21b6")
    expect(root.dataset.tenant).toBe("temizlik-orta")
    expect(document.title).toBe(documentTitle(tenant))
    expect(document.title).toBe("Lavanta · Puantio")
    cleanup()
    expect(root.style.getPropertyValue("--primary")).toBe("")

    const pale = {
      ...tenant,
      branding: { ...tenant.branding, primaryColor: "#fde047" },
    }
    applyBranding(pale, root)
    expect(root.style.getPropertyValue("--primary")).toBe("")
  })
})

describe("organizasyon ağacı", () => {
  const unit = (id: string, parentId: string | null, level: number): OrgUnit =>
    ({
      id,
      parentId,
      level,
      code: id.toUpperCase(),
      name: `Birim ${id}`,
      isActive: true,
      locationCount: 0,
    }) as OrgUnit
  const units = [
    unit("b", null, 0),
    unit("a", null, 0),
    unit("a1", "a", 1),
    unit("a2", "a", 1),
  ]

  it("ağaç, yol ve alt birimler", () => {
    const tree = buildOrgTree(units)
    expect(tree.map((node) => node.id)).toEqual(["a", "b"])
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["a1", "a2"])
    expect(orgUnitPath(units, "a2")).toBe("Birim a / Birim a2")
    expect([...descendantIds(units, "a")].sort()).toEqual(["a", "a1", "a2"])
  })
})

describe("yetki", () => {
  it("bilinmeyen yetkiler süzülür; herhangi biri yeterli", () => {
    const permissions = permissionListSchema.parse([
      "personnel:read",
      "gelecek:yetki",
    ])
    expect(permissions).toEqual(["personnel:read"])
    expect(can({ permissions }, "personnel:read")).toBe(true)
    expect(can({ permissions }, ["health:read", "personnel:read"])).toBe(true)
    expect(can({ permissions }, "health:read")).toBe(false)
    expect(can(null, "personnel:read")).toBe(false)
  })
})
