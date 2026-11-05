import { useId } from "react"

import {
  GEOFENCE_RADIUS,
  clampGeofenceRadius,
  type GeofenceLimits,
} from "@/shared/lib/geo"
import { firstSliderValue } from "@/shared/lib/slider"
import { Input } from "@/shared/ui/input"
import { Slider } from "@/shared/ui/slider"

/**
 * Geofence yarıçapı: kaydırıcı + sayısal giriş. Sınırlar kiracı ayarından gelir.
 * `clampOnBlur` kapalıysa (formlarda) değer kırpılmaz; sınır dışı değer form doğrulamasıyla
 * hata olarak gösterilir.
 */
export function GeofenceRadiusControl({
  value,
  onChange,
  limits = GEOFENCE_RADIUS,
  clampOnBlur = true,
  error,
}: {
  value: number
  onChange: (radius: number) => void
  limits?: GeofenceLimits
  clampOnBlur?: boolean
  error?: string | undefined
}) {
  const inputId = useId()
  const errorId = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        Geofence yarıçapı (metre)
      </label>
      <div className="flex items-center gap-3">
        <Slider
          aria-label="Geofence yarıçapı"
          min={limits.min}
          max={limits.max}
          step={5}
          value={clampGeofenceRadius(
            Number.isFinite(value) ? value : limits.default,
            limits
          )}
          onValueChange={(next) => {
            onChange(clampGeofenceRadius(firstSliderValue(next, value), limits))
          }}
          className="flex-1"
        />
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          value={Number.isFinite(value) ? value : ""}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            // Boş ara değer (silip yeniden yazma) NaN olarak taşınır; form "Yarıçap girin" der
            if (event.target.value === "") {
              onChange(Number.NaN)
              return
            }
            const parsed = Number(event.target.value)
            if (Number.isFinite(parsed)) onChange(parsed)
          }}
          onBlur={() => {
            if (clampOnBlur)
              onChange(
                clampGeofenceRadius(
                  Number.isFinite(value) ? value : limits.default,
                  limits
                )
              )
          }}
          className="w-24 tabular-nums"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          İzin verilen aralık {limits.min}–{limits.max} m.
        </p>
      )}
    </div>
  )
}
