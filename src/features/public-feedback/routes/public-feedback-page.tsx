import { useMutation, useQuery } from "@tanstack/react-query"
import {
  CameraIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  ClockIcon,
  QrCodeIcon,
  RotateCwIcon,
} from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useParams } from "react-router"

import { ApiError } from "@/shared/api/errors"
import { accessibleBrandColor } from "@/shared/lib/color"
import { serverNow } from "@/shared/lib/server-time"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import { feedbackQueries, sendFeedback } from "../api/feedback-api"
import { cooldownRemaining, deviceId, markSent } from "../lib/device"
import {
  FEEDBACK_ERROR_CODES,
  FEEDBACK_NOTE_MAX,
  FEEDBACK_PHOTO_MAX_BYTES,
  type FeedbackReceipt,
  type PublicFeedbackTarget,
} from "../model/feedback"

/**
 * Login'siz QR bildirim sayfası (`/q/:token`). Kiracı kökünün dışında çalışır: kiracı
 * yapılandırması, kimlik ve realtime yüklenmez; marka token yanıtıyla gelir.
 */
export function PublicFeedbackPage() {
  const { token = "" } = useParams()
  const query = useQuery(feedbackQueries.target(token))

  if (query.isPending)
    return (
      <div
        role="status"
        aria-label="Yükleniyor"
        className="flex flex-1 items-center justify-center"
      >
        <Spinner className="size-6" />
      </div>
    )
  if (query.isError) {
    const error = query.error
    const invalid =
      error instanceof ApiError &&
      (error.code === FEEDBACK_ERROR_CODES.notFound ||
        error.code === FEEDBACK_ERROR_CODES.revoked)
    return (
      <Message
        icon={invalid ? QrCodeIcon : CircleAlertIcon}
        title={
          invalid
            ? error.code === FEEDBACK_ERROR_CODES.revoked
              ? "Bu QR kod artık kullanılmıyor"
              : "QR kod tanınmadı"
            : "Sayfa yüklenemedi"
        }
        description={
          invalid
            ? "Etiket yenilenmiş veya kaldırılmış olabilir. Lütfen alandaki güncel QR kodu okutun ya da tesis görevlisine haber verin."
            : "Bağlantınızı kontrol edip yeniden deneyin."
        }
        action={
          invalid ? null : (
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RotateCwIcon data-icon="inline-start" />
              Yeniden dene
            </Button>
          )
        }
      />
    )
  }
  return <FeedbackForm token={token} target={query.data} />
}

function Message({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof QrCodeIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section
      aria-labelledby="public-message"
      className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center"
    >
      <Icon className="size-10 text-muted-foreground" aria-hidden />
      <h1 id="public-message" className="font-heading text-xl font-semibold">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action}
    </section>
  )
}

function minutesText(ms: number) {
  return `${String(Math.max(1, Math.ceil(ms / 60_000)))} dakika`
}

