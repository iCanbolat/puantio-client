import { useQueryClient } from "@tanstack/react-query"
import {
  FlaskConicalIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useId, useState } from "react"

import { formatDateLong, formatTime } from "@/shared/lib/format"
import { toIsoDate } from "@/shared/lib/date"
import { firstSliderValue } from "@/shared/lib/slider"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Separator } from "@/shared/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet"
import { Slider } from "@/shared/ui/slider"

import { PLATFORM_USER_KEY, UNPROVISIONED_KEY } from "../auth/identities"
import { mockController } from "../browser"
import { HTTP_METHODS, type FaultMethod } from "../chaos"
import { mockClock } from "../clock"
import { isRealtimeBlocked } from "../realtime"
import { SEED_PROFILES, db, type SeedProfile } from "../db"
import { findScenario, scenarios } from "../scenarios"
import { useMockDevtoolsStore } from "./devtools-store"

const FAULT_STATUSES = [400, 401, 403, 404, 409, 422, 429, 500, 503] as const
const ADVANCE_STEPS = [
  { label: "+1 dk", ms: 60_000 },
  { label: "+5 dk", ms: 5 * 60_000 },
  { label: "+15 dk", ms: 15 * 60_000 },
  { label: "+1 sa", ms: 60 * 60_000 },
] as const

