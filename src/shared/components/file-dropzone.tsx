import { FileIcon, UploadCloudIcon, XIcon } from "lucide-react"
import { useId, useRef, useState, type DragEvent } from "react"

import {
  formatBytes,
  validateFiles,
  type FileRejection,
} from "@/shared/lib/file-validation"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"

export function FileDropzone({
  files,
  onFilesChange,
  accept,
  maxSizeBytes,
  multiple = false,
  label = "Dosya yükle",
  description,
  className,
}: {
  files: File[]
  onFilesChange: (files: File[]) => void
  accept?: string
  maxSizeBytes?: number
  multiple?: boolean
  label?: string
  description?: string
  className?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [rejections, setRejections] = useState<FileRejection[]>([])

  const handleFiles = (list: FileList | null) => {
    if (!list) return
    const { accepted, rejected } = validateFiles([...list], {
      accept,
      maxSizeBytes,
    })
    setRejections(rejected)
    if (accepted.length > 0) {
      onFilesChange(multiple ? [...files, ...accepted] : accepted.slice(0, 1))
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => {
          setDragging(false)
        }}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors data-dragging:border-primary data-dragging:bg-primary/5"
      >
        <UploadCloudIcon className="size-8 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="font-medium">
            {label}
          </label>
          <p className="text-sm text-muted-foreground">
            Dosyayı buraya sürükleyin veya seçin.
            {description ? ` ${description}` : null}
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Dosya seç
        </Button>
      </div>

      {rejections.length > 0 ? (
        <ul
          className="flex flex-col gap-1 text-sm text-destructive"
          role="alert"
        >
          {rejections.map((rejection) => (
            <li key={rejection.file.name}>
              {rejection.file.name}: {rejection.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Seçilen dosyalar">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${file.name} dosyasını kaldır`}
                onClick={() => {
                  onFilesChange(
                    files.filter((_, fileIndex) => fileIndex !== index)
                  )
                }}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
