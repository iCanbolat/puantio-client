import { RefreshCwIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react"

import { getErrorMessage, isNetworkError } from "@/shared/api/errors"
import { Button } from "@/shared/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty"

/** Sorgu hata durumu: kullanıcı dostu mesaj + "Tekrar dene". */
export function ErrorState({
  error,
  onRetry,
  title = "Veriler yüklenemedi",
  className,
}: {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
}) {
  const Icon = isNetworkError(error) ? WifiOffIcon : TriangleAlertIcon
  return (
    <Empty className={className} role="alert">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-destructive/10 text-destructive"
        >
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{getErrorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCwIcon data-icon="inline-start" />
            Tekrar dene
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
