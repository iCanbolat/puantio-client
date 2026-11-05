import { useState } from "react"

import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { FileDropzone } from "@/shared/components/file-dropzone"
import { MapPickerLazy } from "@/shared/components/map-picker"
import { SlaCountdown } from "@/shared/components/sla-countdown"
import { StatCard } from "@/shared/components/stat-card"
import { StatusBadge } from "@/shared/components/status-badge"
import { ApiError, NetworkError } from "@/shared/api/errors"
import { useNow } from "@/shared/hooks/use-now"
import { formatDateLong, formatRelative, formatTime } from "@/shared/lib/format"
import { checkGeofence, type Geofence, type LatLng } from "@/shared/lib/geo"
import { serverNow } from "@/shared/lib/server-time"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { UsersIcon } from "lucide-react"

export function TimeTab() {
  const now = useNow(1000)
  const [anchor] = useState(() => serverNow().getTime())
  const examples = [
    { label: "Yeni alarm (15 dk SLA)", dueAt: anchor + 15 * 60_000 },
    { label: "Kritik eşik (5 dk altı)", dueAt: anchor + 4 * 60_000 },
    { label: "SLA aşıldı", dueAt: anchor - (2 * 60_000 + 15_000) },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>SLA geri sayımı</CardTitle>
          <CardDescription>
            Gelmeyen personel alarmı gibi süreli işler sunucu saatine göre
            sayılır. Mock panelinden saati ileri sararak eşik geçişlerini
            deneyebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {examples.map((example) => (
              <li
                key={example.label}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm">{example.label}</span>
                <SlaCountdown dueAt={example.dueAt} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sunucu saati</CardTitle>
          <CardDescription>
            Tarayıcı saati yanlış olsa bile tüm hesaplar bu saati kullanır.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-heading text-3xl font-semibold tabular-nums">
            {formatTime(now)}
          </p>
          <p className="text-sm text-muted-foreground">{formatDateLong(now)}</p>
          <p className="text-sm text-muted-foreground">
            Sayfa açılışı: {formatRelative(anchor, now)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/** Örnek check-in noktası: saha uygulamasından gelen konumun geofence kontrolü. */
const SAMPLE_CHECK_IN: LatLng = { lat: 41.0106, lng: 28.9818 }

export function MapTab() {
  const [fence, setFence] = useState<Geofence | null>(null)
  const check = fence ? checkGeofence(SAMPLE_CHECK_IN, fence) : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Geofence seçimi</CardTitle>
        <CardDescription>
          Haritaya tıklayarak lokasyon merkezini seçin, yarıçapı ayarlayın.
          Örnek check-in noktası ({SAMPLE_CHECK_IN.lat}, {SAMPLE_CHECK_IN.lng})
          için sonuç anında hesaplanır.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MapPickerLazy value={fence} onChange={setFence} />
        {check ? (
          <StatusBadge tone={check.inside ? "success" : "danger"}>
            Örnek check-in geofence {check.inside ? "içinde" : "dışında"} ·{" "}
            {check.distanceMeters} m
          </StatusBadge>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function FilesTab() {
  const [files, setFiles] = useState<File[]>([])
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dosya yükleme</CardTitle>
        <CardDescription>
          Excel içe aktarma sihirbazı (Faz 1) ve özlük belgeleri (Faz 6) bu
          bileşeni kullanır.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FileDropzone
          files={files}
          onFilesChange={setFiles}
          accept=".xlsx,.xls,.csv"
          maxSizeBytes={10 * 1024 * 1024}
          multiple
          label="Excel dosyası yükle"
          description="XLSX, XLS veya CSV, en fazla 10 MB."
        />
      </CardContent>
    </Card>
  )
}

export function StatesTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone="success">Giriş yaptı</StatusBadge>
        <StatusBadge tone="warning">Geç kaldı</StatusBadge>
        <StatusBadge tone="danger" pulse>
          Gelmedi
        </StatusBadge>
        <StatusBadge tone="info">Yedek atandı</StatusBadge>
        <StatusBadge tone="neutral">Bekleniyor</StatusBadge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Planlanan" value="120" icon={UsersIcon} />
        <StatCard
          label="Giriş yapan"
          value="112"
          tone="success"
          icon={UsersIcon}
        />
        <StatCard label="Geç kalan" value="5" tone="warning" icon={UsersIcon} />
        <StatCard label="Gelmeyen" value="3" tone="danger" icon={UsersIcon} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <EmptyState title="Kayıt yok" description="Boş liste durumu." />
        </Card>
        <Card>
          <ErrorState
            error={new NetworkError("offline")}
            onRetry={() => undefined}
          />
        </Card>
        <Card>
          <ErrorState
            error={
              new ApiError(500, { code: "INTERNAL", message: "Sunucu hatası" })
            }
            onRetry={() => undefined}
          />
        </Card>
      </div>
    </div>
  )
}
