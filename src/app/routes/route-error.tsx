import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { isRouteErrorResponse, useRouteError } from "react-router"

import { ApiError, ContractError, getErrorMessage } from "@/shared/api/errors"
import { env } from "@/shared/config/env"
import { Button } from "@/shared/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty"

import { ForbiddenPage, NotFoundPage } from "./status-pages"

/** Route seviyesinde yakalanan hatalar (loader, render, lazy chunk). */
export function RouteError() {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404)
    return <NotFoundPage />
  if (error instanceof ApiError && error.status === 403)
    return <ForbiddenPage />
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />

  const isContract = error instanceof ContractError
  const showDetails =
    env.VITE_APP_ENV !== "production" && error instanceof Error

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty role="alert">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="bg-destructive/10 text-destructive"
          >
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>
            {isContract ? "Beklenmeyen sunucu yanıtı" : "Bir şeyler ters gitti"}
          </EmptyTitle>
          <EmptyDescription>{getErrorMessage(error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            onClick={() => {
              window.location.reload()
            }}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Sayfayı yenile
          </Button>
          {showDetails ? (
            <pre className="max-h-60 w-full max-w-xl overflow-auto rounded-xl bg-muted p-3 text-left text-xs whitespace-pre-wrap">
              {error.message}
            </pre>
          ) : null}
        </EmptyContent>
      </Empty>
    </div>
  )
}
