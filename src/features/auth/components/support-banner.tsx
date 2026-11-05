import { useMutation } from "@tanstack/react-query"
import { LifeBuoyIcon } from "lucide-react"

import { useSession } from "@/entities/session"
import { formatTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"

import { endCurrentSupportSession } from "../api/support-api"
import { useSignOut } from "../lib/use-sign-out"

/** Platform personeli destek modundaysa tüm sayfalarda görünen uyarı bandı. */
export function SupportBanner() {
  const me = useSession()
  const signOut = useSignOut()
  const end = useMutation({
    mutationFn: endCurrentSupportSession,
    onSuccess: () => signOut(),
  })
  const support = me.supportSession
  if (!support) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      <LifeBuoyIcon className="size-4 shrink-0" aria-hidden />
      <span className="font-semibold">Destek modundasınız</span>
      <span>
        {support.agentName} · Gerekçe: {support.reason} · Bitiş{" "}
        {formatTime(support.expiresAt)}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        disabled={end.isPending}
        onClick={() => {
          end.mutate()
        }}
      >
        Destek oturumunu bitir
      </Button>
    </div>
  )
}
