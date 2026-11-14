import { useMutation, useQuery } from "@tanstack/react-query"
import { CalendarPlusIcon, ClipboardCheckIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { LocationCombobox } from "@/entities/location"
import {
  TRAINING_STATES,
  TRAINING_STATE_LABELS,
  type TrainingState,
} from "@/entities/ohs"
import { OrgUnitSelect } from "@/entities/org-unit"
import { Can } from "@/entities/session"
import { HAZARD_CLASS_LABELS, useTerms } from "@/entities/tenant"
import { ApiError } from "@/shared/api/errors"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EmptyState } from "@/shared/components/empty-state"
import { EnumFilter } from "@/shared/components/enum-filter"
import { ErrorState } from "@/shared/components/error-state"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { toIsoDate } from "@/shared/lib/date"
import { formatDate } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import {
  createTrainingSession,
  ohsKeys,
  ohsQueries,
  recordAttendance,
} from "../api/ohs-api"
import { TrainingStateBadge } from "../components/ohs-badges"
import {
  SESSION_STATUS_LABELS,
  trainingSessionInputSchema,
  trainingStatusParamsSchema,
  type TrainingSession,
  type TrainingStatusRow,
} from "../model/ohs"

const helper = createDataTableColumnHelper<TrainingStatusRow>()

const columns = helper.columns([
  helper.accessor("name", {
    header: "Personel",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="flex min-w-40 flex-col">
        <Link
          to={`${paths.personnel.detail(row.original.personnelId)}?sekme=isg`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
        <span className="text-xs text-muted-foreground">
          {row.original.employeeNumber}
          {row.original.locationName ? ` · ${row.original.locationName}` : ""}
        </span>
      </span>
    ),
    meta: { label: "Personel" },
  }),
  helper.accessor("typeName", {
    header: "Eğitim",
    enableSorting: false,
    meta: { label: "Eğitim" },
  }),
  helper.accessor("hazardClass", {
    header: "Tehlike sınıfı",
    enableSorting: false,
    cell: (info) => HAZARD_CLASS_LABELS[info.getValue()],
    meta: {
      label: "Tehlike sınıfı",
      exportValue: (row) => HAZARD_CLASS_LABELS[row.hazardClass],
    },
  }),
  helper.accessor("lastCompletedAt", {
    header: "Son eğitim",
    enableSorting: false,
    cell: (info) => {
      const value = info.getValue()
      return value ? formatDate(value) : "—"
    },
    meta: { label: "Son eğitim" },
  }),
  helper.accessor("dueAt", {
    header: "Yenileme",
    enableSorting: false,
    cell: (info) => {
      const value = info.getValue()
      return value ? formatDate(value) : "—"
    },
    meta: { label: "Yenileme" },
  }),
  helper.accessor("state", {
    header: "Durum",
    enableSorting: false,
    cell: (info) => <TrainingStateBadge state={info.getValue()} />,
    meta: {
      label: "Durum",
      exportValue: (row) => TRAINING_STATE_LABELS[row.state],
    },
  }),
])

