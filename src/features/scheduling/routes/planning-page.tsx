import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ListChecksIcon,
  SaveIcon,
  Settings2Icon,
  UndoIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { LocationCombobox } from "@/entities/location"
import { useCan } from "@/entities/session"
import {
  saveSchedule,
  shiftKeys,
  shiftQueries,
  type ShiftTemplate,
} from "@/entities/shift"
import { useTenant, useTerms } from "@/entities/tenant"
import { getErrorMessage, isApiError } from "@/shared/api/errors"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { toIsoDate } from "@/shared/lib/date"
import { serverNow } from "@/shared/lib/server-time"
import {
  addDaysIso,
  addMonths,
  eachIsoDate,
  monthRange,
  startOfIsoWeek,
} from "@/shared/lib/work-time"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import { BulkAssignDialog } from "../components/bulk-assign-dialog"
import { CellEditorDialog } from "../components/cell-editor-dialog"
import { ConflictDialog } from "../components/conflict-dialog"
import { ScheduleGrid } from "../components/schedule-grid"
import { ShiftPalette, TEMPLATE_DRAG_PREFIX } from "../components/shift-palette"
import { buildBoard, cellShiftId, type BoardCell } from "../domain/board"
import {
  evaluateSchedule,
  hasBlockingViolation,
  violationsByShift,
} from "../domain/rules"
import { usePlanningDraftStore } from "../model/planning-draft-store"

const paramsSchema = z.object({
  lokasyon: z.string().min(1).optional().catch(undefined),
  /** Haftanın pazartesisi veya ay ("2026-09") */
  tarih: z.string().min(7).optional().catch(undefined),
  gorunum: z.enum(["hafta", "ay"]).catch("hafta"),
})

function useRange(view: "hafta" | "ay", anchor: string | undefined) {
  const today = toIsoDate(serverNow())
  if (view === "ay") {
    const month = anchor?.slice(0, 7) ?? today.slice(0, 7)
    const range = monthRange(month)
    return { from: range.from, to: range.to, key: month }
  }
  const monday = startOfIsoWeek(anchor && anchor.length === 10 ? anchor : today)
  return { from: monday, to: addDaysIso(monday, 6), key: monday }
}

