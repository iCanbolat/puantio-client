import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Building2Icon,
  LifeBuoyIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { Link, useNavigate, useParams } from "react-router"

import {
  MODULES,
  MODULE_IDS,
  SERVICE_LINES,
  SERVICE_LINE_LABELS,
  type ModuleId,
} from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatCard } from "@/shared/components/stat-card"
import { StatusBadge } from "@/shared/components/status-badge"
import { env } from "@/shared/config/env"
import { useNow } from "@/shared/hooks/use-now"
import { paths } from "@/shared/config/paths"
import { formatDate, formatDateTime, formatNumber } from "@/shared/lib/format"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import {
  createTenant,
  endSupportSession,
  platformKeys,
  platformQueries,
  updateTenant,
} from "../api/platform-api"
import { SupportDialog } from "../components/support-dialog"
import {
  DEFAULT_MODULES,
  createTenantSchema,
  type CreateTenantInput,
  type CreateTenantPayload,
  type PlatformTenant,
} from "../model/platform"

function ModuleCheckboxes({
  value,
  onChange,
  idPrefix,
}: {
  value: readonly ModuleId[]
  onChange: (value: ModuleId[]) => void
  idPrefix: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {MODULE_IDS.map((module) => {
        const id = `${idPrefix}-${module}`
        return (
          <div key={module} className="flex items-start gap-2">
            <Checkbox
              id={id}
              checked={value.includes(module)}
              disabled={module === "core"}
              onCheckedChange={(checked) => {
                onChange(
                  checked
                    ? [...value, module]
                    : value.filter((item) => item !== module)
                )
              }}
            />
            <Label
              htmlFor={id}
              className="flex flex-col items-start gap-0.5 font-normal"
            >
              <span>
                {MODULES[module].label}{" "}
                <span className="text-xs text-muted-foreground">
                  Faz {MODULES[module].phase}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {MODULES[module].description}
              </span>
            </Label>
          </div>
        )
      })}
    </div>
  )
}

export function PlatformHomePage() {
  const now = useNow(30_000)
  const tenants = useQuery(platformQueries.tenants())
  const sessions = useQuery(platformQueries.sessions())
  const active =
    tenants.data?.filter((tenant) => tenant.status === "active").length ?? 0
  const personnel =
    tenants.data?.reduce((sum, tenant) => sum + tenant.personnelCount, 0) ?? 0
  const openSessions =
    sessions.data?.filter(
      (session) =>
        session.endedAt === null &&
        Date.parse(session.expiresAt) > now.getTime()
    ).length ?? 0
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform genel bakış"
        description="Puantio kiracıları ve destek erişimleri."
      />
      <section aria-label="Özet" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Aktif kiracı"
          value={formatNumber(active)}
          hint={`${formatNumber(tenants.data?.length ?? 0)} toplam`}
          icon={Building2Icon}
          isLoading={tenants.isPending}
        />
        <StatCard
          label="Toplam personel"
          value={formatNumber(personnel)}
          icon={UsersIcon}
          isLoading={tenants.isPending}
        />
        <StatCard
          label="Açık destek oturumu"
          value={formatNumber(openSessions)}
          icon={LifeBuoyIcon}
          tone={openSessions > 0 ? "warning" : "default"}
          isLoading={sessions.isPending}
        />
      </section>
      <div className="flex gap-2">
        <Link
          to={paths.platform.tenants()}
          className={buttonVariants({ variant: "outline" })}
        >
          Kiracılar
        </Link>
        <Link to={paths.platform.newTenant()} className={buttonVariants()}>
          <PlusIcon data-icon="inline-start" />
          Yeni kiracı
        </Link>
      </div>
    </div>
  )
}

