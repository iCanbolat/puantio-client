import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"

import {
  MODULES,
  MODULE_IDS,
  SERVICE_LINE_LABELS,
  hasModule,
  tenantKeys,
  useTenant,
  type TenantConfig,
} from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { accessibleBrandColor, isHexColor } from "@/shared/lib/color"
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"

import { updateTenantSettings } from "../api/tenant-settings-api"
import {
  tenantSettingsInputSchema,
  type TenantSettingsInput,
  type TenantSettingsPayload,
} from "../model/tenant-settings"

const FIELDS = [
  "displayName",
  "shortName",
  "branding.primaryColor",
  "branding.logoUrl",
  "rules.idleTimeoutMinutes",
  "rules.lateToleranceMinutes",
  "rules.alarmSlaMinutes",
  "rules.escalationMinutes",
  "rules.geofence",
] as const

function toDefaults(tenant: TenantConfig): TenantSettingsInput {
  return {
    displayName: tenant.displayName,
    shortName: tenant.shortName,
    branding: {
      primaryColor: tenant.branding.primaryColor ?? "",
      logoUrl: tenant.branding.logoUrl ?? "",
    },
    terminology: tenant.terminology,
    rules: tenant.rules,
  }
}

function NumberField({
  id,
  label,
  error,
  description,
  registration,
}: {
  id: string
  label: string
  error?: { message?: string | undefined } | undefined
  description?: string
  registration: ReturnType<
    ReturnType<typeof useForm<TenantSettingsInput>>["register"]
  >
}) {
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        aria-invalid={Boolean(error)}
        {...registration}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={[error]} />
    </Field>
  )
}

