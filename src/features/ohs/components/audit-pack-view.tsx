import { CERTIFICATE_LABELS } from "@/entities/location"
import { TRAINING_STATE_LABELS } from "@/entities/ohs"
import { HAZARD_CLASS_LABELS } from "@/entities/tenant"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatDate } from "@/shared/lib/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import type { AuditPack } from "../model/ohs"
import { ComplianceBadge } from "./ohs-badges"

/**
 * Müşteri denetim paketi: lokasyondaki personelin eğitim ve sertifika uygunluğu. Panel,
 * portal ve A4 baskıda aynı tablo. Sağlık sütunu yalnızca kiracı ayarı açıksa ve yalnızca
 * "Uygun" bilgisiyle görünür.
 */
export function AuditPackView({ pack }: { pack: AuditPack }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Lokasyon</dt>
          <dd className="font-medium">
            {pack.location.code} · {pack.location.name}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Müşteri</dt>
          <dd>{pack.location.customerName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tehlike sınıfı</dt>
          <dd>{HAZARD_CLASS_LABELS[pack.location.hazardClass]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Uygunluk</dt>
          <dd className="font-medium">
            {pack.summary.compliant}/{pack.summary.total} personel uygun ·{" "}
            {formatDate(pack.date)}
          </dd>
        </div>
      </dl>
      {pack.location.requiredCertificates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bu lokasyonda zorunlu sertifika tanımlı değil; yalnızca eğitimler
          değerlendirilir.
        </p>
      ) : null}
      <div className="rounded-md border">
        <Table scrollLabel={`${pack.location.name} uygunluk tablosu`}>
          <caption className="sr-only">
            {pack.location.name} personel uygunluk listesi
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Personel</TableHead>
              {pack.location.requiredCertificates.map((type) => (
                <TableHead key={type}>{CERTIFICATE_LABELS[type]}</TableHead>
              ))}
              <TableHead>Eğitimler</TableHead>
              {pack.includesHealth ? (
                <TableHead>Sağlık uygunluğu</TableHead>
              ) : null}
              <TableHead>Sonuç</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pack.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={pack.location.requiredCertificates.length + 4}
                  className="text-center text-muted-foreground"
                >
                  Bu lokasyonda çalışan personel yok
                </TableCell>
              </TableRow>
            ) : (
              pack.rows.map((row) => (
                <TableRow key={row.personnelId}>
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.position}
                      </span>
                    </span>
                  </TableCell>
                  {row.certificates.map((cert) => (
                    <TableCell key={cert.type}>
                      <span className="flex flex-col gap-0.5">
                        <ComplianceBadge state={cert.state} />
                        {cert.expiresAt ? (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(cert.expiresAt)}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                  ))}
                  <TableCell>
                    <ul className="flex flex-col text-xs">
                      {row.trainings.map((item) => (
                        <li key={item.typeName}>
                          {item.typeName}:{" "}
                          <span
                            className={
                              item.state === "overdue" || item.state === "never"
                                ? "font-medium text-red-700 dark:text-red-400"
                                : undefined
                            }
                          >
                            {TRAINING_STATE_LABELS[item.state]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  {pack.includesHealth ? (
                    <TableCell>
                      {row.health === "fit" ? "Uygun" : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <StatusBadge tone={row.compliant ? "success" : "danger"}>
                      {row.compliant ? "Uygun" : "Uygun değil"}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
