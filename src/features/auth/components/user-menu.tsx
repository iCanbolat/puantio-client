import { LogOutIcon } from "lucide-react"

import { useSession } from "@/entities/session"
import { tenantInitials } from "@/entities/tenant"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

import { useSignOut } from "../lib/use-sign-out"

export function UserMenu() {
  const me = useSession()
  const signOut = useSignOut()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label={`Kullanıcı menüsü: ${me.user.displayName}`}
          />
        }
      >
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {tenantInitials(me.user.displayName)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">
                {me.user.displayName}
              </span>
              <span className="text-xs">{me.user.email}</span>
              <span className="text-xs">
                {me.roles.map((role) => role.name).join(", ")}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void signOut()
          }}
        >
          <LogOutIcon />
          Çıkış yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
