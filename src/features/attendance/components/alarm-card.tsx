import {
  ArrowUpRightIcon,
  MessageSquarePlusIcon,
  PhoneIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react"

import { Can } from "@/entities/session"
import { SlaCountdown } from "@/shared/components/sla-countdown"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatTime } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Button, buttonVariants } from "@/shared/ui/button"

import { CLOSE_REASON_LABELS, type Alarm } from "../model/attendance"
import type { AlarmAction } from "./alarm-dialogs"

export function AlarmCard({
  alarm,
  onAction,
}: {
  alarm: Alarm
  onAction: (action: AlarmAction) => void
}) {
  const resolved = alarm.status === "resolved"
  return (
    <li
      aria-label={`${alarm.personnelName} alarmı`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        alarm.status === "escalated" && "border-destructive/60",
        !resolved && "shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{alarm.personnelName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {alarm.locationName}
            {alarm.orgUnitName ? ` · ${alarm.orgUnitName}` : ""}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            Vardiya {formatTime(alarm.shiftStartsAt)} · alarm{" "}
            {formatTime(alarm.createdAt)}
          </span>
        </div>
        {resolved ? (
          <StatusBadge tone="success">Çözüldü</StatusBadge>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <SlaCountdown dueAt={alarm.dueAt} />
            {alarm.status === "escalated" ? (
              <StatusBadge tone="danger">
                <ArrowUpRightIcon className="size-3" aria-hidden />
                Eskale: {alarm.escalatedTo}
              </StatusBadge>
            ) : null}
          </div>
        )}
      </div>
      {alarm.resolution ? (
        <p className="text-sm">
          <span className="font-medium">
            {CLOSE_REASON_LABELS[alarm.resolution.reason]}
          </span>
          {alarm.resolution.backupPersonnelName
            ? `: ${alarm.resolution.backupPersonnelName}`
            : ""}
          {alarm.resolution.note ? ` · ${alarm.resolution.note}` : ""}
          <span className="text-muted-foreground">
            {" "}
            ({alarm.resolvedBy},{" "}
            {alarm.resolvedAt ? formatTime(alarm.resolvedAt) : ""})
          </span>
        </p>
      ) : null}
      {alarm.notes.length > 0 ? (
        <ul
          className="flex flex-col gap-1 rounded-lg bg-muted/50 p-2 text-xs"
          aria-label="Notlar"
        >
          {alarm.notes.map((note) => (
            <li key={note.at}>
              <span className="font-medium">{note.author}</span>{" "}
              <span className="text-muted-foreground tabular-nums">
                {formatTime(note.at)}
              </span>
              : {note.text}
            </li>
          ))}
        </ul>
      ) : null}
      {resolved ? null : (
        <Can permission="alarm:respond">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              size="sm"
              onClick={() => {
                onAction("backup")
              }}
            >
              <UserPlusIcon data-icon="inline-start" />
              Yedek ata
            </Button>
            {alarm.personnelPhone ? (
              <a
                href={`tel:${alarm.personnelPhone.replaceAll(" ", "")}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <PhoneIcon data-icon="inline-start" />
                Personeli ara
              </a>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onAction("note")
              }}
            >
              <MessageSquarePlusIcon data-icon="inline-start" />
              Not ekle
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onAction("close")
              }}
            >
              <XCircleIcon data-icon="inline-start" />
              Kapat
            </Button>
          </div>
        </Can>
      )}
    </li>
  )
}