export function PlatformTenantsPage() {
  const query = useQuery(platformQueries.tenants())
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kiracılar"
        description="Her kiracı kendi alt alan adında (ör. firma.puantio.com) çalışır; veriler kiracı bazında ayrıdır."
        actions={
          <Link to={paths.platform.newTenant()} className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            Yeni kiracı
          </Link>
        }
      />
      <Card>
        <CardContent>
          {query.isPending ? (
            <PageSkeleton />
          ) : query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Kiracılar</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>Alt alan adı</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Modül</TableHead>
                  <TableHead className="text-right">Kullanıcı</TableHead>
                  <TableHead className="text-right">Personel</TableHead>
                  <TableHead className="text-right">Lokasyon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((tenant) => (
                  <TableRow key={tenant.slug}>
                    <TableCell>
                      <Link
                        to={paths.platform.tenant(tenant.slug)}
                        className="font-medium hover:underline"
                      >
                        {tenant.displayName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {tenant.slug}.{env.VITE_TENANT_BASE_DOMAIN}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={
                          tenant.status === "active" ? "success" : "warning"
                        }
                      >
                        {tenant.status === "active" ? "Aktif" : "Askıda"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tenant.modules.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(tenant.userCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(tenant.personnelCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(tenant.locationCount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function PlatformNewTenantPage() {
  const navigate = useNavigate()
  const form = useForm<CreateTenantInput, unknown, CreateTenantPayload>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      displayName: "",
      shortName: "",
      slug: "",
      modules: [...DEFAULT_MODULES],
      serviceLines: ["cleaning"],
      orgLevelCount: 1,
      adminName: "",
      adminEmail: "",
    },
  })
  const mutation = useMutation({
    mutationFn: createTenant,
    meta: {
      successMessage: "Kiracı oluşturuldu; yöneticiye davet gönderildi",
      invalidates: [platformKeys.tenants],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const tenant = await mutation.mutateAsync(values)
      await navigate(paths.platform.tenant(tenant.slug))
    } catch (error) {
      applyApiErrorToForm(error, form.setError, [
        "displayName",
        "shortName",
        "slug",
        "adminName",
        "adminEmail",
        "modules",
        "serviceLines",
      ])
    }
  })
  const { errors, isSubmitting } = form.formState
  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex flex-col gap-6"
    >
      <PageHeader
        title="Yeni kiracı"
        description="Kiracı oluşturulunca sistem rolleri hazırlanır ve ilk yöneticiye davet gönderilir."
      />
      {errors.root?.server?.message ? (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Firma</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field data-invalid={Boolean(errors.displayName) || undefined}>
                <FieldLabel htmlFor="tenant-display">Firma adı</FieldLabel>
                <Input
                  id="tenant-display"
                  aria-invalid={Boolean(errors.displayName)}
                  {...form.register("displayName")}
                />
                <FieldError errors={[errors.displayName]} />
              </Field>
              <Field data-invalid={Boolean(errors.shortName) || undefined}>
                <FieldLabel htmlFor="tenant-short-name">Kısa ad</FieldLabel>
                <Input
                  id="tenant-short-name"
                  aria-invalid={Boolean(errors.shortName)}
                  {...form.register("shortName")}
                />
                <FieldError errors={[errors.shortName]} />
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.slug) || undefined}>
              <FieldLabel htmlFor="tenant-slug">Alt alan adı</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="tenant-slug"
                  className="max-w-64 font-mono lowercase"
                  aria-invalid={Boolean(errors.slug)}
                  {...form.register("slug")}
                />
                <span className="text-sm text-muted-foreground">
                  .{env.VITE_TENANT_BASE_DOMAIN}
                </span>
              </div>
              <FieldError errors={[errors.slug]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-levels">
                Organizasyon seviyesi
              </FieldLabel>
              <Controller
                control={form.control}
                name="orgLevelCount"
                render={({ field }) => (
                  <select
                    id="tenant-levels"
                    className="h-9 max-w-64 rounded-lg border bg-background px-3 text-sm"
                    value={field.value}
                    onChange={(event) => {
                      field.onChange(Number(event.target.value))
                    }}
                  >
                    <option value={1}>1 seviye (Bölge)</option>
                    <option value={2}>2 seviye (Bölge → Alt bölge)</option>
                  </select>
                )}
              />
              <FieldDescription>
                Kavram adları kiracı tarafından firma ayarlarında
                değiştirilebilir.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Paket</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Modüller</FieldLegend>
              <Controller
                control={form.control}
                name="modules"
                render={({ field }) => (
                  <ModuleCheckboxes
                    idPrefix="new-module"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError errors={[errors.modules]} />
            </FieldSet>
            <FieldSet data-invalid={Boolean(errors.serviceLines) || undefined}>
              <FieldLegend variant="label">Hizmet hatları</FieldLegend>
              <Controller
                control={form.control}
                name="serviceLines"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {SERVICE_LINES.map((line) => (
                      <div key={line} className="flex items-center gap-2">
                        <Checkbox
                          id={`new-line-${line}`}
                          checked={field.value.includes(line)}
                          onCheckedChange={(checked) => {
                            field.onChange(
                              checked
                                ? [...field.value, line]
                                : field.value.filter((item) => item !== line)
                            )
                          }}
                        />
                        <Label htmlFor={`new-line-${line}`}>
                          {SERVICE_LINE_LABELS[line]}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              />
              <FieldError errors={[errors.serviceLines]} />
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>İlk yönetici</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.adminName) || undefined}>
              <FieldLabel htmlFor="tenant-admin-name">Ad soyad</FieldLabel>
              <Input
                id="tenant-admin-name"
                aria-invalid={Boolean(errors.adminName)}
                {...form.register("adminName")}
              />
              <FieldError errors={[errors.adminName]} />
            </Field>
            <Field data-invalid={Boolean(errors.adminEmail) || undefined}>
              <FieldLabel htmlFor="tenant-admin-email">E-posta</FieldLabel>
              <Input
                id="tenant-admin-email"
                type="email"
                aria-invalid={Boolean(errors.adminEmail)}
                {...form.register("adminEmail")}
              />
              <FieldError errors={[errors.adminEmail]} />
            </Field>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Link
          to={paths.platform.tenants()}
          className={buttonVariants({ variant: "outline" })}
        >
          Vazgeç
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kiracıyı oluştur
        </Button>
      </div>
    </form>
  )
}

function TenantModules({ tenant }: { tenant: PlatformTenant }) {
  const [modules, setModules] = useState<ModuleId[]>(tenant.modules)
  const save = useMutation({
    mutationFn: () => updateTenant(tenant.slug, { modules }),
    meta: {
      successMessage: "Paket güncellendi",
      invalidates: [platformKeys.tenants],
    },
  })
  const dirty = [...modules].sort().join() !== [...tenant.modules].sort().join()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paket modülleri</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ModuleCheckboxes
          idPrefix={`module-${tenant.slug}`}
          value={modules}
          onChange={setModules}
        />
        <div>
          <Button
            onClick={() => {
              save.mutate()
            }}
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            Paketi kaydet
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function PlatformTenantDetailPage() {
  const { tenantSlug = "" } = useParams()
  const query = useQuery(platformQueries.tenant(tenantSlug))
  const [support, setSupport] = useState<PlatformTenant | null>(null)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const status = useMutation({
    mutationFn: (next: "active" | "suspended") =>
      updateTenant(tenantSlug, { status: next }),
    meta: {
      successMessage: "Kiracı durumu güncellendi",
      invalidates: [platformKeys.tenants],
    },
  })
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const tenant = query.data
  const suspended = tenant.status === "suspended"
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={tenant.displayName}
        description={`${tenant.slug}.${env.VITE_TENANT_BASE_DOMAIN} · ${tenant.adminEmail} · ${formatDate(tenant.createdAt)}`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmStatus(true)
              }}
            >
              {suspended ? (
                <PlayCircleIcon data-icon="inline-start" />
              ) : (
                <PauseCircleIcon data-icon="inline-start" />
              )}
              {suspended ? "Etkinleştir" : "Askıya al"}
            </Button>
            <Button
              onClick={() => {
                setSupport(tenant)
              }}
              disabled={suspended}
            >
              <LifeBuoyIcon data-icon="inline-start" />
              Destek oturumu başlat
            </Button>
          </>
        }
      />
      <section aria-label="Kiracı özeti" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Kullanıcı" value={formatNumber(tenant.userCount)} />
        <StatCard
          label="Personel"
          value={formatNumber(tenant.personnelCount)}
        />
        <StatCard label="Lokasyon" value={formatNumber(tenant.locationCount)} />
      </section>
      <p className="text-sm text-muted-foreground">
        Hizmet hatları:{" "}
        {tenant.serviceLines
          .map((line) => SERVICE_LINE_LABELS[line])
          .join(", ")}
      </p>
      <TenantModules key={tenant.modules.join()} tenant={tenant} />
      <SupportDialog
        tenant={support}
        onClose={() => {
          setSupport(null)
        }}
      />
      <ConfirmDialog
        open={confirmStatus}
        onOpenChange={setConfirmStatus}
        title={
          suspended
            ? "Kiracı etkinleştirilsin mi?"
            : "Kiracı askıya alınsın mı?"
        }
        description={
          suspended
            ? undefined
            : "Kiracının tüm kullanıcıları uygulamaya erişemez; veriler silinmez."
        }
        confirmLabel={suspended ? "Etkinleştir" : "Askıya al"}
        destructive={!suspended}
        onConfirm={() => status.mutateAsync(suspended ? "active" : "suspended")}
      />
    </div>
  )
}

export function PlatformSupportSessionsPage() {
  const now = useNow(30_000)
  const query = useQuery(platformQueries.sessions())
  const end = useMutation({
    mutationFn: endSupportSession,
    meta: {
      successMessage: "Destek oturumu bitirildi",
      invalidates: [platformKeys.sessions],
    },
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Destek oturumları"
        description="Platform personelinin kiracılara gerekçeli, süreli erişimleri."
      />
      <Card>
        <CardContent>
          {query.isPending ? (
            <PageSkeleton />
          ) : query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : query.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz destek oturumu yok.
            </p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Destek oturumları</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Kiracı</TableHead>
                  <TableHead>Personel</TableHead>
                  <TableHead>Gerekçe</TableHead>
                  <TableHead>Başlangıç</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>
                    <span className="sr-only">İşlemler</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((session) => {
                  const open =
                    session.endedAt === null &&
                    Date.parse(session.expiresAt) > now.getTime()
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-mono text-xs">
                        {session.tenantSlug}
                      </TableCell>
                      <TableCell>{session.agentName}</TableCell>
                      <TableCell className="max-w-72">
                        {session.reason}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDateTime(session.startedAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={open ? "warning" : "neutral"}>
                          {open ? "Açık" : "Kapandı"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        {open ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              end.mutate(session.id)
                            }}
                          >
                            Bitir
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
