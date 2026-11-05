import { useMutation, useQuery } from "@tanstack/react-query"
import { PencilIcon, PowerIcon, UserPlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Can, useCan, useSession } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import {
  DataTable,
  DataTableColumnHeader,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge, type StatusTone } from "@/shared/components/status-badge"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"

import {
  setUserStatus,
  usersRolesKeys,
  usersRolesQueries,
} from "../api/users-roles-api"
import { UserDialog } from "../components/user-dialog"
import {
  USER_STATUSES,
  USER_STATUS_LABELS,
  userListParamsSchema,
  type TenantUser,
  type UserStatus,
} from "../model/users-roles"

const TONES: Record<UserStatus, StatusTone> = {
  invited: "info",
  active: "success",
  disabled: "neutral",
}

const helper = createDataTableColumnHelper<TenantUser>()

export function UsersPage() {
  const terms = useTerms()
  const me = useSession()
  const canWrite = useCan("user:write")
  const [params, setParams, resetParams] =
    useSearchParamsState(userListParamsSchema)
  const query = useQuery(usersRolesQueries.users(params))
  const [dialog, setDialog] = useState<{ user: TenantUser | null } | null>(null)
  const [toggling, setToggling] = useState<TenantUser | null>(null)
  const toggle = useMutation({
    mutationFn: (user: TenantUser) =>
      setUserStatus(
        user.id,
        user.status === "disabled" ? "active" : "disabled"
      ),
    meta: {
      successMessage: "Kullanıcı durumu güncellendi",
      invalidates: [usersRolesKeys.users],
    },
  })

  const scopeLabel = (user: TenantUser) => {
    switch (user.scope.kind) {
      case "all":
        return "Tüm firma"
      case "org_units":
        return `${user.scope.ids.length} ${terms.orgLevels[0] ? terms.lower(terms.orgLevels[0]) : "birim"}`
      case "locations":
        return `${user.scope.ids.length} ${terms.lower(terms.location)}`
      case "customers":
        return `${user.scope.ids.length} müşteri`
    }
  }

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("displayName", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Ad soyad" />
          ),
          cell: ({ row }) => (
            <span className="flex min-w-48 flex-col">
              <span className="font-medium">{row.original.displayName}</span>
              <span className="text-xs text-muted-foreground">
                {row.original.email}
              </span>
            </span>
          ),
          meta: { label: "Ad soyad" },
          enableHiding: false,
        }),
        helper.accessor("roles", {
          header: "Roller",
          enableSorting: false,
          cell: (info) =>
            info
              .getValue()
              .map((role) => role.name)
              .join(", "),
          meta: {
            label: "Roller",
            exportValue: (row) => row.roles.map((role) => role.name).join(", "),
          },
        }),
        helper.accessor("scope", {
          header: "Kapsam",
          enableSorting: false,
          cell: ({ row }) => scopeLabel(row.original),
          meta: { label: "Kapsam", exportValue: scopeLabel },
        }),
        helper.accessor("status", {
          header: "Durum",
          enableSorting: false,
          cell: (info) => (
            <StatusBadge tone={TONES[info.getValue()]}>
              {USER_STATUS_LABELS[info.getValue()]}
            </StatusBadge>
          ),
          meta: {
            label: "Durum",
            exportValue: (row) => USER_STATUS_LABELS[row.status],
          },
        }),
        helper.accessor("lastLoginAt", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Son giriş" />
          ),
          cell: (info) => {
            const value = info.getValue()
            return (
              <span className="tabular-nums">
                {value ? formatDateTime(value) : "—"}
              </span>
            )
          },
          meta: { label: "Son giriş" },
        }),
        ...(canWrite
          ? [
              helper.display({
                id: "actions",
                header: () => <span className="sr-only">İşlemler</span>,
                cell: ({ row }) => (
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${row.original.displayName} düzenle`}
                      onClick={() => {
                        setDialog({ user: row.original })
                      }}
                    >
                      <PencilIcon />
                    </Button>
                    {row.original.id !== me.user.id ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${row.original.displayName} ${row.original.status === "disabled" ? "etkinleştir" : "devre dışı bırak"}`}
                        onClick={() => {
                          setToggling(row.original)
                        }}
                      >
                        <PowerIcon />
                      </Button>
                    ) : null}
                  </div>
                ),
                enableHiding: false,
                meta: { label: "İşlemler", align: "right" },
              }),
            ]
          : []),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, me.user.id, terms]
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kullanıcılar"
        description="Web paneli kullanıcıları. Saha personeli saha uygulamasına telefon numarasıyla girer; burada listelenmez."
        actions={
          <Can permission="user:write">
            <Button
              onClick={() => {
                setDialog({ user: null })
              }}
            >
              <UserPlusIcon data-icon="inline-start" />
              Kullanıcı davet et
            </Button>
          </Can>
        }
      />
      <DataTable
        tableId="kullanicilar"
        caption="Kullanıcılar"
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        state={params}
        onStateChange={(patch) => {
          setParams(patch)
        }}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        toolbar={
          <FilterBar
            search={params.q}
            onSearchChange={(q) => {
              setParams({ q, page: 1 }, { replace: true })
            }}
            searchPlaceholder="Ad veya e-posta ara…"
            searchLabel="Kullanıcılarda ara"
            activeFilterCount={params.status ? 1 : 0}
            onReset={resetParams}
          >
            <EnumFilter<UserStatus>
              label="Durum filtresi"
              allLabel="Tüm durumlar"
              value={params.status}
              options={USER_STATUSES}
              labels={USER_STATUS_LABELS}
              onChange={(status) => {
                setParams({ status, page: 1 })
              }}
            />
          </FilterBar>
        }
      />
      <UserDialog
        open={dialog !== null}
        user={dialog?.user ?? null}
        onClose={() => {
          setDialog(null)
        }}
      />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => {
          if (!open) setToggling(null)
        }}
        title={
          toggling?.status === "disabled"
            ? "Kullanıcı etkinleştirilsin mi?"
            : "Kullanıcı devre dışı bırakılsın mı?"
        }
        description={
          toggling ? `${toggling.displayName} (${toggling.email})` : undefined
        }
        confirmLabel={
          toggling?.status === "disabled" ? "Etkinleştir" : "Devre dışı bırak"
        }
        destructive={toggling?.status !== "disabled"}
        onConfirm={() => (toggling ? toggle.mutateAsync(toggling) : undefined)}
      />
    </div>
  )
}