export function TrainingsPage() {
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(
    trainingStatusParamsSchema
  )
  const { sekme, ...listParams } = params
  const settings = useQuery(ohsQueries.settings())
  const status = useQuery({
    ...ohsQueries.trainingStatus(listParams),
    enabled: sekme === "durum",
  })
  const [planOpen, setPlanOpen] = useState(false)
  const types = (settings.data?.trainingTypes ?? []).filter(
    (type) => type.isActive
  )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="İSG eğitimleri"
        description="Temel İSG eğitimi tehlike sınıfına göre yenilenir (az tehlikeli 3, tehlikeli 2, çok tehlikeli 1 yıl; firma ayarından değişir). Lokasyon gereksinimine bağlı eğitimler yalnızca ilgili personelde zorunludur."
        actions={
          <Can permission="ohs:write">
            <Button
              onClick={() => {
                setPlanOpen(true)
              }}
            >
              <CalendarPlusIcon data-icon="inline-start" />
              Eğitim planla
            </Button>
          </Can>
        }
      />
      <Tabs
        value={sekme}
        onValueChange={(value) => {
          setParams({ sekme: value === "oturumlar" ? "oturumlar" : "durum" })
        }}
      >
        <TabsList>
          <TabsTrigger value="durum">Personel durumu</TabsTrigger>
          <TabsTrigger value="oturumlar">Eğitim oturumları</TabsTrigger>
        </TabsList>
        <TabsContent value="durum" className="pt-4">
          <DataTable
            tableId="isg-egitim-durumu"
            caption="Personel eğitim durumu"
            columns={columns}
            data={status.data?.items}
            meta={status.data?.meta}
            state={listParams}
            onStateChange={(patch) => {
              setParams(patch)
            }}
            getRowId={(row) => `${row.personnelId}-${row.typeId}`}
            isLoading={status.isPending}
            isFetching={status.isFetching}
            error={status.error}
            onRetry={() => void status.refetch()}
            enableCsvExport
            toolbar={
              <FilterBar
                search={params.q}
                onSearchChange={(q) => {
                  setParams({ q, page: 1 }, { replace: true })
                }}
                searchPlaceholder="Ad veya sicil ara…"
                searchLabel="Personel ara"
                activeFilterCount={
                  [params.state, params.typeId, params.orgUnitId].filter(
                    Boolean
                  ).length
                }
                onReset={() => {
                  resetParams()
                }}
              >
                <EnumFilter<TrainingState>
                  label="Durum filtresi"
                  allLabel="Tüm durumlar"
                  value={params.state}
                  options={TRAINING_STATES}
                  labels={TRAINING_STATE_LABELS}
                  onChange={(state) => {
                    setParams({ state, page: 1 })
                  }}
                />
                <EnumFilter<string>
                  label="Eğitim filtresi"
                  allLabel="Tüm eğitimler"
                  value={params.typeId}
                  options={types.map((type) => type.id)}
                  labels={Object.fromEntries(
                    types.map((type) => [type.id, type.name])
                  )}
                  onChange={(typeId) => {
                    setParams({ typeId, page: 1 })
                  }}
                />
                <OrgUnitSelect
                  allowAll
                  aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
                  value={params.orgUnitId ?? null}
                  onValueChange={(orgUnitId) => {
                    setParams({ orgUnitId: orgUnitId ?? undefined, page: 1 })
                  }}
                  className="w-full sm:w-52"
                />
              </FilterBar>
            }
          />
        </TabsContent>
        <TabsContent value="oturumlar" className="pt-4">
          <SessionList />
        </TabsContent>
      </Tabs>
      <Dialog
        open={planOpen}
        onOpenChange={(next) => {
          if (!next) setPlanOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {planOpen ? (
            <PlanSessionForm
              types={types}
              onDone={() => {
                setPlanOpen(false)
                setParams({ sekme: "oturumlar" })
              }}
              onCancel={() => {
                setPlanOpen(false)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SessionList() {
  const sessions = useQuery(ohsQueries.sessions())
  const [attendanceFor, setAttendanceFor] = useState<TrainingSession | null>(
    null
  )
  if (sessions.isError)
    return (
      <ErrorState
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
      />
    )
  if (sessions.isPending) return <Spinner />
  if (sessions.data.length === 0)
    return (
      <EmptyState
        title="Henüz eğitim oturumu yok"
        description="“Eğitim planla” ile katılımcıları seçerek toplu eğitim oluşturun."
      />
    )
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Eğitim oturumları">
        {sessions.data.map((session) => {
          const attended = session.participants.filter(
            (item) => item.attended
          ).length
          return (
            <li key={session.id}>
              <Card className="h-full">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="flex flex-col">
                      <span className="font-medium">{session.typeName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {session.number}
                      </span>
                    </span>
                    <StatusBadge
                      tone={
                        session.status === "completed"
                          ? "success"
                          : session.status === "planned"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {SESSION_STATUS_LABELS[session.status]}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(session.date)} · {session.trainer}
                    {session.locationName ? ` · ${session.locationName}` : ""}
                  </p>
                  <p className="text-sm">
                    {session.status === "completed"
                      ? `${attended}/${session.participants.length} katıldı`
                      : `${session.participants.length} katılımcı`}
                  </p>
                  {session.status === "planned" ? (
                    <Can permission="ohs:write">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        onClick={() => {
                          setAttendanceFor(session)
                        }}
                      >
                        <ClipboardCheckIcon data-icon="inline-start" />
                        Katılımı kaydet
                      </Button>
                    </Can>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
      <Dialog
        open={attendanceFor !== null}
        onOpenChange={(next) => {
          if (!next) setAttendanceFor(null)
        }}
      >
        <DialogContent>
          {attendanceFor ? (
            <AttendanceForm
              session={attendanceFor}
              onDone={() => {
                setAttendanceFor(null)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PlanSessionForm({
  types,
  onDone,
  onCancel,
}: {
  types: { id: string; name: string }[]
  onDone: () => void
  onCancel: () => void
}) {
  const terms = useTerms()
  const [values, setValues] = useState({
    typeId: types[0]?.id ?? "",
    date: toIsoDate(serverNow()),
    trainer: "",
    locationId: null as string | null,
    durationHours: 2,
  })
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const candidates = useQuery(
    ohsQueries.candidates(values.typeId, values.locationId, search)
  )
  const mutation = useMutation({
    mutationFn: createTrainingSession,
    meta: { successMessage: "Eğitim planlandı", invalidates: [ohsKeys.all] },
  })
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    setSelected(next)
  }
  const submit = () => {
    const parsed = trainingSessionInputSchema.safeParse({
      ...values,
      participantIds: [...selected],
    })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      return
    }
    setErrors({})
    mutation.mutate(parsed.data, { onSuccess: onDone })
  }
  const items = candidates.data ?? []
  const urgent = items.filter(
    (item) => item.state === "never" || item.state === "overdue"
  )
  return (
    <>
      <DialogHeader>
        <DialogTitle>Eğitim planla</DialogTitle>
        <DialogDescription>
          Katılımcılar eğitim durumuna göre sıralanır: önce hiç almamış ve
          gecikmiş olanlar.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {mutation.error instanceof ApiError ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.typeId) || undefined}>
            <FieldLabel htmlFor="session-type">Eğitim türü</FieldLabel>
            <SimpleSelect
              id="session-type"
              value={values.typeId || null}
              onChange={(typeId) => {
                setValues({ ...values, typeId })
                setSelected(new Set())
              }}
              options={types.map((type) => ({
                value: type.id,
                label: type.name,
              }))}
            />
            {errors.typeId ? <FieldError>{errors.typeId}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.date) || undefined}>
            <FieldLabel htmlFor="session-date">Tarih</FieldLabel>
            <Input
              id="session-date"
              type="date"
              value={values.date}
              onChange={(event) => {
                setValues({ ...values, date: event.target.value })
              }}
            />
            {errors.date ? <FieldError>{errors.date}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.trainer) || undefined}>
            <FieldLabel htmlFor="session-trainer">Eğitmen</FieldLabel>
            <Input
              id="session-trainer"
              value={values.trainer}
              aria-invalid={Boolean(errors.trainer)}
              onChange={(event) => {
                setValues({ ...values, trainer: event.target.value })
              }}
            />
            {errors.trainer ? <FieldError>{errors.trainer}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.durationHours) || undefined}>
            <FieldLabel htmlFor="session-duration">Süre (saat)</FieldLabel>
            <Input
              id="session-duration"
              type="number"
              step="0.5"
              inputMode="decimal"
              value={
                Number.isNaN(values.durationHours) ? "" : values.durationHours
              }
              onChange={(event) => {
                setValues({
                  ...values,
                  durationHours: event.target.valueAsNumber,
                })
              }}
            />
            {errors.durationHours ? (
              <FieldError>{errors.durationHours}</FieldError>
            ) : null}
          </Field>
        </div>
        <Field>
          <FieldLabel>{terms.location.singular} (isteğe bağlı)</FieldLabel>
          <LocationCombobox
            value={values.locationId}
            onValueChange={(locationId) => {
              setValues({ ...values, locationId })
              setSelected(new Set())
            }}
          />
        </Field>
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={
            errors.participantIds ? "session-participants-error" : undefined
          }
        >
          <legend className="text-sm font-medium">
            Katılımcılar ({selected.size} seçili)
          </legend>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Katılımcı ara"
              placeholder="Ad veya sicil ara…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
              }}
              className="sm:max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              disabled={urgent.length === 0}
              onClick={() => {
                setSelected(
                  new Set([
                    ...selected,
                    ...urgent.map((item) => item.personnelId),
                  ])
                )
              }}
            >
              Gecikmiş ve hiç almamışları seç ({urgent.length})
            </Button>
          </div>
          <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border">
            {items.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">
                {candidates.isPending ? "Yükleniyor…" : "Uygun personel yok"}
              </li>
            ) : (
              items.map((item) => {
                const id = `participant-${item.personnelId}`
                return (
                  <li
                    key={item.personnelId}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={selected.has(item.personnelId)}
                        onCheckedChange={(checked) => {
                          toggle(item.personnelId, checked)
                        }}
                      />
                      <Label htmlFor={id} className="flex flex-col items-start">
                        <span>{item.name}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {item.employeeNumber}
                          {item.locationName ? ` · ${item.locationName}` : ""}
                        </span>
                      </Label>
                    </span>
                    <TrainingStateBadge state={item.state} />
                  </li>
                )
              })
            )}
          </ul>
          {errors.participantIds ? (
            <FieldError id="session-participants-error">
              {errors.participantIds}
            </FieldError>
          ) : null}
        </fieldset>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Planla
        </Button>
      </DialogFooter>
    </>
  )
}

function AttendanceForm({
  session,
  onDone,
}: {
  session: TrainingSession
  onDone: () => void
}) {
  const [attended, setAttended] = useState<Set<string>>(
    () => new Set(session.participants.map((item) => item.personnelId))
  )
  const mutation = useMutation({
    mutationFn: () =>
      recordAttendance(session.id, {
        attendance: session.participants.map((item) => ({
          personnelId: item.personnelId,
          attended: attended.has(item.personnelId),
        })),
      }),
    meta: {
      successMessage: "Katılım kaydedildi",
      invalidates: [ohsKeys.all],
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>Katılımı kaydet</DialogTitle>
        <DialogDescription>
          {session.typeName} · {formatDate(session.date)}. Yalnızca katılanların
          eğitim kaydı yenilenir.
        </DialogDescription>
      </DialogHeader>
      {mutation.error instanceof ApiError ? (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
        {session.participants.map((item) => {
          const id = `attended-${item.personnelId}`
          return (
            <li
              key={item.personnelId}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Checkbox
                id={id}
                checked={attended.has(item.personnelId)}
                onCheckedChange={(checked) => {
                  const next = new Set(attended)
                  if (checked) next.add(item.personnelId)
                  else next.delete(item.personnelId)
                  setAttended(next)
                }}
              />
              <Label htmlFor={id}>
                {item.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {item.employeeNumber}
                </span>
              </Label>
            </li>
          )
        })}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button
          disabled={mutation.isPending}
          onClick={() => {
            mutation.mutate(undefined, { onSuccess: onDone })
          }}
        >
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          {attended.size}/{session.participants.length} katıldı olarak kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
