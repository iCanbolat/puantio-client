import { describe, expect, it } from "vitest"

import {
  addMonthsIso,
  certificateState,
  effectiveHazardClass,
  evaluateRequirements,
  expiryBucket,
  renewalMonths,
  requirementMessage,
  trainingDueDate,
  trainingState,
  worstState,
} from "@/entities/ohs"
import { DEFAULT_OHS_RULES } from "@/entities/tenant"
import {
  completionOf,
  documentState,
} from "@/features/personnel-file/domain/completion"
import {
  evaluateCertificates,
  hasBlockingViolation,
} from "@/features/scheduling/domain/rules"

import { buildAuditPackRows, isCompliant } from "./audit-pack"

const rules = DEFAULT_OHS_RULES

describe("Faz 6 İSG domain", () => {
  describe("eğitim yenileme", () => {
    it("TC-6.1-01 tehlike sınıfına göre bitiş tarihi: az tehlikeli 3, tehlikeli 2, çok tehlikeli 1 yıl", () => {
      const renewal = { kind: "hazard_class" } as const
      expect(trainingDueDate("2026-03-15", renewal, "low", rules)).toBe(
        "2029-03-15"
      )
      expect(trainingDueDate("2026-03-15", renewal, "dangerous", rules)).toBe(
        "2028-03-15"
      )
      expect(
        trainingDueDate("2026-03-15", renewal, "very_dangerous", rules)
      ).toBe("2027-03-15")
      // Kiracı ayarı değişirse yalnızca parametre değişir
      expect(
        trainingDueDate("2026-03-15", renewal, "low", {
          renewalYears: { low: 4, dangerous: 2, very_dangerous: 1 },
        })
      ).toBe("2030-03-15")
    })

    it("TC-6.1-01 ay sonu ve 29 Şubat taşması ayın son gününe düşer", () => {
      expect(addMonthsIso("2028-02-29", 12)).toBe("2029-02-28")
      expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28")
      expect(addMonthsIso("2027-12-31", 2)).toBe("2028-02-29")
      expect(addMonthsIso("2026-05-10", -12)).toBe("2025-05-10")
      expect(
        trainingDueDate(
          "2028-02-29",
          { kind: "hazard_class" },
          "very_dangerous",
          rules
        )
      ).toBe("2029-02-28")
    })

    it("sabit süreli ve yenilemesiz eğitim", () => {
      expect(renewalMonths({ kind: "months", months: 18 }, "low", rules)).toBe(
        18
      )
      expect(renewalMonths({ kind: "none" }, "low", rules)).toBeNull()
      expect(
        trainingDueDate("2026-01-10", { kind: "none" }, "low", rules)
      ).toBeNull()
    })

    it("TC-6.1-02 lokasyonda sınıf yoksa kiracı varsayılanı kullanılır", () => {
      expect(effectiveHazardClass({ hazardClass: null }, rules)).toBe(
        "dangerous"
      )
      expect(effectiveHazardClass(null, rules)).toBe("dangerous")
      expect(
        effectiveHazardClass({ hazardClass: "very_dangerous" }, rules)
      ).toBe("very_dangerous")
    })

    it("eğitim durumu: hiç almamış, gecikmiş, 30 gün içinde, geçerli", () => {
      expect(trainingState(null, null, "2026-10-01")).toBe("never")
      expect(trainingState("2024-01-01", "2026-09-30", "2026-10-01")).toBe(
        "overdue"
      )
      expect(trainingState("2025-10-20", "2026-10-20", "2026-10-01")).toBe(
        "expiring"
      )
      expect(trainingState("2026-01-01", "2027-01-01", "2026-10-01")).toBe(
        "valid"
      )
      expect(trainingState("2020-01-01", null, "2026-10-01")).toBe("valid")
    })
  })

  describe("sertifika uygunluğu", () => {
    it("bitiş günü geçerli, ertesi gün dolmuş; uyarı penceresi", () => {
      expect(certificateState("2026-10-01", "2026-10-01", 30)).toBe("expiring")
      expect(certificateState("2026-10-01", "2026-10-02", 30)).toBe("expired")
      expect(certificateState("2026-12-01", "2026-10-01", 30)).toBe("valid")
      expect(certificateState(null, "2026-10-01", 30)).toBe("valid")
    })

    it("TC-6.3-02 uyarı kovaları: süresi dolmuş, 30, 60, 90 gün; sonrası ve süresiz kovada değil", () => {
      const today = "2026-10-01"
      expect(expiryBucket("2026-09-30", today)).toBe("expired")
      expect(expiryBucket("2026-10-01", today)).toBe("d30")
      expect(expiryBucket("2026-10-31", today)).toBe("d30")
      expect(expiryBucket("2026-11-01", today)).toBe("d60")
      expect(expiryBucket("2026-11-30", today)).toBe("d60")
      expect(expiryBucket("2026-12-30", today)).toBe("d90")
      expect(expiryBucket("2026-12-31", today)).toBeNull()
      expect(expiryBucket(null, today)).toBeNull()
    })

    it("gereksinim değerlendirmesi: eksik, en geç biten sertifika sayılır", () => {
      const results = evaluateRequirements(
        ["hygiene", "hospital_infection"],
        [
          { type: "hygiene", expiresAt: "2026-09-01" },
          { type: "hygiene", expiresAt: "2027-09-01" },
        ],
        "2026-10-01",
        30
      )
      expect(results).toEqual([
        { type: "hygiene", state: "valid", expiresAt: "2027-09-01" },
        { type: "hospital_infection", state: "missing", expiresAt: null },
      ])
      expect(worstState(results.map((item) => item.state))).toBe("missing")
      expect(requirementMessage(results[1]!)).toBe(
        "Hastane enfeksiyon eğitimi sertifikası yok; bu lokasyonda zorunlu."
      )
      expect(
        requirementMessage({
          type: "hygiene",
          state: "expired",
          expiresAt: "2026-09-16",
        })
      ).toBe(
        "Hijyen eğitimi sertifikası 16.09.2026 tarihinde sona erdi; bu lokasyonda zorunlu."
      )
    })

    const compliance = {
      requiredCertificates: ["hospital_infection" as const],
      personnel: [
        {
          personnelId: "p1",
          certificates: [
            { type: "hospital_infection" as const, expiresAt: "2026-09-16" },
          ],
        },
        {
          personnelId: "p2",
          certificates: [
            { type: "hospital_infection" as const, expiresAt: "2026-10-20" },
          ],
        },
      ],
    }
    const shift = (personnelId: string, date: string) => ({
      id: `cell:${personnelId}|${date}`,
      personnelId,
      date,
      startsAt: 0,
      endsAt: 1,
      breakMinutes: 0,
    })

    it("TC-6.3-01 süresi dolmuş sertifikalı personelin taslak ataması engellenir; kayıtlı atama uyarıdır", () => {
      const violations = evaluateCertificates(
        [shift("p1", "2026-10-05"), shift("p1", "2026-10-06")],
        compliance,
        {
          policy: "block",
          warnDays: 30,
          isDraft: (item) => item.date === "2026-10-06",
        }
      )
      expect(hasBlockingViolation(violations)).toBe(true)
      const block = violations.find((item) => item.severity === "block")!
      expect(block.code).toBe("certificate_expired")
      expect(block.shiftIds).toEqual(["cell:p1|2026-10-06"])
      expect(block.message).toMatch(/16\.09\.2026 tarihinde sona erdi/)
      const warn = violations.find((item) => item.severity === "warn")!
      expect(warn.shiftIds).toEqual(["cell:p1|2026-10-05"])
    })

    it("TC-6.3-03 politika 'uyarı' iken aynı atama yalnızca uyarı; yakında dolan sertifika her zaman uyarı", () => {
      const warnOnly = evaluateCertificates(
        [shift("p1", "2026-10-06")],
        compliance,
        { policy: "warn", warnDays: 30, isDraft: () => true }
      )
      expect(hasBlockingViolation(warnOnly)).toBe(false)
      expect(warnOnly).toHaveLength(1)
      const expiring = evaluateCertificates(
        [shift("p2", "2026-10-06"), shift("p2", "2026-10-07")],
        compliance,
        { policy: "block", warnDays: 30, isDraft: () => true }
      )
      // Aynı kişi + sertifika için tek ihlal, rozet iki hücrede
      expect(expiring).toHaveLength(1)
      expect(expiring[0]).toMatchObject({
        code: "certificate_expiring",
        severity: "warn",
        shiftIds: ["cell:p2|2026-10-06", "cell:p2|2026-10-07"],
      })
      expect(
        evaluateCertificates(
          [shift("p1", "2026-10-06")],
          { requiredCertificates: [], personnel: [] },
          { policy: "block", warnDays: 30, isDraft: () => true }
        )
      ).toEqual([])
    })
  })

  describe("özlük dosyası", () => {
    const types = [
      {
        id: "kimlik",
        name: "Kimlik",
        required: true,
        validityMonths: null,
        isActive: true,
      },
      {
        id: "adli",
        name: "Adli sicil",
        required: true,
        validityMonths: 6,
        isActive: true,
      },
      {
        id: "sozlesme",
        name: "İş sözleşmesi",
        required: true,
        validityMonths: null,
        isActive: true,
      },
      {
        id: "diploma",
        name: "Diploma",
        required: false,
        validityMonths: null,
        isActive: true,
      },
      {
        id: "eski",
        name: "Eski belge",
        required: true,
        validityMonths: null,
        isActive: false,
      },
    ]

    it("TC-6.4-01 tamamlanma yüzdesi yalnızca zorunlu ve etkin belgelerden; süresi geçmiş adli sicil eksik sayılır", () => {
      const result = completionOf(
        types,
        new Map([
          [
            "kimlik",
            { issuedAt: null, uploadedAt: "2026-01-10T09:00:00+03:00" },
          ],
          [
            "adli",
            { issuedAt: "2026-02-01", uploadedAt: "2026-02-02T09:00:00+03:00" },
          ],
          [
            "diploma",
            { issuedAt: null, uploadedAt: "2026-01-10T09:00:00+03:00" },
          ],
        ]),
        "2026-10-01"
      )
      expect(result).toEqual({
        completion: 33,
        missing: ["İş sözleşmesi"],
        expired: ["Adli sicil"],
      })
    })

    it("geçerlilik süresi düzenlenme tarihinden (yoksa yükleme gününden) hesaplanır", () => {
      expect(
        documentState(
          { validityMonths: 6 },
          { issuedAt: "2026-05-01", uploadedAt: "2026-05-02T10:00:00+03:00" },
          "2026-10-01"
        )
      ).toEqual({ state: "present", validUntil: "2026-11-01" })
      expect(
        documentState(
          { validityMonths: 6 },
          { issuedAt: null, uploadedAt: "2026-03-01T10:00:00+03:00" },
          "2026-10-01"
        )
      ).toEqual({ state: "expired", validUntil: "2026-09-01" })
      expect(
        documentState({ validityMonths: null }, undefined, "2026-10-01")
      ).toEqual({
        state: "missing",
        validUntil: null,
      })
      expect(completionOf([], new Map(), "2026-10-01").completion).toBe(100)
    })
  })

  describe("müşteri denetim paketi", () => {
    const person = (
      name: string,
      healthResult: "fit" | "conditional" | "unfit" | null,
      certState: "valid" | "expired" = "valid"
    ) => ({
      personnelId: name,
      name,
      position: "Temizlik personeli",
      trainings: [
        {
          typeName: "Temel İSG eğitimi",
          state: "valid" as const,
          dueAt: "2027-01-01",
        },
      ],
      requirements: [
        { type: "hygiene" as const, state: certState, expiresAt: "2026-12-01" },
      ],
      healthResult,
    })

    it("TC-6.5-01 sağlık detayı pakete girmez; ayar açıkken yalnızca 'Uygun'", () => {
      const people = [
        person("Şule", "conditional"),
        person("Ali", "fit"),
        person("Can", null, "expired"),
      ]
      const closed = buildAuditPackRows(people, false)
      expect(closed.rows.map((row) => row.health)).toEqual([null, null, null])
      expect(JSON.stringify(closed)).not.toMatch(
        /conditional|unfit|examined|nextExam/
      )
      const open = buildAuditPackRows(people, true)
      // Türkçe sıralama; şartlı uygun ve kaydı olmayan "—" (null)
      expect(open.rows.map((row) => [row.name, row.health])).toEqual([
        ["Ali", "fit"],
        ["Can", null],
        ["Şule", null],
      ])
      expect(open.summary).toEqual({ total: 3, compliant: 2 })
    })

    it("uygunluk: sertifika ve eğitim geçerli/yakında doluyor olmalı", () => {
      expect(
        isCompliant({
          requirements: [
            { type: "hygiene", state: "expiring", expiresAt: null },
          ],
          trainings: [{ typeName: "x", state: "expiring", dueAt: null }],
        })
      ).toBe(true)
      expect(
        isCompliant({
          requirements: [],
          trainings: [{ typeName: "x", state: "never", dueAt: null }],
        })
      ).toBe(false)
    })
  })
})
