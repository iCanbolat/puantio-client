import { useMutation, useQuery } from "@tanstack/react-query"
import { FileTextIcon, UploadIcon } from "lucide-react"
import { useState } from "react"

import { Can, useCan } from "@/entities/session"
import { ApiError } from "@/shared/api/errors"
import { uploadFile } from "@/shared/api/uploads"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { FileDropzone } from "@/shared/components/file-dropzone"
import { toIsoDate } from "@/shared/lib/date"
import { formatDate, formatDateTime } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { Spinner } from "@/shared/ui/spinner"

import {
  addDocument,
  personnelFileKeys,
  personnelFileQueries,
} from "../api/personnel-file-api"
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  type PersonnelFileItem,
} from "../model/personnel-file"
import { CompletionBar, DocumentStateBadge } from "./file-ui"

/** Özlük okuma yetkisi olmayan (ör. bölge sorumlusu) için yalnızca tamamlanma özeti */
function SummaryOnly({ personnelId }: { personnelId: string }) {
  const query = useQuery(personnelFileQueries.summary(personnelId))
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  if (!query.data) return <Skeleton className="h-24 w-full" />
  return (
    <Card>
      <CardHeader>
        <CardTitle>Özlük dosyası</CardTitle>
        <CardDescription>
          Belgeleri görüntüleme yetkiniz yok; yalnızca tamamlanma durumu
          gösterilir.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <CompletionBar
          value={query.data.completion}
          label="Özlük dosyası tamamlanma"
        />
        <p className="text-sm text-muted-foreground">
          {query.data.missingCount} eksik · {query.data.expiredCount} süresi
          geçmiş belge
        </p>
      </CardContent>
    </Card>
  )
}

export function PersonnelFileTab({ personnelId }: { personnelId: string }) {
  const canRead = useCan("personnel_file:read")
  if (!canRead) return <SummaryOnly personnelId={personnelId} />
  return <FullFile personnelId={personnelId} />
}

function FullFile({ personnelId }: { personnelId: string }) {
  const query = useQuery(personnelFileQueries.detail(personnelId))
  const [uploadFor, setUploadFor] = useState<PersonnelFileItem | null>(null)
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  if (!query.data) return <Skeleton className="h-48 w-full" />
  const data = query.data
  return (
    <Card>
      <CardHeader>
        <CardTitle>Özlük dosyası</CardTitle>
        <CardDescription>
          Tamamlanma zorunlu belgelerden hesaplanır.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CompletionBar
          value={data.completion}
          label="Özlük dosyası tamamlanma"
        />
        {data.items.length === 0 ? (
          <EmptyState title="Belge kontrol listesi tanımlı değil" />
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Belgeler">
            {data.items.map((item) => {
              const current = item.versions[0]
              return (
                <li
                  key={item.typeId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {item.typeName}
                      {item.required ? "" : " (isteğe bağlı)"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {current
                        ? `${current.name} · ${formatDateTime(current.uploadedAt)}${item.validUntil ? ` · geçerli ${formatDate(item.validUntil)}'e kadar` : ""}`
                        : "Yüklenmedi"}
                      {item.versions.length > 1
                        ? ` · ${item.versions.length} sürüm`
                        : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <DocumentStateBadge state={item.state} />
                    {current ? (
                      <a
                        href={current.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
                        aria-label={`${item.typeName} belgesini aç`}
                      >
                        <FileTextIcon className="size-4" />
                      </a>
                    ) : null}
                    <Can permission="personnel_file:write">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setUploadFor(item)
                        }}
                      >
                        <UploadIcon data-icon="inline-start" />
                        {current ? "Yeni sürüm" : "Yükle"}
                      </Button>
                    </Can>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <Dialog
        open={uploadFor !== null}
        onOpenChange={(next) => {
          if (!next) setUploadFor(null)
        }}
      >
        <DialogContent>
          {uploadFor ? (
            <UploadForm
              personnelId={personnelId}
              item={uploadFor}
              onDone={() => {
                setUploadFor(null)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function UploadForm({
  personnelId,
  item,
  onDone,
}: {
  personnelId: string
  item: PersonnelFileItem
  onDone: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [issuedAt, setIssuedAt] = useState(toIsoDate(serverNow()))
  const [error, setError] = useState<string | null>(null)
  const needsDate = item.validityMonths !== null
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const upload = await uploadFile(file, "personnel_doc")
      return addDocument(personnelId, {
        typeId: item.typeId,
        uploadId: upload.id,
        issuedAt: needsDate ? issuedAt : null,
      })
    },
    meta: {
      successMessage: "Belge yüklendi",
      invalidates: [personnelFileKeys.all],
    },
  })
  const submit = () => {
    const file = files[0]
    if (!file) {
      setError("Dosya seçin")
      return
    }
    setError(null)
    mutation.mutate(file, { onSuccess: onDone })
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{item.typeName}</DialogTitle>
        <DialogDescription>
          Yeni sürüm eski sürümü silmez; geçmişte kalır.
          {needsDate
            ? ` Belge düzenlenme tarihinden itibaren ${String(item.validityMonths)} ay geçerlidir.`
            : ""}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {mutation.error instanceof ApiError ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <FileDropzone
          files={files}
          onFilesChange={setFiles}
          accept={DOCUMENT_ACCEPT}
          maxSizeBytes={DOCUMENT_MAX_BYTES}
          label="Belge"
          description="PDF veya görsel, en fazla 10 MB"
        />
        {error ? <FieldError>{error}</FieldError> : null}
        {needsDate ? (
          <Field>
            <FieldLabel htmlFor="document-issued">Düzenlenme tarihi</FieldLabel>
            <Input
              id="document-issued"
              type="date"
              value={issuedAt}
              onChange={(event) => {
                setIssuedAt(event.target.value)
              }}
            />
          </Field>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Yükle
        </Button>
      </DialogFooter>
    </>
  )
}
