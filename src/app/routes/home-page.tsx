import { useQuery } from "@tanstack/react-query"
import {
  ActivityIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  ClockIcon,
  RadioIcon,
} from "lucide-react"
import { z } from "zod"

import { http } from "@/shared/api/http"
import { useRealtimeStatus } from "@/shared/api/realtime-hooks"
import { PageHeader } from "@/shared/components/page-header"
import { StatCard } from "@/shared/components/stat-card"
import { useNow } from "@/shared/hooks/use-now"
import { formatDateLong, formatTime } from "@/shared/lib/format"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"

const healthSchema = z.object({
  status: z.literal("ok"),
  mocked: z.boolean().optional(),
})

const ROADMAP = [
  {
    phase: 0,
    title: "Altyapı",
    detail:
      "Kabuk, API katmanı, mock/simülasyon, test altyapısı, ortak bileşenler",
    done: true,
  },
  {
    phase: 1,
    title: "Kiracı, kimlik ve ana veri",
    detail:
      "Kiracı ayarları, Keycloak girişi, yetkiler, personel, lokasyon, müşteri, Excel aktarımı",
    done: true,
  },
  {
    phase: 2,
    title: "Vardiya ve puantaj",
    detail: "Canlı yoklama, gelmeyen personel alarmı, puantaj, bordro aktarımı",
    done: false,
  },
  {
    phase: 3,
    title: "Sözleşme ve hakediş",
    detail: "Kadro taahhüdü ve fiili kadro, hakediş",
    done: false,
  },
  {
    phase: 4,
    title: "Kalite ve müşteri",
    detail: "Denetim, QR bildirim, iş emirleri, müşteri portalı",
    done: false,
  },
  {
    phase: 5,
    title: "Stok ve zimmet",
    detail: "Depo, sevkiyat, zimmet, sözleşme kârlılığı",
    done: false,
  },
  {
    phase: 6,
    title: "İSG ve özlük",
    detail: "Eğitim, sağlık gözetimi, sertifikalar, dijital özlük",
    done: false,
  },
] as const

export function HomePage() {
  const now = useNow(15_000)
  const realtime = useRealtimeStatus()
  const health = useQuery({
    queryKey: ["system", "health"],
    queryFn: ({ signal }) =>
      http.get("/system/health", healthSchema, { signal }),
    meta: { silent: true },
  })

  const apiValue = health.isError
    ? "Erişilemiyor"
    : health.data?.mocked
      ? "Mock"
      : "Canlı"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Operasyon paneli"
        description="Saha personeli, puantaj, sözleşme ve kalite süreçlerinin tek merkezi. Modüller fazlar halinde devreye alınıyor."
      />

      <section
        aria-label="Sistem durumu"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <StatCard
          label="API"
          value={apiValue}
          hint={
            health.data?.mocked ? "Veriler MSW ile simüle ediliyor" : undefined
          }
          icon={ActivityIcon}
          tone={health.isError ? "danger" : "success"}
          isLoading={health.isPending}
        />
        <StatCard
          label="Sunucu saati"
          value={formatTime(now)}
          hint={formatDateLong(now)}
          icon={ClockIcon}
        />
        <StatCard
          label="Canlı kanal"
          value={realtime === "open" ? "Bağlı" : "Bağlı değil"}
          hint="Alarm ve yoklama olayları bu kanaldan gelir"
          icon={RadioIcon}
          tone={realtime === "open" ? "success" : "warning"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Yol haritası</CardTitle>
          <CardDescription>Geliştirme fazları ve durumları</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {ROADMAP.map((item) => {
              const Icon = item.done ? CheckCircle2Icon : CircleDashedIcon
              return (
                <li key={item.phase} className="flex items-start gap-3">
                  <Icon
                    className={
                      item.done
                        ? "mt-0.5 size-5 text-emerald-600"
                        : "mt-0.5 size-5 text-muted-foreground"
                    }
                    aria-hidden
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      Faz {item.phase}: {item.title}
                      <span className="sr-only">
                        {item.done ? " (tamamlandı)" : " (planlandı)"}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.detail}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
