import { describe, expect, it } from "vitest"
import { z } from "zod"

import { meSchema } from "@/entities/session"
import { ApiError } from "@/shared/api/errors"
import { configureHttp, http } from "@/shared/api/http"

import { identityFor } from "./auth/identities"
import { mintMockToken, parseMockToken } from "./auth/token"
import { mockClock } from "./clock"
import { db } from "./db"

const any = z.unknown()

function signIn(
  tenant: string,
  user: string,
  extraHeaders: Record<string, string> = {}
) {
  const identity = identityFor(tenant, user)
  const token = mintMockToken({
    organization: identity.organization,
    userId: identity.userId,
    expiresAt: Date.now() + 3_600_000,
  })
  configureHttp({ getAccessToken: () => token, getHeaders: () => extraHeaders })
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((caught: unknown) => caught)
  if (!(error instanceof ApiError)) throw new Error("ApiError bekleniyordu")
  return error
}

describe("Faz 1 mock API sözleşmeleri", () => {
  it("token biçimi ve doğrulama hataları", async () => {
    expect(parseMockToken("mock.a.b.1")).toEqual({
      organization: "a",
      userId: "b",
      expiresAt: 1,
    })
    expect(parseMockToken("bozuk")).toBeNull()
    configureHttp({ getAccessToken: () => null })
    expect((await failure(http.get("/me", any))).status).toBe(401)
    configureHttp({
      getAccessToken: () =>
        mintMockToken({
          organization: "temizlik-orta",
          userId: "u-temizlik-orta-admin",
          expiresAt: mockClock.now().getTime() - 1,
        }),
    })
    expect((await failure(http.get("/me", any))).code).toBe("TOKEN_EXPIRED")
    configureHttp({
      getAccessToken: () =>
        mintMockToken({
          organization: "yok",
          userId: "x",
          expiresAt: Date.now() + 60_000,
        }),
    })
    expect((await failure(http.get("/me", any))).status).toBe(404)
  })

  it("/me kiracı kullanıcısı ve platform personeli için sözleşmeye uyar", async () => {
    signIn("temizlik-orta", "bolge")
    const me = await http.get("/me", meSchema)
    expect(me.scope).toEqual({
      kind: "org_units",
      ids: ["ou-temizlik-orta-MAR"],
    })
    expect(me.permissions).toContain("timesheet:approve_region")
    signIn("platform", "destek")
    const agent = await http.get("/me", meSchema)
    expect(agent.isPlatformAdmin).toBe(true)
    expect(agent.permissions).toEqual(["platform:tenants", "platform:support"])
    signIn("platform", "destek", { "x-support-tenant": "guvenlik" })
    expect((await failure(http.get("/me", any))).code).toBe(
      "SUPPORT_SESSION_REQUIRED"
    )
  })

  it("yetkisiz uç 403, başka kiracının kaydı 404", async () => {
    signIn("temizlik-orta", "supervizor")
    expect((await failure(http.get("/users", any))).status).toBe(403)
    signIn("temizlik-orta", "admin")
    expect(
      (
        await failure(
          http.patch("/legal-entities/le-guvenlik-1", any, { body: {} })
        )
      ).status
    ).toBe(404)
    expect(
      (await failure(http.get("/locations/loc-guvenlik-1", any))).status
    ).toBe(404)
  })

  it("rol güncelleme ve silme kuralları", async () => {
    signIn("temizlik-orta", "admin")
    const role = await http.post("/roles", z.object({ id: z.string() }), {
      body: {
        name: "Gece amiri",
        description: null,
        permissions: ["attendance:read"],
      },
    })
    expect(
      (
        await failure(
          http.post("/roles", any, {
            body: {
              name: "gece AMİRİ",
              description: null,
              permissions: ["attendance:read"],
            },
          })
        )
      ).fieldErrors?.name
    ).toBeDefined()
    expect(
      (
        await failure(
          http.patch(`/roles/${role.id}`, any, {
            body: {
              name: "Gece amiri",
              description: null,
              permissions: ["health:read"],
            },
          })
        )
      ).status
    ).toBe(422)
    await http.patch(`/roles/${role.id}`, any, {
      body: {
        name: "Gece amiri",
        description: "Gece",
        permissions: ["attendance:read", "alarm:respond"],
      },
    })
    expect(db.roles.findById(role.id)?.permissions).toEqual([
      "attendance:read",
      "alarm:respond",
    ])
    expect(
      (
        await failure(
          http.patch("/roles/rol-temizlik-orta-supervisor", any, {
            body: {
              name: "x1",
              description: null,
              permissions: ["attendance:read"],
            },
          })
        )
      ).code
    ).toBe("SYSTEM_ROLE")
    expect(
      (await failure(http.delete("/roles/rol-temizlik-orta-supervisor", any)))
        .status
    ).toBe(409)
    await http.delete(`/roles/${role.id}`, z.undefined())
    expect(db.roles.findById(role.id)).toBeUndefined()
  })

  it("kullanıcı güncelleme, kendini devre dışı bırakma engeli, denetim listesi", async () => {
    signIn("temizlik-orta", "admin")
    await http.patch("/users/u-temizlik-orta-isg", any, {
      body: {
        displayName: "Selin Aydın",
        title: null,
        roleIds: ["rol-temizlik-orta-ohs_specialist"],
        scope: { kind: "all" },
      },
    })
    expect(
      (
        await failure(
          http.post("/users/u-temizlik-orta-admin/status", any, {
            body: { status: "disabled" },
          })
        )
      ).code
    ).toBe("SELF_DISABLE")
    const audit = await http.get(
      "/audit-events",
      z.object({ items: z.array(z.object({ action: z.string() })) }),
      { params: { actorKind: "user", q: "Kullanıcı" } }
    )
    expect(audit.items.map((item) => item.action)).toContain(
      "Kullanıcı rol/kapsam güncellendi"
    )
  })

  it("organizasyon birimi güncelleme/silme ve kod çakışması", async () => {
    signIn("cok-hatli-grup", "admin")
    expect(
      (
        await failure(
          http.post("/org-units", any, {
            body: {
              level: 0,
              parentId: null,
              code: "MAR",
              name: "Tekrar",
              isActive: true,
            },
          })
        )
      ).fieldErrors?.code
    ).toBeDefined()
    expect(
      (
        await failure(
          http.post("/org-units", any, {
            body: {
              level: 1,
              parentId: "ou-cok-hatli-grup-IST-AVR",
              code: "YANLIS",
              name: "Yanlış",
              isActive: true,
            },
          })
        )
      ).fieldErrors?.parentId
    ).toBeDefined()
    const unit = await http.post("/org-units", z.object({ id: z.string() }), {
      body: {
        level: 0,
        parentId: null,
        code: "DOGU",
        name: "Doğu Anadolu",
        isActive: true,
      },
    })
    await http.patch(`/org-units/${unit.id}`, any, {
      body: {
        level: 0,
        parentId: null,
        code: "DOGU",
        name: "Doğu",
        isActive: false,
      },
    })
    expect(db.orgUnits.findById(unit.id)).toMatchObject({
      name: "Doğu",
      isActive: false,
    })
    expect(
      (await failure(http.delete("/org-units/ou-cok-hatli-grup-MAR", any))).code
    ).toBe("HAS_CHILDREN")
    await http.delete(`/org-units/${unit.id}`, z.undefined())
    expect(db.orgUnits.findById(unit.id)).toBeUndefined()
  })

  it("lokasyon, müşteri ve tüzel kişilik içe aktarımı", async () => {
    signIn("temizlik-orta", "admin")
    const customer = db.customers.findFirst(
      (item) => item.tenantId === "temizlik-orta"
    )!
    const result = z.object({
      created: z.number(),
      updated: z.number(),
      skipped: z.number(),
      errors: z.array(z.object({ index: z.number(), message: z.string() })),
    })

    const locations = await http.post("/import/locations/batch", result, {
      body: {
        duplicateStrategy: "skip",
        rows: [
          {
            code: "IMP-001",
            name: "İçe aktarılan şube",
            customerName: customer.name,
            orgUnitCode: "EGE",
            city: "İzmir",
            district: "Konak",
            addressLine: "Atatürk Cad. No:5",
            lat: 38.42,
            lng: 27.14,
            radiusMeters: 80,
            targetHeadcount: 3,
          },
          {
            code: "IMP-002",
            name: "Bilinmeyen müşteri",
            customerName: "Yok Böyle",
            orgUnitCode: "EGE",
            city: "İzmir",
            district: "Konak",
            addressLine: "Atatürk Cad. No:6",
            lat: 38.42,
            lng: 27.14,
            radiusMeters: null,
            targetHeadcount: null,
          },
          {
            code: "IMP-003",
            name: "Geniş geofence",
            customerName: customer.name,
            orgUnitCode: "EGE",
            city: "İzmir",
            district: "Konak",
            addressLine: "Atatürk Cad. No:7",
            lat: 38.42,
            lng: 27.14,
            radiusMeters: 5000,
            targetHeadcount: null,
          },
          { code: "x", name: "y" },
        ],
      },
    })
    expect(locations).toMatchObject({ created: 1, updated: 0 })
    expect(locations.errors.map((error) => error.index)).toEqual([1, 2, 3])
    const imported = db.locations.findFirst((item) => item.code === "IMP-001")!
    expect(
      db.tags.count((tag) => tag.targetId === imported.id && tag.kind === "qr")
    ).toBe(1)

    const checked = await http.post(
      "/import/locations/check",
      z.object({
        existing: z.array(z.object({ key: z.string(), label: z.string() })),
      }),
      { body: { keys: ["IMP-001", "YOK"] } }
    )
    expect(checked.existing).toEqual([
      { key: "IMP-001", label: "IMP-001 · İçe aktarılan şube" },
    ])
    const update = await http.post("/import/locations/batch", result, {
      body: {
        duplicateStrategy: "update",
        rows: [
          {
            code: "IMP-001",
            name: "Güncel şube",
            customerName: customer.name,
            orgUnitCode: "EGE",
            city: "İzmir",
            district: "Konak",
            addressLine: "Atatürk Cad. No:5",
            lat: 38.42,
            lng: 27.14,
            radiusMeters: null,
            targetHeadcount: null,
          },
        ],
      },
    })
    expect(update.updated).toBe(1)

    const customers = await http.post("/import/customers/batch", result, {
      body: {
        duplicateStrategy: "skip",
        rows: [
          {
            name: "Ova Lojistik",
            type: "private",
            sector: "logistics",
            taxNumber: "1234567890",
            taxOffice: null,
            contactName: "Ali Veli",
            contactPhone: null,
            contactEmail: "ali@ova.example",
          },
        ],
      },
    })
    expect(customers.created).toBe(1)
    const again = await http.post("/import/customers/batch", result, {
      body: {
        duplicateStrategy: "skip",
        rows: [
          {
            name: "Ova Lojistik",
            type: "private",
            sector: "logistics",
            taxNumber: "1234567890",
            taxOffice: null,
            contactName: null,
            contactPhone: null,
            contactEmail: null,
          },
        ],
      },
    })
    expect(again.skipped).toBe(1)

    const entities = await http.post("/import/legal-entities/batch", result, {
      body: {
        duplicateStrategy: "update",
        rows: [
          {
            title: "Lavanta Bahçe Ltd.",
            taxNumber: "4840847211",
            taxOffice: "Kadıköy",
            sgkWorkplaceNumber: "1".repeat(26),
          },
        ],
      },
    })
    expect(entities.created).toBe(1)
    expect(
      (await failure(http.post("/import/bilinmeyen/batch", any, { body: {} })))
        .status
    ).toBe(404)
  })

  it("lokasyon güncelleme, alan düzenleme, etiket listesi ve NFC çakışması", async () => {
    signIn("temizlik-orta", "admin")
    const location = db.locations.findFirst(
      (item) => item.tenantId === "temizlik-orta"
    )!
    const area = db.areas.findFirst((item) => item.locationId === location.id)!
    await http.patch(`/areas/${area.id}`, any, {
      body: { name: "Yeni ad", type: "office", floor: "2" },
    })
    expect(db.areas.findById(area.id)).toMatchObject({
      name: "Yeni ad",
      floor: "2",
    })
    await http.post("/tags/nfc", any, {
      body: {
        targetType: "location",
        targetId: location.id,
        value: "04:00:00:00:00:00:01",
      },
    })
    const conflict = await failure(
      http.post("/tags/nfc", any, {
        body: {
          targetType: "area",
          targetId: area.id,
          value: "04:00:00:00:00:00:01",
        },
      })
    )
    expect(conflict.fieldErrors?.value?.[0]).toBe(
      "Bu NFC etiketi başka bir kayda atanmış."
    )
    const labels = await http.get(
      "/tags/labels",
      z.object({ items: z.array(z.object({ token: z.string() })) }),
      { params: { locationId: [location.id, "yok"] } }
    )
    expect(labels.items.length).toBeGreaterThan(0)
    const points = await http.get(
      "/locations/map-points",
      z.object({ items: z.array(z.unknown()) }),
      { params: { orgUnitId: "ou-temizlik-orta-MAR", q: "a" } }
    )
    expect(points.items.length).toBeGreaterThan(0)
    const options = await http.get(
      "/locations/options",
      z.object({ items: z.array(z.unknown()) }),
      { params: { q: location.code } }
    )
    expect(options.items).toHaveLength(1)
  })

  it("platform: modül kapatma kuralı, kiracı bulunamadı, mükerrer alt alan adı", async () => {
    signIn("platform", "destek")
    expect(
      (
        await failure(
          http.patch("/platform/tenants/guvenlik", any, {
            body: { modules: ["attendance"] },
          })
        )
      ).fieldErrors?.modules
    ).toBeDefined()
    expect(
      (await failure(http.get("/platform/tenants/olmayan", any))).status
    ).toBe(404)
    expect(
      (
        await failure(
          http.post("/platform/tenants", any, {
            body: {
              displayName: "Kopya",
              shortName: "Kopya",
              slug: "guvenlik",
              modules: ["core"],
              serviceLines: ["cleaning"],
              orgLevelCount: 2,
              adminName: "Ad Soyad",
              adminEmail: "a@b.example",
            },
          })
        )
      ).fieldErrors?.slug
    ).toEqual(["Bu alt alan adı kullanılıyor."])
    signIn("temizlik-orta", "admin")
    expect((await failure(http.get("/platform/tenants", any))).status).toBe(403)
  })
})
