import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { LocationCombobox } from "@/entities/location"
import { Can } from "@/entities/session"
import {
  locationAttendanceRulesQuery,
  shiftKeys,
  updateLocationAttendanceRules,
  type LocationAttendanceRules,
} from "@/entities/shift"
import { useTenant, useTerms } from "@/entities/tenant"
import { isApiError } from "@/shared/api/errors"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"

/** Lokasyon bazlı geç kalma toleransı ve alarm SLA'sı (kiracı varsayılanını daraltır) */
export function LocationRulesCard() {
  const terms = useTerms()
  const tenant = useTenant()
  const [locationId, setLocationId] = useState<string | null>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{terms.location.singular} bazlı yoklama kuralları</CardTitle>
        <CardDescription>
          Firma varsayılanı: geç kalma toleransı{" "}
          {tenant.rules.lateToleranceMinutes} dk, alarm SLA{" "}
          {tenant.rules.alarmSlaMinutes} dk. Sözleşmesi daha sıkı olan
          lokasyonlar için daraltın.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LocationCombobox
          aria-label={`Kural için ${terms.lower(terms.location)} seçin`}
          value={locationId}
          onValueChange={setLocationId}
          className="w-full max-w-sm"
        />
        {locationId ? (
          <RulesForm key={locationId} locationId={locationId} />
        ) : null}
      </CardContent>
    </Card>
  )
}

function RulesForm({ locationId }: { locationId: string }) {
  const query = useQuery(locationAttendanceRulesQuery(locationId))
  if (!query.data) return null
  return <RulesFormInner initial={query.data} />
}

function RulesFormInner({ initial }: { initial: LocationAttendanceRules }) {
  const [tolerance, setTolerance] = useState(
    initial.lateToleranceMinutes?.toString() ?? ""
  )
  const [sla, setSla] = useState(initial.alarmSlaMinutes?.toString() ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: () =>
      updateLocationAttendanceRules(initial.locationId, {
        lateToleranceMinutes: tolerance === "" ? null : Number(tolerance),
        alarmSlaMinutes: sla === "" ? null : Number(sla),
      }),
    meta: {
      successMessage: "Kurallar kaydedildi",
      invalidates: [shiftKeys.all],
    },
  })
  const save = async () => {
    setErrors({})
    try {
      await mutation.mutateAsync()
    } catch (error) {
      if (isApiError(error) && error.fieldErrors) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.fieldErrors).map(([field, messages]) => [
              field,
              messages[0] ?? "",
            ])
          )
        )
      }
    }
  }
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field data-invalid={Boolean(errors.lateToleranceMinutes) || undefined}>
        <FieldLabel htmlFor="loc-tolerance">
          Geç kalma toleransı (dk)
        </FieldLabel>
        <Input
          id="loc-tolerance"
          type="number"
          min={0}
          max={60}
          value={tolerance}
          onChange={(event) => {
            setTolerance(event.target.value)
          }}
        />
        <FieldDescription>Boş: firma varsayılanı</FieldDescription>
        <FieldError>{errors.lateToleranceMinutes}</FieldError>
      </Field>
      <Field data-invalid={Boolean(errors.alarmSlaMinutes) || undefined}>
        <FieldLabel htmlFor="loc-sla">Alarm SLA (dk)</FieldLabel>
        <Input
          id="loc-sla"
          type="number"
          min={5}
          max={120}
          value={sla}
          onChange={(event) => {
            setSla(event.target.value)
          }}
        />
        <FieldDescription>Boş: firma varsayılanı</FieldDescription>
        <FieldError>{errors.alarmSlaMinutes}</FieldError>
      </Field>
      <Can permission="schedule:write">
        <Button onClick={() => void save()} disabled={mutation.isPending}>
          Kaydet
        </Button>
      </Can>
    </div>
  )
}