export function PlanningPage() {
  const terms = useTerms()
  const tenant = useTenant()
  const canWrite = useCan("schedule:write")
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParamsState(paramsSchema)
  const range = useRange(params.gorunum, params.tarih)
  const days = useMemo(
    () => eachIsoDate(range.from, range.to),
    [range.from, range.to]
  )
  const locationId = params.lokasyon

  const templatesQuery = useQuery(shiftQueries.templates())
  const scheduleQuery = useQuery({
    ...shiftQueries.schedule(locationId ?? "", range.from, range.to),
    enabled: Boolean(locationId),
  })
  const drafts = usePlanningDraftStore((state) => state.changes)
  const baseVersion = usePlanningDraftStore((state) => state.baseVersion)
  const setContext = usePlanningDraftStore((state) => state.setContext)
  const setCells = usePlanningDraftStore((state) => state.setCells)
  const discard = usePlanningDraftStore((state) => state.discard)
  const rebase = usePlanningDraftStore((state) => state.rebase)

  useEffect(() => {
    if (locationId) setContext(locationId)
  }, [locationId, setContext])

  const templates = useMemo(
    () =>
      new Map<string, ShiftTemplate>(
        (templatesQuery.data?.items ?? []).map((t) => [t.id, t])
      ),
    [templatesQuery.data]
  )
  const schedule = scheduleQuery.data
  const board = useMemo(
    () => (schedule ? buildBoard(schedule, days, drafts, templates) : null),
    [schedule, days, drafts, templates]
  )
  const violations = useMemo(
    () =>
      board && schedule
        ? evaluateSchedule(board.ruleShifts, board.ruleLeaves, {
            rules: tenant.rules.labor,
            overtimeHoursYtd: new Map(
              schedule.roster.map((member) => [
                member.id,
                member.overtimeHoursYtd,
              ])
            ),
          }).filter((violation) =>
            // Yalnızca bu lokasyonun görünen hücrelerine dokunan ihlaller
            violation.shiftIds.some(
              (id) => id.startsWith("cell:") && days.includes(id.slice(-10))
            )
          )
        : [],
    [board, schedule, tenant.rules.labor, days]
  )
  const byShift = useMemo(() => violationsByShift(violations), [violations])
  const blocking = hasBlockingViolation(violations)
  const draftCount = Object.keys(drafts).length

  const [activeCell, setActiveCell] = useState<BoardCell | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [conflict, setConflict] = useState(false)

  const mutation = useMutation({
    mutationFn: (force: boolean) =>
      saveSchedule({
        locationId: locationId ?? "",
        version: baseVersion ?? schedule?.version ?? 0,
        force,
        changes: Object.entries(drafts).map(([key, templateId]) => {
          const [personnelId = "", date = ""] = key.split("|")
          return { personnelId, date, templateId }
        }),
      }),
    meta: { silent: true },
    onSuccess: async (result) => {
      discard()
      setConflict(false)
      toast.success(`Plan kaydedildi (${result.applied} değişiklik)`)
      await queryClient.invalidateQueries({ queryKey: shiftKeys.schedules() })
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        setConflict(true)
        return
      }
      toast.error(getErrorMessage(error))
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  )
  const version = schedule?.version ?? 0
  const assign = (
    cells: { personnelId: string; date: string; templateId: string | null }[]
  ) => {
    setCells(cells, version)
  }
  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    if (!event.over || !activeId.startsWith(TEMPLATE_DRAG_PREFIX)) return
    const [personnelId = "", date = ""] = String(event.over.id).split("|")
    assign([
      {
        personnelId,
        date,
        templateId: activeId.slice(TEMPLATE_DRAG_PREFIX.length),
      },
    ])
  }

  const copyPreviousWeek = () => {
    if (!schedule) return
    const cells = schedule.roster.flatMap((member) =>
      days.map((date) => {
        const previous = schedule.assignments.find(
          (item) =>
            item.personnelId === member.id &&
            item.date === addDaysIso(date, -7) &&
            item.locationId === schedule.location.id &&
            item.kind === "regular"
        )
        return {
          personnelId: member.id,
          date,
          templateId: previous?.templateId ?? null,
        }
      })
    )
    assign(cells)
    toast.info("Önceki haftanın planı taslağa kopyalandı")
  }

  const navigate = (direction: -1 | 1) => {
    setParams({
      tarih:
        params.gorunum === "ay"
          ? addMonths(range.key, direction)
          : addDaysIso(range.from, direction * 7),
    })
  }
  const rangeLabel =
    params.gorunum === "ay"
      ? new Intl.DateTimeFormat("tr-TR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${range.key}-01T00:00:00Z`))
      : `${range.from.split("-").reverse().join(".")} – ${range.to.split("-").reverse().join(".")}`
  const readOnly = !canWrite

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vardiya planlama"
        description={`${terms.location.singular} × gün planı. Kural motoru İş Kanunu sınırlarını uyarı olarak gösterir; kesin kontrol kayıtta yapılır.`}
        actions={
          <Link
            to={paths.schedule.templates()}
            className={buttonVariants({ variant: "outline" })}
          >
            <Settings2Icon data-icon="inline-start" />
            Şablonlar ve kurallar
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <LocationCombobox
          aria-label={`${terms.location.singular} seçin`}
          value={locationId ?? null}
          selectedLabel={
            schedule
              ? `${schedule.location.code} · ${schedule.location.name}`
              : undefined
          }
          onValueChange={(value) => {
            setParams({ lokasyon: value ?? undefined })
          }}
          className="w-72"
        />
        <Tabs
          value={params.gorunum}
          onValueChange={(value) => {
            setParams({ gorunum: value as "hafta" | "ay", tarih: undefined })
          }}
        >
          <TabsList>
            <TabsTrigger value="hafta">Hafta</TabsTrigger>
            <TabsTrigger value="ay">Ay</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Önceki dönem"
            onClick={() => {
              navigate(-1)
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <span
            className="min-w-44 text-center text-sm font-medium capitalize tabular-nums"
            aria-live="polite"
          >
            {rangeLabel}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Sonraki dönem"
            onClick={() => {
              navigate(1)
            }}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {!locationId ? (
        <EmptyState
          icon={CalendarRangeIcon}
          title={`Plan için bir ${terms.lower(terms.location)} seçin`}
          description="Pano seçilen lokasyonun ekibini ve yedek havuzundan atananları gösterir."
        />
      ) : scheduleQuery.isError ? (
        <ErrorState
          error={scheduleQuery.error}
          onRetry={() => void scheduleQuery.refetch()}
        />
      ) : !schedule || !board || templatesQuery.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <aside className="flex flex-col gap-4">
              <ShiftPalette
                templates={templatesQuery.data?.items ?? []}
                disabled={readOnly}
              />
              {readOnly ? null : (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyPreviousWeek}
                    disabled={params.gorunum !== "hafta"}
                  >
                    <CopyIcon data-icon="inline-start" />
                    Önceki haftayı kopyala
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBulkOpen(true)
                    }}
                    disabled={selectedRows.size === 0}
                  >
                    <ListChecksIcon data-icon="inline-start" />
                    Toplu atama ({selectedRows.size})
                  </Button>
                </div>
              )}
            </aside>
            <div className="flex min-w-0 flex-col gap-3">
              {schedule.roster.length === 0 ? (
                <EmptyState
                  title="Bu lokasyonda personel yok"
                  description="Personel kartında ana lokasyon atayın."
                />
              ) : (
                <ScheduleGrid
                  roster={schedule.roster}
                  days={days}
                  cells={board.cells}
                  templates={templates}
                  violationsByShift={byShift}
                  selectedRows={selectedRows}
                  onToggleRow={(id) => {
                    setSelectedRows((current) => {
                      const next = new Set(current)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                  }}
                  onOpenCell={setActiveCell}
                  readOnly={readOnly}
                  targetHeadcount={schedule.location.targetHeadcount}
                  caption={`${schedule.location.name} vardiya planı`}
                />
              )}
              {violations.length > 0 ? (
                <Alert variant={blocking ? "destructive" : "default"}>
                  <AlertTitle>
                    {blocking
                      ? "Kaydı engelleyen ihlaller var"
                      : `${violations.length} kural uyarısı`}
                  </AlertTitle>
                  <AlertDescription>
                    <ul
                      className="mt-1 flex max-h-40 list-disc flex-col gap-0.5 overflow-y-auto pl-4"
                      aria-label="Kural ihlalleri"
                    >
                      {violations.slice(0, 30).map((violation, index) => {
                        const name = schedule.roster.find(
                          (member) => member.id === violation.personnelId
                        )?.name
                        return (
                          <li
                            key={`${violation.code}-${violation.personnelId}-${index}`}
                          >
                            <span className="font-medium">{name}: </span>
                            {violation.message}
                          </li>
                        )
                      })}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>
          {readOnly ? null : (
            <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
              <span
                className="text-sm text-muted-foreground"
                aria-live="polite"
              >
                {draftCount > 0
                  ? `${draftCount} kaydedilmemiş değişiklik`
                  : "Taslak yok"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={draftCount === 0}
                onClick={() => {
                  discard()
                }}
              >
                <UndoIcon data-icon="inline-start" />
                Taslağı at
              </Button>
              <Button
                onClick={() => {
                  mutation.mutate(false)
                }}
                disabled={draftCount === 0 || blocking || mutation.isPending}
              >
                <SaveIcon data-icon="inline-start" />
                Planı kaydet
              </Button>
            </div>
          )}
        </DndContext>
      )}

      <CellEditorDialog
        cell={activeCell}
        member={schedule?.roster.find(
          (member) => member.id === activeCell?.personnelId
        )}
        templates={templatesQuery.data?.items ?? []}
        violations={
          activeCell
            ? (byShift.get(
                cellShiftId(activeCell.personnelId, activeCell.date)
              ) ?? [])
            : []
        }
        onSelect={(templateId) => {
          if (activeCell)
            assign([
              {
                personnelId: activeCell.personnelId,
                date: activeCell.date,
                templateId,
              },
            ])
          setActiveCell(null)
        }}
        onClose={() => {
          setActiveCell(null)
        }}
      />
      {schedule ? (
        <BulkAssignDialog
          key={`${range.key}-${String(bulkOpen)}`}
          open={bulkOpen}
          roster={schedule.roster}
          selectedRows={selectedRows}
          days={days}
          templates={templatesQuery.data?.items ?? []}
          onApply={assign}
          onClose={() => {
            setBulkOpen(false)
          }}
        />
      ) : null}
      <ConflictDialog
        open={conflict}
        pending={mutation.isPending}
        onClose={() => {
          setConflict(false)
        }}
        onReload={() => {
          void scheduleQuery.refetch().then((result) => {
            if (result.data) rebase(result.data.version)
            setConflict(false)
            toast.info("Güncel plan yüklendi; taslağınız korunuyor")
          })
        }}
        onOverwrite={() => {
          mutation.mutate(true)
        }}
      />
    </div>
  )
}