export function TenantSettingsPage() {
  const tenant = useTenant()
  const queryClient = useQueryClient()
  const form = useForm<TenantSettingsInput, unknown, TenantSettingsPayload>({
    resolver: zodResolver(tenantSettingsInputSchema),
    defaultValues: toDefaults(tenant),
  })
  const color = useWatch({
    control: form.control,
    name: "branding.primaryColor",
  })
  const mutation = useMutation({
    mutationFn: updateTenantSettings,
    meta: { successMessage: "Firma ayarları kaydedildi" },
    onSuccess: (config) => {
      queryClient.setQueryData(tenantKeys.config(config.slug), config)
      form.reset(toDefaults(config))
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
    } catch (error) {
      applyApiErrorToForm(error, form.setError, FIELDS)
    }
  })
  const { errors, isSubmitting, isDirty } = form.formState
  const colorValue = typeof color === "string" ? color : ""
  const colorOk = colorValue === "" || accessibleBrandColor(colorValue) !== null

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex flex-col gap-6"
    >
      <PageHeader
        title="Firma ayarları"
        description="Marka, kavram adları ve kural varsayılanları tüm kullanıcılar için geçerlidir."
        actions={
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            Kaydet
          </Button>
        }
      />
      {errors.root?.server?.message ? (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Firma ve marka</CardTitle>
          <CardDescription>
            Menüde, giriş sayfasında, QR bildirim sayfasında ve müşteri
            portalında görünür.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field data-invalid={Boolean(errors.displayName) || undefined}>
                <FieldLabel htmlFor="tenant-name">Firma adı</FieldLabel>
                <Input
                  id="tenant-name"
                  aria-invalid={Boolean(errors.displayName)}
                  {...form.register("displayName")}
                />
                <FieldError errors={[errors.displayName]} />
              </Field>
              <Field data-invalid={Boolean(errors.shortName) || undefined}>
                <FieldLabel htmlFor="tenant-short">Kısa ad</FieldLabel>
                <Input
                  id="tenant-short"
                  maxLength={24}
                  aria-invalid={Boolean(errors.shortName)}
                  {...form.register("shortName")}
                />
                <FieldError errors={[errors.shortName]} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                data-invalid={
                  Boolean(errors.branding?.primaryColor) || undefined
                }
              >
                <FieldLabel htmlFor="tenant-color">Marka rengi</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="tenant-color"
                    placeholder="#1e3a8a"
                    className="font-mono"
                    aria-invalid={Boolean(errors.branding?.primaryColor)}
                    {...form.register("branding.primaryColor")}
                  />
                  <span
                    aria-hidden
                    className="size-9 shrink-0 rounded-lg border"
                    style={{
                      background: isHexColor(colorValue)
                        ? colorValue
                        : "transparent",
                    }}
                  />
                </div>
                <FieldError errors={[errors.branding?.primaryColor]} />
                {colorValue && isHexColor(colorValue) ? (
                  <p
                    className={`flex items-center gap-1.5 text-sm ${colorOk ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-400"}`}
                    role="status"
                  >
                    {colorOk ? (
                      <CheckCircle2Icon className="size-4" aria-hidden />
                    ) : (
                      <TriangleAlertIcon className="size-4" aria-hidden />
                    )}
                    {colorOk
                      ? "Beyaz metinle yeterli kontrast (WCAG AA)"
                      : "Kontrast yetersiz: varsayılan tema rengi kullanılacak"}
                  </p>
                ) : null}
              </Field>
              <Field
                data-invalid={Boolean(errors.branding?.logoUrl) || undefined}
              >
                <FieldLabel htmlFor="tenant-logo">Logo adresi</FieldLabel>
                <Input
                  id="tenant-logo"
                  placeholder="https://…"
                  aria-invalid={Boolean(errors.branding?.logoUrl)}
                  {...form.register("branding.logoUrl")}
                />
                <FieldDescription>
                  Boş bırakılırsa firma adının baş harfleri gösterilir.
                </FieldDescription>
                <FieldError errors={[errors.branding?.logoUrl]} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kavram adları</CardTitle>
          <CardDescription>
            Menü, sayfa başlıkları ve formlar bu adları kullanır. Adresler (URL)
            değişmez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {tenant.terminology.orgLevels.map((level, index) => (
              <div key={level.singular} className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`term-org-${index}`}>
                    {index + 1}. organizasyon seviyesi (tekil)
                  </FieldLabel>
                  <Input
                    id={`term-org-${index}`}
                    {...form.register(
                      `terminology.orgLevels.${index}.singular`
                    )}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`term-org-${index}-plural`}>
                    Çoğul
                  </FieldLabel>
                  <Input
                    id={`term-org-${index}-plural`}
                    {...form.register(`terminology.orgLevels.${index}.plural`)}
                  />
                </Field>
              </div>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="term-location">
                  Lokasyon kavramı (tekil)
                </FieldLabel>
                <Input
                  id="term-location"
                  placeholder="Lokasyon, Proje, Tesis…"
                  {...form.register("terminology.location.singular")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="term-location-plural">Çoğul</FieldLabel>
                <Input
                  id="term-location-plural"
                  {...form.register("terminology.location.plural")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="term-area">
                  Alan kavramı (tekil)
                </FieldLabel>
                <Input
                  id="term-area"
                  placeholder="Alan, Nokta…"
                  {...form.register("terminology.area.singular")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="term-area-plural">Çoğul</FieldLabel>
                <Input
                  id="term-area-plural"
                  {...form.register("terminology.area.plural")}
                />
              </Field>
            </div>
            {errors.terminology ? (
              <p role="alert" className="text-sm text-destructive">
                Kavram adları boş bırakılamaz (en fazla 40 karakter).
              </p>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kurallar</CardTitle>
          <CardDescription>
            Firma varsayılanları. Geç kalma toleransı ve alarm SLA'sı lokasyon
            bazında daraltılabilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                id="rule-idle"
                label="Oturum zaman aşımı (dk)"
                description="KVKK: etkileşim yoksa oturum kapanır"
                error={errors.rules?.idleTimeoutMinutes}
                registration={form.register("rules.idleTimeoutMinutes", {
                  valueAsNumber: true,
                })}
              />
              <NumberField
                id="rule-late"
                label="Geç kalma toleransı (dk)"
                error={errors.rules?.lateToleranceMinutes}
                registration={form.register("rules.lateToleranceMinutes", {
                  valueAsNumber: true,
                })}
              />
              <NumberField
                id="rule-sla"
                label="Alarm SLA (dk)"
                description="Gelmeyen personel alarmı çözüm süresi"
                error={errors.rules?.alarmSlaMinutes}
                registration={form.register("rules.alarmSlaMinutes", {
                  valueAsNumber: true,
                })}
              />
              <NumberField
                id="rule-escalation"
                label="Eskalasyon süresi (dk)"
                description="Çözülmeyen alarm operasyon müdürüne düşer"
                error={errors.rules?.escalationMinutes}
                registration={form.register("rules.escalationMinutes", {
                  valueAsNumber: true,
                })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                id="rule-geo-min"
                label="Geofence en az (m)"
                error={errors.rules?.geofence?.min}
                registration={form.register("rules.geofence.min", {
                  valueAsNumber: true,
                })}
              />
              <NumberField
                id="rule-geo-default"
                label="Geofence varsayılan (m)"
                error={errors.rules?.geofence?.default}
                registration={form.register("rules.geofence.default", {
                  valueAsNumber: true,
                })}
              />
              <NumberField
                id="rule-geo-max"
                label="Geofence en fazla (m)"
                error={errors.rules?.geofence?.max}
                registration={form.register("rules.geofence.max", {
                  valueAsNumber: true,
                })}
              />
            </div>
            {errors.rules?.geofence?.message || errors.rules?.message ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.rules.geofence?.message ?? errors.rules.message}
              </p>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Giriş yöntemleri</CardTitle>
            <CardDescription>
              Keycloak'ta yönetilir; değişiklik için Puantio destek ekibine
              başvurun.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {tenant.auth.providers.map((provider) => (
                <li
                  key={provider.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="font-medium">{provider.label}</span>
                  {provider.domains.length ? (
                    <span className="text-muted-foreground">
                      {provider.domains.join(", ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Paket ve hizmet hatları</CardTitle>
            <CardDescription>
              Modül eklemek için Puantio ile iletişime geçin.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-wrap gap-2" aria-label="Modüller">
              {MODULE_IDS.map((module) => (
                <li key={module}>
                  <StatusBadge
                    tone={hasModule(tenant, module) ? "success" : "neutral"}
                  >
                    {MODULES[module].label}
                    <span className="sr-only">
                      {hasModule(tenant, module)
                        ? " (pakette)"
                        : " (pakette yok)"}
                    </span>
                  </StatusBadge>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Hizmet hatları:{" "}
              {tenant.serviceLines
                .map((line) => SERVICE_LINE_LABELS[line])
                .join(", ")}
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
