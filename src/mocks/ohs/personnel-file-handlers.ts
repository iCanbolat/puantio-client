import { http } from "msw"
import * as XLSX from "xlsx"

import {
  completionOf,
  documentState,
} from "@/features/personnel-file/domain/completion"
import {
  documentInputSchema,
  personnelFileListParamsSchema,
  type PersonnelFile,
  type PersonnelFileRow,
} from "@/features/personnel-file/model/personnel-file"
import { includesTr } from "@/shared/lib/format"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockPersonnel } from "../db/types"
import {
  apiPath,
  created,
  fileResponse,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { paginate } from "../operations/common"
import { visiblePersonnel } from "./ohs-handlers"
import {
  locationLabels,
  ohsSettingsFor,
  personName,
  signedDocUrl,
  today,
} from "./store"

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function latestByType(personnelId: string) {
  const map = new Map<string, { issuedAt: string | null; uploadedAt: string }>()
  for (const doc of db.personnelDocuments.findMany(
    (item) => item.personnelId === personnelId
  )) {
    const latest = doc.versions.at(-1)
    if (latest) map.set(doc.typeId, latest)
  }
  return map
}

function fileRow(person: MockPersonnel, tenantId: string): PersonnelFileRow {
  const types = ohsSettingsFor(tenantId).documentTypes
  const labels = locationLabels(person.homeLocationId)
  return {
    personnelId: person.id,
    name: personName(person),
    employeeNumber: person.employeeNumber,
    locationName: labels.locationName,
    orgUnitName: labels.orgUnitName,
    ...completionOf(types, latestByType(person.id), today()),
  }
}

function personnelFile(person: MockPersonnel, tenantId: string): PersonnelFile {
  const types = ohsSettingsFor(tenantId).documentTypes.filter(
    (type) => type.isActive
  )
  const latest = latestByType(person.id)
  const onDate = today()
  const docs = db.personnelDocuments.findMany(
    (item) => item.personnelId === person.id
  )
  return {
    personnelId: person.id,
    completion: completionOf(types, latest, onDate).completion,
    items: types.map((type) => {
      const doc = docs.find((item) => item.typeId === type.id)
      const status = documentState(type, latest.get(type.id), onDate)
      return {
        typeId: type.id,
        typeName: type.name,
        required: type.required,
        validityMonths: type.validityMonths,
        state: status.state,
        validUntil: status.validUntil,
        versions: (doc?.versions ?? [])
          .map((version) => ({
            ...version,
            url: signedDocUrl(version.uploadId),
          }))
          .reverse(),
      }
    }),
  }
}

function findPerson(auth: AuthContext, id: string) {
  const person = db.personnel.findById(id)
  return person && createScope(auth).personnel(person) ? person : null
}

function filteredRows(auth: AuthContext, request: Request) {
  const query = parseQuery(request, personnelFileListParamsSchema)
  const rows = visiblePersonnel(auth)
    .filter((person) => {
      if (!query.orgUnitId) return true
      return locationLabels(person.homeLocationId).orgUnitId === query.orgUnitId
    })
    .map((person) => fileRow(person, auth.tenant.slug))
    .filter(
      (row) =>
        (!query.durum ||
          (query.durum === "eksik"
            ? row.completion < 100
            : row.completion === 100)) &&
        (!query.q || includesTr(`${row.name} ${row.employeeNumber}`, query.q))
    )
    .sort(
      (a, b) =>
        a.completion - b.completion || a.name.localeCompare(b.name, "tr")
    )
  return { query, rows }
}

export const personnelFileHandlers = [
  http.get(
    apiPath("/personnel-files"),
    withAuth("personnel_file:read", ({ request, auth }) => {
      const { query, rows } = filteredRows(auth, request)
      return ok(paginate(rows, query.page, query.pageSize))
    })
  ),
  http.get(
    apiPath("/personnel-files/export"),
    withAuth("personnel_file:read", ({ request, auth }) => {
      const { rows } = filteredRows(auth, request)
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([
          [
            "Sicil no",
            "Personel",
            "Lokasyon",
            "Birim",
            "Tamamlanma %",
            "Eksik",
            "Süresi geçmiş",
          ],
          ...rows.map((row) => [
            row.employeeNumber,
            row.name,
            row.locationName ?? "",
            row.orgUnitName ?? "",
            row.completion,
            row.missing.join(", "),
            row.expired.join(", "),
          ]),
        ]),
        "Eksik belgeler"
      )
      return fileResponse(
        XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
        `ozluk-eksik-belge-${today()}.xlsx`,
        XLSX_TYPE
      )
    })
  ),
  http.get(
    apiPath("/personnel-files/:personnelId/summary"),
    withAuth("personnel:read", ({ params, auth }) => {
      const person = findPerson(auth, String(params.personnelId))
      if (!person) return notFound()
      const row = fileRow(person, auth.tenant.slug)
      return ok({
        personnelId: person.id,
        completion: row.completion,
        missingCount: row.missing.length,
        expiredCount: row.expired.length,
      })
    })
  ),
  http.get(
    apiPath("/personnel-files/:personnelId"),
    withAuth("personnel_file:read", ({ params, auth }) => {
      const person = findPerson(auth, String(params.personnelId))
      if (!person) return notFound()
      return ok(personnelFile(person, auth.tenant.slug))
    })
  ),
  http.post(
    apiPath("/personnel-files/:personnelId/documents"),
    withAuth("personnel_file:write", async ({ request, params, auth }) => {
      const person = findPerson(auth, String(params.personnelId))
      if (!person) return notFound()
      const body = await parseBody(request, documentInputSchema)
      if (!body.success) return body.response
      const type = ohsSettingsFor(auth.tenant.slug).documentTypes.find(
        (item) => item.id === body.data.typeId && item.isActive
      )
      if (!type)
        return problem(422, "VALIDATION_FAILED", "Belge türü bulunamadı.", {
          typeId: ["Belge türü bulunamadı"],
        })
      if (type.validityMonths !== null && body.data.issuedAt === null)
        return problem(
          422,
          "VALIDATION_FAILED",
          "Belgenin düzenlenme tarihini girin.",
          {
            issuedAt: ["Belgenin düzenlenme tarihini girin"],
          }
        )
      const upload = db.uploads.findById(body.data.uploadId)
      if (
        upload?.tenantId !== auth.tenant.slug ||
        upload.purpose !== "personnel_doc"
      )
        return problem(422, "VALIDATION_FAILED", "Dosya bulunamadı.", {
          uploadId: ["Dosya bulunamadı"],
        })
      const version = {
        uploadId: upload.id,
        name: upload.name,
        issuedAt: body.data.issuedAt,
        uploadedAt: mockClock.now().toISOString(),
        uploadedBy: auth.actorName,
      }
      const existing = db.personnelDocuments.findFirst(
        (item) => item.personnelId === person.id && item.typeId === type.id
      )
      if (existing)
        db.personnelDocuments.update(existing.id, {
          versions: [...existing.versions, version],
        })
      else
        db.personnelDocuments.insert({
          id: newId("doc"),
          tenantId: auth.tenant.slug,
          personnelId: person.id,
          typeId: type.id,
          versions: [version],
        })
      audit(auth, {
        action: existing ? "Özlük belgesi yenilendi" : "Özlük belgesi yüklendi",
        targetType: "personnel_document",
        targetLabel: `${personName(person)} · ${type.name}`,
      })
      return created(personnelFile(person, auth.tenant.slug))
    })
  ),
  http.get(apiPath("/files/personnel-docs/:id"), ({ request, params }) => {
    const url = new URL(request.url)
    const expires = Number(url.searchParams.get("exp"))
    if (
      !url.searchParams.get("sig") ||
      !expires ||
      expires < mockClock.now().getTime()
    )
      return problem(403, "URL_EXPIRED", "Belge bağlantısının süresi doldu.")
    const id = String(params.id)
    const upload = db.uploads.findById(id)
    const isImage = upload?.contentType.startsWith("image/") ?? false
    return new Response(
      isImage
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e2e8f0"/><text x="20" y="150" font-size="18">Belge · ${id.slice(-8)}</text></svg>`
        : `%PDF-1.4\n% Puantio mock belge ${id}\n`,
      {
        headers: {
          "Content-Type": isImage ? "image/svg+xml" : "application/pdf",
          "Cache-Control": "no-store, private",
        },
      }
    )
  }),
]
