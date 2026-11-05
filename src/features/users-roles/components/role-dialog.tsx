import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { LockIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { PERMISSION_GROUPS, SENSITIVE_PERMISSIONS } from "@/entities/session"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"

import { createRole, updateRole, usersRolesKeys } from "../api/users-roles-api"
import {
  roleInputSchema,
  type Role,
  type RoleInput,
  type RolePayload,
} from "../model/users-roles"

export interface RoleDialogState {
  /** Düzenlenen özel rol; `null` ise yeni rol */
  role: Role | null
  /** Kopyalanan şablon (sistem rolünden özel rol) */
  template: Role | null
}

export function RoleDialog({
  state,
  onClose,
}: {
  state: RoleDialogState | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {state ? (
          <RoleForm
            key={state.role?.id ?? state.template?.id ?? "new"}
            state={state}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RoleForm({
  state,
  onDone,
}: {
  state: RoleDialogState
  onDone: () => void
}) {
  const source = state.role ?? state.template
  const form = useForm<RoleInput, unknown, RolePayload>({
    resolver: zodResolver(roleInputSchema),
    defaultValues: {
      name:
        state.role?.name ??
        (state.template ? `${state.template.name} (özel)` : ""),
      description: source?.description ?? "",
      permissions: (source?.permissions ?? []).filter(
        (item) => !SENSITIVE_PERMISSIONS.includes(item)
      ),
    },
  })
  const mutation = useMutation({
    mutationFn: (values: RolePayload) =>
      state.role ? updateRole(state.role.id, values) : createRole(values),
    meta: {
      successMessage: "Rol kaydedildi",
      invalidates: [usersRolesKeys.roles, usersRolesKeys.users],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
      onDone()
    } catch (error) {
      applyApiErrorToForm(error, form.setError, [
        "name",
        "description",
        "permissions",
      ])
    }
  })
  const { errors, isSubmitting } = form.formState

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {state.role ? "Rolü düzenle" : "Yeni özel rol"}
        </DialogTitle>
        <DialogDescription>
          Rol, kullanıcının neleri yapabileceğini belirler. Hangi kayıtları
          göreceği kullanıcıya atanan kapsamla sınırlanır.
        </DialogDescription>
      </DialogHeader>
      <form
        id="role-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="role-name">Rol adı</FieldLabel>
            <Input
              id="role-name"
              placeholder="ör. Proje Şefi"
              aria-invalid={Boolean(errors.name)}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="role-description">Açıklama</FieldLabel>
            <Input id="role-description" {...form.register("description")} />
          </Field>
          <Controller
            control={form.control}
            name="permissions"
            render={({ field }) => (
              <div className="flex flex-col gap-4">
                {errors.permissions?.message ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.permissions.message}
                  </p>
                ) : null}
                {PERMISSION_GROUPS.map((group) => (
                  <FieldSet key={group.id}>
                    <FieldLegend variant="label">{group.label}</FieldLegend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.permissions.map((permission) => {
                        const id = `perm-${permission.id.replace(":", "-")}`
                        const sensitive = SENSITIVE_PERMISSIONS.includes(
                          permission.id
                        )
                        const checked = field.value.includes(permission.id)
                        return (
                          <div
                            key={permission.id}
                            className="flex items-start gap-2"
                          >
                            <Checkbox
                              id={id}
                              checked={checked}
                              disabled={sensitive}
                              onCheckedChange={(next) => {
                                field.onChange(
                                  next
                                    ? [...field.value, permission.id]
                                    : field.value.filter(
                                        (item) => item !== permission.id
                                      )
                                )
                              }}
                            />
                            <Label
                              htmlFor={id}
                              className="flex flex-col items-start gap-0.5 font-normal"
                            >
                              <span className="flex items-center gap-1">
                                {permission.label}
                                {sensitive ? (
                                  <LockIcon className="size-3" aria-hidden />
                                ) : null}
                              </span>
                              {sensitive ? (
                                <span className="text-xs text-muted-foreground">
                                  Özel nitelikli veri: yalnızca İSG uzmanı
                                  sistem rolünde
                                </span>
                              ) : null}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  </FieldSet>
                ))}
              </div>
            )}
          />
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="role-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