function FeedbackForm({
  token,
  target,
}: {
  token: string
  target: PublicFeedbackTarget
}) {
  const ids = { note: useId(), photo: useId(), issues: useId() }
  const [issueCode, setIssueCode] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null)
  const [cooldownMs, setCooldownMs] = useState(() =>
    cooldownRemaining(token, target.cooldownMinutes, serverNow().getTime())
  )
  // Aynı form örneğinden giden tekrarlar sunucuda tek bildirim sayılır (idempotent)
  const requestId = useRef(crypto.randomUUID())
  // Durum güncellemesi render'a yansımadan gelen ikinci tıklamayı da engeller
  const submitting = useRef(false)
  const brandColor = accessibleBrandColor(target.tenant.primaryColor)

  useEffect(() => {
    const previous = document.title
    document.title = `${target.area?.name ?? target.locationName} · ${target.tenant.shortName}`
    return () => {
      document.title = previous
    }
  }, [target])

  const mutation = useMutation({
    mutationFn: () =>
      sendFeedback(token, {
        issueCode: issueCode ?? "",
        note,
        photo,
        requestId: requestId.current,
        deviceId: deviceId(),
      }),
    onSuccess: (data) => {
      markSent(token, serverNow().getTime())
      setReceipt(data)
    },
    onError: (failure) => {
      if (
        failure instanceof ApiError &&
        failure.code === FEEDBACK_ERROR_CODES.cooldown
      ) {
        setCooldownMs(target.cooldownMinutes * 60_000)
        return
      }
      setError(
        failure instanceof ApiError && failure.status < 500
          ? failure.message
          : "Bildiriminiz gönderilemedi. Lütfen yeniden deneyin."
      )
    },
    onSettled: () => {
      submitting.current = false
    },
  })

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (submitting.current || mutation.isPending) return
    if (!issueCode) {
      setError("Lütfen bir sorun seçin.")
      return
    }
    submitting.current = true
    setError(null)
    mutation.mutate()
  }

  const header = (
    <header className="flex items-center gap-3 border-b pb-4">
      {target.tenant.logoUrl ? (
        <img
          src={target.tenant.logoUrl}
          alt=""
          className="size-10 rounded-md object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-md bg-primary font-heading font-semibold text-primary-foreground"
          style={
            brandColor ? { background: brandColor, color: "#fff" } : undefined
          }
        >
          {target.tenant.shortName.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {target.tenant.displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {target.locationName}
        </p>
      </div>
    </header>
  )

  if (receipt)
    return (
      <>
        {header}
        <Message
          icon={CheckCircle2Icon}
          title="Teşekkürler!"
          description={
            receipt.merged
              ? `Bu sorun ekibimize zaten iletilmişti; bildiriminiz mevcut kayda eklendi (${receipt.reference}).`
              : `Bildiriminiz ekibimize iletildi. Kayıt no: ${receipt.reference}`
          }
        />
      </>
    )

  if (cooldownMs > 0)
    return (
      <>
        {header}
        <Message
          icon={ClockIcon}
          title="Bildiriminiz alındı"
          description={`Bu ${target.areaTerm.toLocaleLowerCase("tr")} için kısa süre önce bildirim gönderdiniz. Yeni bir bildirim için ${minutesText(cooldownMs)} sonra tekrar deneyebilirsiniz.`}
        />
      </>
    )

  return (
    <>
      {header}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold">
            {target.area?.name ?? target.locationName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {target.area
              ? [target.area.typeLabel, target.area.floor]
                  .filter(Boolean)
                  .join(" · ")
              : null}
          </p>
          <p className="text-sm">
            Bir sorun mu fark ettiniz? Seçip bize bildirin.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2" aria-describedby={ids.issues}>
          <legend className="mb-2 text-sm font-medium">Sorun</legend>
          <div className="grid grid-cols-2 gap-2">
            {target.issues.map((issue) => {
              const selected = issue.code === issueCode
              return (
                <button
                  key={issue.code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setIssueCode(issue.code)
                    setError(null)
                  }}
                  className={cn(
                    "min-h-14 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  )}
                >
                  {issue.label}
                </button>
              )
            })}
          </div>
          <p id={ids.issues} className="sr-only">
            Bir sorun seçin; seçili olan vurgulanır.
          </p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.note} className="text-sm font-medium">
            Not (isteğe bağlı)
          </label>
          <Textarea
            id={ids.note}
            value={note}
            maxLength={FEEDBACK_NOTE_MAX}
            rows={3}
            placeholder="Kısaca açıklayın"
            onChange={(event) => {
              setNote(event.target.value)
            }}
          />
          <p className="text-xs text-muted-foreground">
            Lütfen ad, telefon gibi kişisel bilgi yazmayın.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={ids.photo}
            className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <CameraIcon className="size-4" aria-hidden />
            {photo ? "Fotoğrafı değiştir" : "Fotoğraf ekle (isteğe bağlı)"}
          </label>
          <input
            id={ids.photo}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              if (file && file.size > FEEDBACK_PHOTO_MAX_BYTES) {
                setError("Fotoğraf en fazla 5 MB olabilir.")
                setPhoto(null)
                return
              }
              setPhoto(file)
            }}
          />
          {photo ? (
            <p className="text-xs text-muted-foreground">
              Seçilen: {photo.name}
            </p>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="text-sm font-medium text-red-700 dark:text-red-400"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          {mutation.isPending ? "Gönderiliyor…" : "Bildir"}
        </Button>
      </form>
    </>
  )
}
