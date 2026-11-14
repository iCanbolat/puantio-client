import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { z } from "zod"

import { scheduleBatchResultSchema } from "@/entities/shift"
import { SENSITIVE_PERMISSIONS } from "@/entities/session"
import {
  accessLogListSchema,
  healthListSchema,
  revealResponseSchema,
} from "@/features/health-surveillance/model/health"
import {
  auditPackSchema,
  certificateListSchema,
  certificateSchema,
  certificateSummarySchema,
  ohsOverviewSchema,
  ohsSettingsSchema,
  personnelOhsSchema,
  trainingSessionSchema,
  trainingStatusListSchema,
} from "@/features/ohs/model/ohs"
import {
  personnelFileListSchema,
  personnelFileSchema,
  personnelFileSummarySchema,
} from "@/features/personnel-file/model/personnel-file"
import { ApiError } from "@/shared/api/errors"
import { configureHttp, http } from "@/shared/api/http"
import { applyTestScenario } from "@/test/scenario"

import { identityFor } from "./auth/identities"
import { mintMockToken } from "./auth/token"
import { mockClock } from "./clock"
import { db } from "./db"
import { ensureRange } from "./operations/plan"
import { locationVersion } from "./operations/store"
import { scenarioLocationId } from "./scenarios/phase2"
import {
  EXPIRED_CERT_BUCKETS,
  INCOMPLETE_FILE,
  portalPackLocationId,
} from "./scenarios/phase6"
import { SUPPORT_PERMISSIONS } from "./tenancy/roles"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"
const any = z.unknown()

function signIn(user: string, tenant = TENANT) {
  const identity = identityFor(tenant, user)
  const token = mintMockToken({
    organization: identity.organization,
    userId: identity.userId,
    expiresAt: Date.now() + 3_600_000,
  })
  configureHttp({ getAccessToken: () => token })
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((caught: unknown) => caught)
  if (!(error instanceof ApiError)) throw new Error("ApiError bekleniyordu")
  return error
}

/** Senaryo personeli: 0 süresi dolmuş, 1 eksik, 2 geçerli, 3 yakında doluyor */
function scenarioPeople() {
  const locationId = scenarioLocationId(TENANT)!
  return {
    locationId,
    people: db.personnel
      .findMany(
        (person) =>
          person.tenantId === TENANT &&
          person.homeLocationId === locationId &&
          person.status === "active" &&
          !person.isFloater &&
          person.terminationDate === null
      )
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true })),
  }
}

