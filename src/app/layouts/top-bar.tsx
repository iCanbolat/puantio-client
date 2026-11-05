import { Fragment } from "react"
import { Link } from "react-router"

import { UserMenu } from "@/features/auth"
import { useRealtimeStatus } from "@/shared/api/realtime-hooks"
import { StatusBadge } from "@/shared/components/status-badge"
import { ThemeToggle } from "@/shared/components/theme-toggle"
import { useNow } from "@/shared/hooks/use-now"
import { formatDateLong, formatTime } from "@/shared/lib/format"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/ui/breadcrumb"
import { Separator } from "@/shared/ui/separator"
import { SidebarTrigger } from "@/shared/ui/sidebar"

import { useBreadcrumbs } from "../router/route-handle"

function Breadcrumbs() {
  const crumbs = useBreadcrumbs()
  if (crumbs.length === 0) return null
  return (
    <Breadcrumb aria-label="Sayfa konumu">
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={crumb.id}>
              <BreadcrumbItem
                className={
                  index < crumbs.length - 1
                    ? "hidden md:inline-flex"
                    : undefined
                }
              >
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.pathname} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isLast ? null : (
                <BreadcrumbSeparator className="hidden md:inline-flex" />
              )}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Sunucu saati: mock saat değiştirildiğinde de doğru saati gösterir. */
function ServerClock() {
  const now = useNow(15_000)
  return (
    <time
      dateTime={now.toISOString()}
      title={formatDateLong(now)}
      className="hidden font-mono text-sm text-muted-foreground tabular-nums sm:inline"
      data-testid="server-clock"
    >
      {formatTime(now)}
    </time>
  )
}

function RealtimeIndicator() {
  const status = useRealtimeStatus()
  if (status === "open") {
    return <StatusBadge tone="success">Canlı</StatusBadge>
  }
  if (status === "connecting" || status === "reconnecting") {
    return (
      <StatusBadge tone="warning" pulse>
        Bağlanıyor
      </StatusBadge>
    )
  }
  return <StatusBadge tone="neutral">Canlı bağlantı yok</StatusBadge>
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger aria-label="Menüyü aç/kapat" />
      <Separator orientation="vertical" className="mx-1 h-4" />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-3">
        <RealtimeIndicator />
        <ServerClock />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
