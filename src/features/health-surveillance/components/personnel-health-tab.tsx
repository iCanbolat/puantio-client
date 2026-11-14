import { EyeIcon, LockIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Dialog, DialogContent } from "@/shared/ui/dialog"

import { HealthEditForm, HealthRecordDetails, RevealForm } from "./health-ui"
import { useRevealedRecord } from "./use-revealed-record"

/**
 * Personel kartı "Sağlık" sekmesi. Yalnızca `health:read` yetkisinde render edilir
 * (çağıran `<Can>` ile sarar). Veri maskeli başlar; gerekçeyle açılır.
 */
export function PersonnelHealthTab({
  personnelId,
  personnelName,
}: {
  personnelId: string
  personnelName: string
}) {
  const [revealed, setRevealed] = useRevealedRecord()
  const [dialog, setDialog] = useState<"reveal" | "edit" | null>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sağlık gözetimi</CardTitle>
        <CardDescription>
          Özel nitelikli veri. Görüntüleme gerekçe ister ve erişim kaydına
          yazılır.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {revealed ? (
          <div className="flex flex-col gap-3">
            <HealthRecordDetails
              record={revealed.record}
              onEdit={() => {
                setDialog("edit")
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => {
                setRevealed(null)
              }}
            >
              <LockIcon data-icon="inline-start" />
              Maskele
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Muayene sonucu ve tarihler maskeli.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setDialog("reveal")
              }}
            >
              <EyeIcon data-icon="inline-start" />
              Göster
            </Button>
          </div>
        )}
      </CardContent>
      <Dialog
        open={dialog !== null}
        onOpenChange={(next) => {
          if (!next) setDialog(null)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {dialog === "reveal" ? (
            <RevealForm
              personnelId={personnelId}
              personnelName={personnelName}
              onRevealed={(result) => {
                setRevealed(result)
                setDialog(null)
              }}
              onCancel={() => {
                setDialog(null)
              }}
            />
          ) : dialog === "edit" && revealed ? (
            <HealthEditForm
              personnelId={personnelId}
              record={revealed.record}
              onSaved={(result) => {
                setRevealed(result)
                setDialog(null)
              }}
              onCancel={() => {
                setDialog(null)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
