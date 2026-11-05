import { useState, type ReactElement, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog"
import { Spinner } from "@/shared/ui/spinner"

interface ConfirmDialogProps {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<unknown> | undefined
  /** Tetikleyici bileşen (kontrolsüz kullanım) */
  trigger?: ReactElement
  /**
   * Kontrollü kullanım: listelerde her satıra ayrı diyalog yerine tek bir diyalog
   * açık/kapalı durumu dışarıdan yönetilir.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Geri alınamaz işlemler için onay diyaloğu. `onConfirm` bir Promise dönerse işlem bitene kadar
 * buton bekleme durumunda kalır; hata olursa diyalog açık kalır (mesaj toast ile gösterilir).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  destructive = false,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const handleConfirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      setOpen(false)
    } catch {
      // Hata mesajı global mutation handler'ı tarafından gösterilir; diyalog açık kalır.
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
      }}
    >
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => {
              void handleConfirm()
            }}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
