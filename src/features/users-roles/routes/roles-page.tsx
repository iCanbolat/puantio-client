import { useMutation, useQuery } from "@tanstack/react-query"
import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

import {
  deleteRole,
  usersRolesKeys,
  usersRolesQueries,
} from "../api/users-roles-api"
import { RoleDialog, type RoleDialogState } from "../components/role-dialog"
import type { Role } from "../model/users-roles"

export function RolesPage() {
  const query = useQuery(usersRolesQueries.roles())
  const [dialog, setDialog] = useState<RoleDialogState | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const remove = useMutation({
    mutationFn: (role: Role) => deleteRole(role.id),
    meta: {
      successMessage: "Rol silindi",
      invalidates: [usersRolesKeys.roles],
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roller"
        description="Sistem rolleri şablondur; kopyalayıp firmanıza özel rol (ör. Proje Şefi) oluşturabilirsiniz."
        actions={
          <Button
            onClick={() => {
              setDialog({ role: null, template: null })
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Yeni rol
          </Button>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-60 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ul
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Roller"
        >
          {query.data.map((role) => (
            <li key={role.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {role.name}
                    <StatusBadge
                      tone={role.kind === "system" ? "info" : "success"}
                    >
                      {role.kind === "system" ? "Sistem" : "Özel"}
                    </StatusBadge>
                  </CardTitle>
                  {role.description ? (
                    <CardDescription>{role.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{role.permissions.length} yetki</span>
                  <span>·</span>
                  <span>{role.userCount} kullanıcı</span>
                  <span className="ml-auto flex gap-1">
                    {role.kind === "system" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDialog({ role: null, template: role })
                        }}
                        aria-label={`${role.name} rolünü kopyala`}
                      >
                        <CopyIcon data-icon="inline-start" />
                        Kopyala
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${role.name} düzenle`}
                          onClick={() => {
                            setDialog({ role, template: null })
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${role.name} sil`}
                          onClick={() => {
                            setDeleting(role)
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    )}
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <RoleDialog
        state={dialog}
        onClose={() => {
          setDialog(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Rol silinsin mi?"
        description={
          deleting ? `"${deleting.name}" kalıcı olarak silinecek.` : undefined
        }
        confirmLabel="Sil"
        destructive
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : undefined)}
      />
    </div>
  )
}
