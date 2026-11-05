import { Button } from "@/shared/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"

/** 409: kayıt sırasında plan başkası tarafından değiştirildi */
export function ConflictDialog({
  open,
  pending,
  onReload,
  onOverwrite,
  onClose,
}: {
  open: boolean
  pending: boolean
  onReload: () => void
  onOverwrite: () => void
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Plan başka biri tarafından değiştirildi
          </AlertDialogTitle>
          <AlertDialogDescription>
            Siz düzenlerken bu lokasyonun planı kaydedildi. Güncel planı
            yükleyip taslağınızı onun üzerine uygulayabilir ya da kendi
            taslağınızla üzerine yazabilirsiniz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button variant="outline" onClick={onReload} disabled={pending}>
            Güncel planı yükle
          </Button>
          <Button
            variant="destructive"
            onClick={onOverwrite}
            disabled={pending}
          >
            Üzerine yaz
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
