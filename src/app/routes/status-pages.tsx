import {
  CalendarClockIcon,
  FileQuestionIcon,
  HomeIcon,
  PackageXIcon,
  PauseCircleIcon,
  ShieldOffIcon,
} from "lucide-react"
import { Link } from "react-router"

import { MODULES, type ModuleId } from "@/entities/tenant"
import { brand } from "@/shared/config/brand"
import { EmptyState } from "@/shared/components/empty-state"
import { buttonVariants } from "@/shared/ui/button"

import { paths } from "../router/paths"

// Gezinme bir bağlantıdır (role=link); yalnızca buton görünümündedir
const homeAction = (
  <Link to={paths.home()} className={buttonVariants({ variant: "outline" })}>
    <HomeIcon data-icon="inline-start" />
    Ana sayfaya dön
  </Link>
)

export function NotFoundPage() {
  return (
    <EmptyState
      icon={FileQuestionIcon}
      title="Sayfa bulunamadı"
      description="Aradığınız sayfa taşınmış veya kaldırılmış olabilir."
      action={homeAction}
    />
  )
}

export function ForbiddenPage() {
  return (
    <EmptyState
      icon={ShieldOffIcon}
      title="Bu sayfaya erişim yetkiniz yok"
      description="Erişim gerekiyorsa bölge sorumlunuz veya sistem yöneticinizle iletişime geçin."
      action={homeAction}
    />
  )
}

/** Kiracının paketinde olmayan modüle URL ile gelinmesi */
export function ModuleUnavailablePage({ module }: { module: ModuleId }) {
  return (
    <EmptyState
      icon={PackageXIcon}
      title="Paketinizde yok"
      description={`"${MODULES[module].label}" modülü firmanızın ${brand.productName} paketinde bulunmuyor. Modülü eklemek için firma yöneticinizle görüşün.`}
      action={homeAction}
    />
  )
}

/** Sonraki fazlarda geliştirilecek modül (yetki ve paket kontrolü bugünden uygulanır) */
export function UpcomingModulePage({
  title,
  phase,
}: {
  title: string
  phase: string
}) {
  return (
    <EmptyState
      icon={CalendarClockIcon}
      title={title}
      description={`Bu modül Faz ${phase}'de geliştirilecek.`}
      action={homeAction}
    />
  )
}

export function TenantSuspendedPage() {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center p-6">
      <EmptyState
        icon={PauseCircleIcon}
        title="Firma hesabı askıya alındı"
        description={`Bu firmanın ${brand.productName} hesabı geçici olarak kullanıma kapatıldı. Ayrıntı için firma yöneticinizle iletişime geçin.`}
      />
    </main>
  )
}