describe("Faz 6 mock API sözleşmesi", () => {
  describe("sertifikalar ve vardiya uygunluğu", () => {
    it("TC-6.3-02 uyarı kovaları fixture ile eşleşir; liste kovaya göre süzülür", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("expired-certificates")
      signIn("isg")
      const summary = await http.get(
        "/ohs/certificates/summary",
        certificateSummarySchema
      )
      expect(summary.buckets).toEqual(EXPIRED_CERT_BUCKETS)
      const overview = await http.get("/ohs/overview", ohsOverviewSchema)
      expect(overview.certificateBuckets).toEqual(EXPIRED_CERT_BUCKETS)
      expect(overview.health).not.toBeNull()
      const expired = await http.get(
        "/ohs/certificates",
        certificateListSchema,
        {
          params: { bucket: "expired" },
        }
      )
      expect(expired.meta.total).toBe(2)
      expect(expired.items.map((item) => item.type).sort()).toEqual([
        "first_aid",
        "hospital_infection",
      ])
    })

    it("TC-6.3-01 sunucu: politika 'engel' iken süresi dolmuş sertifikalı personel atanamaz (422)", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("expired-certificates")
      ensureRange(TENANT, "2026-10-01", "2026-10-20")
      const { locationId } = scenarioPeople()
      const expiredCert = db.certificates.findFirst(
        (cert) =>
          cert.tenantId === TENANT &&
          cert.type === "hospital_infection" &&
          cert.expiresAt !== null &&
          cert.expiresAt < "2026-10-05"
      )!
      const validPerson = db.certificates.findFirst(
        (cert) =>
          cert.tenantId === TENANT &&
          cert.type === "hospital_infection" &&
          cert.expiresAt !== null &&
          cert.expiresAt > "2026-12-01"
      )!.personnelId
      signIn("bolge")
      const batch = (personnelId: string) =>
        http.post("/schedule/batch", scheduleBatchResultSchema, {
          body: {
            locationId,
            version: locationVersion(TENANT, locationId),
            changes: [
              {
                personnelId,
                date: "2026-10-11",
                templateId: "tpl-temizlik-orta-sabah",
              },
            ],
          },
        })
      const error = await failure(batch(expiredCert.personnelId))
      expect(error).toMatchObject({
        status: 422,
        code: "CERTIFICATE_NONCOMPLIANT",
      })
      expect(error.message).toMatch(
        /Hastane enfeksiyon eğitimi sertifikası .* sona erdi/
      )
      // Geçerli sertifikalı personel kaydedilir
      await expect(batch(validPerson)).resolves.toMatchObject({ applied: 1 })
      const board = await http.get("/schedule", any, {
        params: { locationId, from: "2026-10-05", to: "2026-10-11" },
      })
      expect(
        (board as { compliance: { requiredCertificates: string[] } }).compliance
          .requiredCertificates
      ).toEqual(["hygiene", "hospital_infection"])
    })

    it("TC-6.3-03 politika 'uyarı' iken aynı atama kaydedilir", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("expired-certificates")
      ensureRange(TENANT, "2026-10-01", "2026-10-20")
      const tenant = db.tenants.findById(TENANT)!
      db.tenants.update(TENANT, {
        rules: {
          ...tenant.rules,
          ohs: { ...tenant.rules.ohs, certificatePolicy: "warn" },
        },
      })
      const { locationId } = scenarioPeople()
      const expiredCert = db.certificates.findFirst(
        (cert) =>
          cert.tenantId === TENANT &&
          cert.type === "hospital_infection" &&
          cert.expiresAt !== null &&
          cert.expiresAt < "2026-10-05"
      )!
      signIn("bolge")
      await expect(
        http.post("/schedule/batch", scheduleBatchResultSchema, {
          body: {
            locationId,
            version: locationVersion(TENANT, locationId),
            changes: [
              {
                personnelId: expiredCert.personnelId,
                date: "2026-10-11",
                templateId: "tpl-temizlik-orta-sabah",
              },
            ],
          },
        })
      ).resolves.toMatchObject({ applied: 1 })
    })

    it("sertifika kaydı: bitiş < veriliş 422; yenileme eskisini 'yenilendi' yapar; İK yazamaz", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("expired-certificates")
      const expiredCert = db.certificates.findFirst(
        (cert) =>
          cert.tenantId === TENANT &&
          cert.type === "hospital_infection" &&
          cert.expiresAt !== null &&
          cert.expiresAt < "2026-10-05"
      )!
      signIn("isg")
      const body = {
        personnelId: expiredCert.personnelId,
        type: "hospital_infection",
        number: "HE-777",
        issuedAt: "2026-10-05",
        expiresAt: "2026-10-01",
        uploadId: null,
      }
      expect(
        await failure(
          http.post("/ohs/certificates", certificateSchema, { body })
        )
      ).toMatchObject({ status: 422 })
      const renewed = await http.post("/ohs/certificates", certificateSchema, {
        body: { ...body, expiresAt: "2027-10-05" },
      })
      expect(renewed).toMatchObject({ bucket: null, superseded: false })
      const ohs = await http.get(
        `/ohs/personnel/${expiredCert.personnelId}`,
        personnelOhsSchema
      )
      expect(
        ohs.requirements.find((item) => item.type === "hospital_infection")
      ).toMatchObject({ state: "valid", expiresAt: "2027-10-05" })
      expect(
        ohs.certificates.find((item) => item.id === expiredCert.id)
      ).toMatchObject({ superseded: true, bucket: null })
      expect(ohs.hazardClass).toBe("very_dangerous")
      signIn("ik")
      expect(
        await failure(
          http.post("/ohs/certificates", certificateSchema, { body })
        )
      ).toMatchObject({ status: 403 })
    })
  })

  describe("eğitimler", () => {
    it("TC-6.1-03 toplu eğitim: yalnızca katılanların durumu yenilenir; ikinci kayıt 409", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("training-overdue")
      const { people } = scenarioPeople()
      const [never, overdue] = people
      signIn("isg")
      const statusOf = async (personnelId: string) => {
        const list = await http.get(
          "/ohs/training-status",
          trainingStatusListSchema,
          {
            params: {
              typeId: "temel-isg",
              pageSize: 100,
              q: db.personnel.findById(personnelId)!.employeeNumber,
            },
          }
        )
        return list.items.find((row) => row.personnelId === personnelId)!
      }
      expect((await statusOf(never!.id)).state).toBe("never")
      const overdueRow = await statusOf(overdue!.id)
      expect(overdueRow).toMatchObject({
        state: "overdue",
        hazardClass: "very_dangerous",
      })
      const session = await http.post(
        "/ohs/training-sessions",
        trainingSessionSchema,
        {
          body: {
            typeId: "temel-isg",
            date: "2026-10-05",
            trainer: "Selin Aydın",
            locationId: null,
            durationHours: 8,
            participantIds: [never!.id, overdue!.id],
          },
        }
      )
      expect(session.status).toBe("planned")
      const done = await http.post(
        `/ohs/training-sessions/${session.id}/attendance`,
        trainingSessionSchema,
        {
          body: {
            attendance: [
              { personnelId: never!.id, attended: true },
              { personnelId: overdue!.id, attended: false },
            ],
          },
        }
      )
      expect(done.status).toBe("completed")
      expect(await statusOf(never!.id)).toMatchObject({
        state: "valid",
        lastCompletedAt: "2026-10-05",
        // Çok tehlikeli: 1 yıl
        dueAt: "2027-10-05",
      })
      expect((await statusOf(overdue!.id)).state).toBe("overdue")
      expect(
        await failure(
          http.post(
            `/ohs/training-sessions/${session.id}/attendance`,
            trainingSessionSchema,
            {
              body: {
                attendance: [{ personnelId: never!.id, attended: true }],
              },
            }
          )
        )
      ).toMatchObject({ status: 409, code: "SESSION_CLOSED" })
    })

    it("ayarlar: İSG uzmanı politikayı değiştirir, kiracı yapılandırmasına yansır; bölge sorumlusu 403", async () => {
      signIn("isg")
      const settings = await http.get("/ohs/settings", ohsSettingsSchema)
      expect(settings.rules.certificatePolicy).toBe("block")
      expect(settings.trainingTypes.map((type) => type.id)).toContain(
        "temel-isg"
      )
      const saved = await http.put("/ohs/settings", ohsSettingsSchema, {
        body: {
          ...settings,
          rules: { ...settings.rules, certificatePolicy: "warn" },
        },
      })
      expect(saved.rules.certificatePolicy).toBe("warn")
      expect(db.tenants.findById(TENANT)!.rules.ohs.certificatePolicy).toBe(
        "warn"
      )
      // Diğer kiracılar etkilenmez (ortak varsayılan nesne değişmemeli)
      expect(db.tenants.findById("guvenlik")!.rules.ohs.certificatePolicy).toBe(
        "block"
      )
      signIn("bolge")
      expect(
        await failure(http.get("/ohs/settings", ohsSettingsSchema))
      ).toMatchObject({ status: 403 })
    })
  })

  describe("sağlık gözetimi (özel nitelikli veri)", () => {
    it("TC-6.2-01 İSG uzmanı olmayan kullanıcı ve destek rolü sağlık verisine erişemez", async () => {
      const person = db.personnel.findFirst((item) => item.tenantId === TENANT)!
      for (const user of ["ik", "admin", "bolge"]) {
        signIn(user)
        expect(
          await failure(http.get("/health/records", healthListSchema))
        ).toMatchObject({ status: 403 })
        expect(
          await failure(
            http.post(
              `/health/records/${person.id}/reveal`,
              revealResponseSchema,
              {
                body: { reason: "Kontrol amaçlı inceleme" },
              }
            )
          )
        ).toMatchObject({ status: 403 })
      }
      // Platform destek ve süper yönetici sağlık yetkisi almaz
      for (const permission of SENSITIVE_PERMISSIONS)
        expect(SUPPORT_PERMISSIONS).not.toContain(permission)
      // Personel detayı ve İSG kartı sağlık alanı taşımaz
      signIn("isg")
      const detail = await http.get(`/personnel/${person.id}`, any)
      expect(JSON.stringify(detail)).not.toMatch(
        /examinedAt|nextExamAt|"result"/
      )
      const ohs = await http.get(`/ohs/personnel/${person.id}`, any)
      expect(JSON.stringify(ohs)).not.toMatch(/examinedAt|nextExamAt|"fit"/)
    })

    it("TC-6.2-02/03 liste maskeli; gösterme gerekçe ister, erişim ve denetim kaydına yazılır", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("health-due")
      signIn("isg")
      const list = await http.get("/health/records", healthListSchema, {
        params: { due: "overdue", pageSize: 100 },
      })
      expect(list.items.length).toBeGreaterThan(0)
      expect(JSON.stringify(list)).not.toMatch(
        /"result"|examinedAt|nextExamAt"/
      )
      const target = list.items[0]!
      expect(target.nextExamMonth).toMatch(/^\d{4}-\d{2}$/)
      expect(
        await failure(
          http.post(
            `/health/records/${target.personnelId}/reveal`,
            revealResponseSchema,
            { body: { reason: "kısa" } }
          )
        )
      ).toMatchObject({ status: 422 })
      const before = db.auditEvents.count()
      const revealed = await http.post(
        `/health/records/${target.personnelId}/reveal`,
        revealResponseSchema,
        { body: { reason: "Periyodik muayene planlaması" } }
      )
      expect(["fit", "conditional", "unfit"]).toContain(revealed.record?.result)
      expect(db.auditEvents.count()).toBe(before + 1)
      const logs = await http.get("/health/access-logs", accessLogListSchema)
      expect(logs.items[0]).toMatchObject({
        personnelId: target.personnelId,
        action: "reveal",
        reason: "Periyodik muayene planlaması",
        actorName: "Selin Aydın",
      })
    })

    it("muayene güncelleme: sonraki muayene tehlike sınıfından; ileri tarih 422", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("expired-certificates")
      const { people } = scenarioPeople()
      signIn("isg")
      const saved = await http.put(
        `/health/records/${people[0]!.id}`,
        revealResponseSchema,
        {
          body: {
            examinedAt: "2026-10-01",
            result: "conditional",
            vaccinations: [
              { type: "Hepatit B", date: "2026-10-01", nextDoseAt: null },
            ],
          },
        }
      )
      // Hastane lokasyonu çok tehlikeli: yılda bir
      expect(saved.record).toMatchObject({
        nextExamAt: "2027-10-01",
        result: "conditional",
      })
      expect(
        await failure(
          http.put(`/health/records/${people[0]!.id}`, revealResponseSchema, {
            body: { examinedAt: "2026-12-01", result: "fit", vaccinations: [] },
          })
        )
      ).toMatchObject({ status: 422 })
    })
  })

  describe("özlük dosyası", () => {
    it("TC-6.4-01 eksik belgeli personel: tamamlanma %, eksik ve süresi geçmiş listesi", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("personnel-file-incomplete")
      const { people } = scenarioPeople()
      const target = people[0]!
      signIn("ik")
      const file = await http.get(
        `/personnel-files/${target.id}`,
        personnelFileSchema
      )
      expect(file.completion).toBe(INCOMPLETE_FILE.completion)
      const states = Object.fromEntries(
        file.items.map((item) => [item.typeId, item.state])
      )
      for (const id of INCOMPLETE_FILE.present)
        expect(states[id]).toBe("present")
      for (const id of INCOMPLETE_FILE.expired)
        expect(states[id]).toBe("expired")
      for (const id of INCOMPLETE_FILE.missing)
        expect(states[id]).toBe("missing")
      const list = await http.get("/personnel-files", personnelFileListSchema, {
        params: { durum: "eksik", q: target.employeeNumber },
      })
      expect(list.items[0]).toMatchObject({
        personnelId: target.id,
        completion: 50,
        expired: ["Adli sicil kaydı"],
      })
      expect(list.items[0]!.missing).toEqual(
        expect.arrayContaining(["İş sözleşmesi", "KVKK aydınlatma metni"])
      )
      // Bölge sorumlusu belgeleri göremez, yalnızca özeti alır
      signIn("bolge")
      expect(
        await failure(
          http.get(`/personnel-files/${target.id}`, personnelFileSchema)
        )
      ).toMatchObject({ status: 403 })
      await expect(
        http.get(
          `/personnel-files/${target.id}/summary`,
          personnelFileSummarySchema
        )
      ).resolves.toMatchObject({
        completion: 50,
        missingCount: 2,
        expiredCount: 1,
      })
    })

    it("TC-6.4-02 yeni sürüm: eski sürüm geçmişte kalır; imzalı adres süresi dolunca 403", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("personnel-file-incomplete")
      const { people } = scenarioPeople()
      const target = people[0]!
      // jsdom FormData'sı dosya aktaramaz: yükleme kaydı doğrudan oluşturulur (gerçek yükleme E2E-6.3)
      db.uploads.insert({
        id: "up-test-adli",
        tenantId: TENANT,
        name: "adli-sicil-yeni.pdf",
        contentType: "application/pdf",
        size: 1000,
        createdAt: OCTOBER,
        purpose: "personnel_doc",
      })
      signIn("ik")
      const file = await http.post(
        `/personnel-files/${target.id}/documents`,
        personnelFileSchema,
        {
          body: {
            typeId: "adli-sicil",
            uploadId: "up-test-adli",
            issuedAt: "2026-10-01",
          },
        }
      )
      const item = file.items.find((entry) => entry.typeId === "adli-sicil")!
      expect(item.state).toBe("present")
      expect(item.versions.map((version) => version.name)).toEqual([
        "adli-sicil-yeni.pdf",
        "adli-sicil.pdf",
      ])
      expect(file.completion).toBe(66)
      const url = item.versions[0]!.url
      expect((await fetch(url)).status).toBe(200)
      mockClock.freeze("2026-10-05T10:06:00+03:00")
      expect((await fetch(url)).status).toBe(403)
      // Geçerlilik süreli belgede düzenlenme tarihi zorunlu; amaç uyuşmayan dosya reddedilir
      expect(
        await failure(
          http.post(
            `/personnel-files/${target.id}/documents`,
            personnelFileSchema,
            {
              body: {
                typeId: "adli-sicil",
                uploadId: "up-test-adli",
                issuedAt: null,
              },
            }
          )
        )
      ).toMatchObject({ status: 422 })
      signIn("bolge")
      expect(
        await failure(
          http.post(
            `/personnel-files/${target.id}/documents`,
            personnelFileSchema,
            {
              body: {
                typeId: "kimlik",
                uploadId: "up-test-adli",
                issuedAt: null,
              },
            }
          )
        )
      ).toMatchObject({ status: 403 })
    })
  })

  describe("müşteri denetim paketi", () => {
    it("TC-6.5-01 paket ve Excel sağlık detayı içermez; ayar açıkken yalnızca 'Uygun'", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("expired-certificates")
      const { locationId } = scenarioPeople()
      signIn("isg")
      const pack = await http.get(
        `/ohs/audit-pack/${locationId}`,
        auditPackSchema
      )
      expect(pack.includesHealth).toBe(false)
      expect(pack.rows.every((row) => row.health === null)).toBe(true)
      expect(pack.location.requiredCertificates).toEqual([
        "hygiene",
        "hospital_infection",
      ])
      expect(pack.summary.total).toBeGreaterThanOrEqual(4)
      const before = db.auditEvents.count()
      const { blob } = await http.getBlob(
        `/ohs/audit-pack/${locationId}/export`
      )
      expect(db.auditEvents.count()).toBe(before + 1)
      const book = XLSX.read(await blob.arrayBuffer(), { type: "array" })
      const text = book.SheetNames.map((name) =>
        XLSX.utils.sheet_to_csv(book.Sheets[name]!)
      ).join("\n")
      expect(text).toMatch(/Hastane enfeksiyon eğitimi/)
      expect(text).not.toMatch(/Sağlık|Şartlı|muayene/i)

      applyTestScenario("audit-pack-hospital")
      signIn("isg")
      const portalLocation = portalPackLocationId(TENANT)!
      const withHealth = await http.get(
        `/ohs/audit-pack/${portalLocation}`,
        auditPackSchema
      )
      expect(withHealth.includesHealth).toBe(true)
      expect(withHealth.rows.some((row) => row.health === "fit")).toBe(true)
      expect(JSON.stringify(withHealth)).not.toMatch(
        /conditional|unfit|examinedAt/
      )
      const exported = await http.getBlob(
        `/ohs/audit-pack/${portalLocation}/export`
      )
      const healthBook = XLSX.read(await exported.blob.arrayBuffer(), {
        type: "array",
      })
      const sheet = XLSX.utils.sheet_to_csv(
        healthBook.Sheets["Personel uygunluğu"]!
      )
      expect(sheet).toMatch(/Sağlık uygunluğu/)
      expect(sheet).not.toMatch(/Şartlı|Uygun değil,.*Uygun değil/)
    })

    it("TC-6.5-02 müşteri A, B'nin lokasyon paketine gidemez (404); müşteri kullanıcısında yetki yok", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("audit-pack-hospital")
      const own = portalPackLocationId(TENANT)!
      const other = db.locations.findFirst(
        (item) =>
          item.tenantId === TENANT &&
          item.customerId !== db.locations.findById(own)!.customerId
      )!
      signIn("musteri")
      const options = await http.get("/portal/audit-pack/locations", any)
      expect(JSON.stringify(options)).toContain(own)
      expect(JSON.stringify(options)).not.toContain(`"${other.id}"`)
      await expect(
        http.get(`/portal/audit-pack/${own}`, auditPackSchema)
      ).resolves.toMatchObject({ location: { id: own } })
      expect(
        await failure(
          http.get(`/portal/audit-pack/${other.id}`, auditPackSchema)
        )
      ).toMatchObject({ status: 404 })
      expect(
        await failure(http.get(`/ohs/audit-pack/${own}`, auditPackSchema))
      ).toMatchObject({ status: 403 })
      signIn("musteri-kullanici")
      expect(
        await failure(http.get(`/portal/audit-pack/${own}`, auditPackSchema))
      ).toMatchObject({ status: 403 })
    })
  })

  it("İSG modülü kapalı kiracıda vardiya panosu uygunluk verisi boş döner", async () => {
    mockClock.freeze(OCTOBER)
    const tenant = "cok-hatli-grup"
    const locationId = scenarioLocationId(tenant)!
    db.locations.update(locationId, { requiredCertificates: ["hygiene"] })
    signIn("bolge", tenant)
    const board = await http.get("/schedule", any, {
      params: { locationId, from: "2026-10-05", to: "2026-10-11" },
    })
    expect((board as { compliance: unknown }).compliance).toEqual({
      requiredCertificates: [],
      personnel: [],
    })
  })
})
