import { useMutation, useQuery } from "@tanstack/react-query"
import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { legalEntityKeys, legalEntityQueries } from "@/entities/legal-entity"
import { useCan } from "@/entities/session"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatDateTime } from "@/shared/lib/format"
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
  deleteProfile,
  duplicateProfile,
  payrollKeys,
  payrollQueries,
  setLegalEntityProfile,
} from "../api/payroll-api"
import { ProfileEditorDialog } from "../components/profile-editor-dialog"
import {
  PAYROLL_ENCODING_LABELS,
  PAYROLL_FORMAT_LABELS,
  type PayrollProfile,
} from "../model/profile"

export function ProfilesPage() {
  const query = useQuery(payrollQueries.profiles())
  const entities = useQuery(legalEntityQueries.list())
  const canEdit = useCan("payroll:profiles")
  const [editing, setEditing] = useState<PayrollProfile | null>(null)
  const [removing, setRemoving] = useState<PayrollProfile | null>(null)
  const duplicate = useMutation({
    mutationFn: (profile: PayrollProfile) =>
      duplicateProfile(
        profile.id,
        `${profile.name.replace(" (taklit)", "")} – kopya`
      ),
    meta: { invalidates: [payrollKeys.all] },
    onSuccess: (copy) => {
      toast.success("Profil çoğaltıldı")
      setEditing(copy)
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteProfile(id),
    meta: { successMessage: "Profil silindi", invalidates: [payrollKeys.all] },
  })
  const assign = useMutation({
    mutationFn: (input: { legalEntityId: string; profileId: string }) =>
      setLegalEntityProfile(input.legalEntityId, input.profileId),
    meta: {
      successMessage: "Varsayılan profil güncellendi",
      invalidates: [payrollKeys.all, legalEntityKeys.all],
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bordro aktarım profilleri"
        description="Hazır profiller platform kütüphanesinden gelir ve düzenlenemez; çoğaltıp kendi formatınızı tanımlayın. Her tüzel kişiliğe bir varsayılan profil atanır."
      />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Profiller">
          {query.data.items.map((profile) => (
            <li
              key={profile.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            >
              <div className="flex flex-wrap items-start gap-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{profile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {profile.description}
                  </span>
                </span>
                {profile.libraryKey ? (
                  <StatusBadge tone="info">Hazır profil</StatusBadge>
                ) : null}
                {profile.simulated ? (
                  <StatusBadge tone="warning">Taklit</StatusBadge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {PAYROLL_FORMAT_LABELS[profile.format]} ·{" "}
                {PAYROLL_ENCODING_LABELS[profile.encoding]} ·{" "}
                {profile.columns.length} kolon · güncelleme{" "}
                {formatDateTime(profile.updatedAt)}
              </p>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      duplicate.mutate(profile)
                    }}
                    disabled={duplicate.isPending}
                  >
                    <CopyIcon data-icon="inline-start" />
                    Çoğalt
                  </Button>
                  {profile.libraryKey ? null : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(profile)
                        }}
                        aria-label={`${profile.name} profilini düzenle`}
                      >
                        <PencilIcon data-icon="inline-start" />
                        Düzenle
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRemoving(profile)
                        }}
                        aria-label={`${profile.name} profilini sil`}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Sil
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Tüzel kişilik varsayılanları</CardTitle>
          <CardDescription>
            Bordro aktarımında dönemin tüzel kişiliğine göre profil önceden
            seçilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul
            className="flex flex-col gap-3"
            aria-label="Tüzel kişilik varsayılan profilleri"
          >
            {(entities.data ?? []).map((entity) => (
              <li key={entity.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-60 flex-1 text-sm font-medium">
                  {entity.title}
                </span>
                <SimpleSelect
                  aria-label={`${entity.title} varsayılan profili`}
                  className="w-80"
                  disabled={!canEdit}
                  value={entity.payrollProfileId}
                  placeholder="Profil seçin"
                  onChange={(profileId) => {
                    assign.mutate({ legalEntityId: entity.id, profileId })
                  }}
                  options={(query.data?.items ?? []).map((profile) => ({
                    value: profile.id,
                    label: profile.name,
                  }))}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <ProfileEditorDialog
        profile={editing}
        onClose={() => {
          setEditing(null)
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null)
        }}
        title="Profili sil"
        description={removing?.name}
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id)
          setRemoving(null)
        }}
      />
    </div>
  )
}