function useMockNow(): Date {
  const [now, setNow] = useState(() => mockClock.now())
  useEffect(() => {
    const update = () => {
      setNow(mockClock.now())
    }
    const timer = setInterval(update, 1000)
    const unsubscribe = mockClock.subscribe(update)
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [])
  return now
}

/** "2026-09-25T07:10" (İstanbul) */
function toLocalInput(date: Date): string {
  return `${toIsoDate(date)}T${formatTime(date)}`
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

export function MockDevtools() {
  const queryClient = useQueryClient()
  const state = useMockDevtoolsStore()
  const now = useMockNow()
  const [fieldMessage, setFieldMessage] = useState<string | null>(null)
  const [realtimeBlocked, setRealtimeBlockedState] = useState(isRealtimeBlocked)
  const [clockInput, setClockInput] = useState(() =>
    toLocalInput(mockClock.now())
  )
  const [faultPath, setFaultPath] = useState("")
  const [faultMethod, setFaultMethod] = useState<FaultMethod>("*")
  const [faultStatus, setFaultStatus] = useState<number>(500)
  const ids = {
    clock: useId(),
    latency: useId(),
    errorRate: useId(),
    faultPath: useId(),
  }

  const scenario = findScenario(state.scenarioId)
  const refetchAll = () => {
    void queryClient.resetQueries()
  }
  const isModified =
    state.scenarioId !== "default" ||
    state.clockOffsetMs !== 0 ||
    state.chaos.latencyMs > 0 ||
    state.chaos.errorRate > 0 ||
    state.chaos.faults.length > 0

  const phases = [...new Set(scenarios.map((item) => item.phase))]
  const tenants = db.tenants.findMany()
  const userItems = [
    ...db.users
      .findMany(
        (user) =>
          user.tenantId === state.tenantSlug && user.status !== "invited"
      )
      .map((user) => ({
        value: user.id,
        label: `${user.displayName}${user.title ? ` · ${user.title}` : ""}`,
      })),
    { value: PLATFORM_USER_KEY, label: "Puantio destek (platform personeli)" },
    { value: UNPROVISIONED_KEY, label: "Kayıtsız Keycloak hesabı" },
  ]
  const [userKey, setUserKey] = useState<string>(
    state.mockUserKey ?? userItems[0]?.value ?? PLATFORM_USER_KEY
  )

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant={isModified ? "default" : "outline"}
            size="sm"
            className="fixed right-20 bottom-4 z-50 shadow-lg"
            aria-label="Mock ve simülasyon paneli"
          />
        }
      >
        <FlaskConicalIcon data-icon="inline-start" />
        Mock
        {scenario && scenario.id !== "default" ? (
          <Badge variant="secondary" className="ml-1">
            {scenario.label}
          </Badge>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Mock ve simülasyon</SheetTitle>
          <SheetDescription>
            Senaryo, veri seti, sunucu saati ve ağ koşullarını değiştirin.
            Ayarlar sayfa yenilendiğinde korunur.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          <Section title="Kiracı ve kullanıcı">
            <Select
              value={state.tenantSlug}
              onValueChange={(value) => {
                if (value) mockController.selectTenant(value)
              }}
              items={tenants.map((tenant) => ({
                value: tenant.slug,
                label: tenant.displayName,
              }))}
            >
              <SelectTrigger className="w-full" aria-label="Kiracı">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.slug} value={tenant.slug}>
                    {tenant.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Select
                value={userKey}
                onValueChange={(value) => {
                  if (value) setUserKey(value)
                }}
                items={userItems}
              >
                <SelectTrigger
                  className="min-w-0 flex-1"
                  aria-label="Kullanıcı"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  mockController.signInAs(userKey)
                }}
              >
                Giriş yap
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Gerçekte kiracı alt alan adından, kullanıcı Keycloak oturumundan
              gelir.
            </p>
          </Section>

          <Separator />

          <Section title="Senaryo">
            <Select
              value={state.scenarioId}
              onValueChange={(value) => {
                mockController.selectScenario(String(value))
                refetchAll()
              }}
              items={scenarios.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
            >
              <SelectTrigger className="w-full" aria-label="Senaryo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {phases.map((phase) => (
                  <SelectGroup key={phase}>
                    <SelectLabel>Faz {phase}</SelectLabel>
                    {scenarios
                      .filter((item) => item.phase === phase)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {scenario ? (
              <p className="text-sm text-muted-foreground">
                {scenario.description}
              </p>
            ) : null}
          </Section>

          <Separator />

          <Section title="Veri seti">
            <div className="flex gap-2">
              <Select
                value={state.seedProfile}
                onValueChange={(value) => {
                  mockController.selectSeedProfile(value as SeedProfile)
                  refetchAll()
                }}
                items={Object.entries(SEED_PROFILES).map(
                  ([value, profile]) => ({
                    value,
                    label: profile.label,
                  })
                )}
              >
                <SelectTrigger className="flex-1" aria-label="Veri seti">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEED_PROFILES).map(([value, profile]) => (
                    <SelectItem key={value} value={value}>
                      {profile.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  mockController.resetDatabase()
                  refetchAll()
                }}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Sıfırla
              </Button>
            </div>
          </Section>

          <Separator />

          <Section title="Sunucu saati">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="font-heading text-2xl font-semibold tabular-nums"
                data-testid="mock-clock"
              >
                {formatTime(now)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatDateLong(now)}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                id={ids.clock}
                type="datetime-local"
                aria-label="Saati ayarla (İstanbul)"
                value={clockInput}
                onChange={(event) => {
                  setClockInput(event.target.value)
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  const parsed = Date.parse(`${clockInput}:00+03:00`)
                  if (Number.isNaN(parsed)) return
                  mockController.travelTo(new Date(parsed))
                  void queryClient.invalidateQueries()
                }}
              >
                Uygula
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ADVANCE_STEPS.map((step) => (
                <Button
                  key={step.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    mockController.advance(step.ms)
                    void queryClient.invalidateQueries()
                  }}
                >
                  {step.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                disabled={state.clockOffsetMs === 0}
                onClick={() => {
                  mockController.resetClock()
                  setClockInput(toLocalInput(mockClock.now()))
                  void queryClient.invalidateQueries()
                }}
              >
                Gerçek saat
              </Button>
            </div>
          </Section>

          <Separator />

          <Section title="Saha simülasyonu">
            <p className="text-sm text-muted-foreground">
              Saha uygulamasından gelen olaylar. Alarm değerlendirmesi 10 sn'de
              bir ve saat değiştiğinde çalışır.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const personnelId = mockController.simulateCheckIn()
                  setFieldMessage(
                    personnelId
                      ? "Bekleyen bir personel giriş yaptı."
                      : "Şu an giriş bekleyen vardiya yok."
                  )
                }}
              >
                Giriş gönder (QR)
              </Button>
              <Button
                variant={realtimeBlocked ? "destructive" : "outline"}
                size="sm"
                aria-pressed={realtimeBlocked}
                onClick={() => {
                  setRealtimeBlockedState(mockController.toggleRealtime())
                }}
              >
                {realtimeBlocked
                  ? "Canlı bağlantıyı aç"
                  : "Canlı bağlantıyı kopar"}
              </Button>
            </div>
            {fieldMessage ? (
              <p role="status" className="text-xs text-muted-foreground">
                {fieldMessage}
              </p>
            ) : null}
          </Section>

          <Separator />

          <Section title="Ağ koşulları">
            <div className="flex flex-col gap-2">
              <label
                htmlFor={ids.latency}
                className="flex justify-between text-sm"
              >
                <span>Gecikme</span>
                <span className="text-muted-foreground tabular-nums">
                  {state.chaos.latencyMs} ms
                </span>
              </label>
              <Slider
                id={ids.latency}
                aria-label="Gecikme"
                min={0}
                max={5000}
                step={100}
                value={state.chaos.latencyMs}
                onValueChange={(value) => {
                  mockController.updateChaos({
                    latencyMs: firstSliderValue(value),
                  })
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor={ids.errorRate}
                className="flex justify-between text-sm"
              >
                <span>Rastgele hata oranı</span>
                <span className="text-muted-foreground tabular-nums">
                  %{Math.round(state.chaos.errorRate * 100)}
                </span>
              </label>
              <Slider
                id={ids.errorRate}
                aria-label="Rastgele hata oranı"
                min={0}
                max={100}
                step={5}
                value={Math.round(state.chaos.errorRate * 100)}
                onValueChange={(value) => {
                  mockController.updateChaos({
                    errorRate: firstSliderValue(value) / 100,
                  })
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm">Endpoint'e hata enjekte et</span>
              <div className="grid grid-cols-[5.5rem_1fr_5rem_auto] gap-2">
                <Select
                  value={faultMethod}
                  onValueChange={(value) => {
                    setFaultMethod(value as FaultMethod)
                  }}
                >
                  <SelectTrigger size="sm" aria-label="HTTP metodu">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HTTP_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method === "*" ? "Tümü" : method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id={ids.faultPath}
                  aria-label="Yol içerir"
                  placeholder="/showcase/records"
                  value={faultPath}
                  onChange={(event) => {
                    setFaultPath(event.target.value)
                  }}
                  className="h-8"
                />
                <Select
                  value={String(faultStatus)}
                  onValueChange={(value) => {
                    setFaultStatus(Number(value))
                  }}
                >
                  <SelectTrigger size="sm" aria-label="HTTP durum kodu">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAULT_STATUSES.map((status) => (
                      <SelectItem key={status} value={String(status)}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon-sm"
                  aria-label="Hata kuralı ekle"
                  disabled={faultPath.trim() === ""}
                  onClick={() => {
                    mockController.updateChaos({
                      faults: [
                        ...state.chaos.faults,
                        {
                          id: crypto.randomUUID(),
                          method: faultMethod,
                          pathContains: faultPath.trim(),
                          status: faultStatus,
                        },
                      ],
                    })
                    setFaultPath("")
                  }}
                >
                  <PlusIcon />
                </Button>
              </div>
              {state.chaos.faults.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {state.chaos.faults.map((fault) => (
                    <li
                      key={fault.id}
                      className="flex items-center justify-between rounded-lg border px-2 py-1 font-mono text-xs"
                    >
                      <span>
                        {fault.method === "*" ? "ANY" : fault.method}{" "}
                        {fault.pathContains} → {fault.status}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Hata kuralını kaldır"
                        onClick={() => {
                          mockController.updateChaos({
                            faults: state.chaos.faults.filter(
                              (item) => item.id !== fault.id
                            ),
                          })
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Section>

          <Separator />

          <Button
            variant="outline"
            onClick={() => {
              mockController.resetAll()
              setClockInput(toLocalInput(mockClock.now()))
              refetchAll()
            }}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Tüm ayarları sıfırla
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
