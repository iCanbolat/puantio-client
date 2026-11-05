import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"

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

import {
  inviteUser,
  updateUser,
  usersRolesKeys,
  usersRolesQueries,
} from "../api/users-roles-api"
import {
  userInviteSchema,
  type TenantUser,
  type UserInviteInput,
  type UserInvitePayload,
} from "../model/users-roles"
import { ScopePicker } from "./scope-picker"

export function UserDialog({
  open,
  user,
  onClose,
}: {
  open: boolean
  user: TenantUser | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {open ? (
          <UserForm key={user?.id ?? "new"} user={user} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function UserForm({
  user,
  onDone,
}: {
  user: TenantUser | null
  onDone: () => void
}) {
  const roles = useQuery(usersRolesQueries.roles())
  const form = useForm<UserInviteInput, unknown, UserInvitePayload>({
    resolver: zodResolver(userInviteSchema),
    defaultValues: {
      email: user?.email ?? "",
      displayName: user?.displayName ?? "",
      title: user?.title ?? "",
      roleIds: user?.roles.map((role) => role.id) ?? [],
      scope: user?.scope ?? { kind: "all" },
    },
  })
  const mutation = useMutation({
    mutationFn: (values: UserInvitePayload) => {
      if (!user) return inviteUser(values)
      const { email: _email, ...rest } = values
      return updateUser(user.id, rest)
    },
    meta: {
      successMessage: user ? "Kullanıcı güncellendi" : "Davet gönderildi",
      invalidates: [usersRolesKeys.users, usersRolesKeys.roles],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
      onDone()
    } catch (error) {
      applyApiErrorToForm(error, form.setError, [
        "email",
        "displayName",
        "title",
        "roleIds",
      ])
    }
  })
  const { errors, isSubmitting } = form.formState

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {user ? "Kullanıcıyı düzenle" : "Kullanıcı davet et"}
        </DialogTitle>
        <DialogDescription>
          {user
            ? user.email
            : "Davet e-postasıyla kullanıcı şifresini belirler veya firmanın kurumsal girişini kullanır."}
        </DialogDescription>
      </DialogHeader>
      <form
        id="user-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          {user ? null : (
            <Field data-invalid={Boolean(errors.email) || undefined}>
              <FieldLabel htmlFor="user-email">E-posta</FieldLabel>
              <Input
                id="user-email"
                type="email"
                aria-invalid={Boolean(errors.email)}
                {...form.register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.displayName) || undefined}>
              <FieldLabel htmlFor="user-name">Ad soyad</FieldLabel>
              <Input
                id="user-name"
                aria-invalid={Boolean(errors.displayName)}
                {...form.register("displayName")}
              />
              <FieldError errors={[errors.displayName]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="user-title">Unvan</FieldLabel>
              <Input id="user-title" {...form.register("title")} />
            </Field>
          </div>
          <Controller
            control={form.control}
            name="roleIds"
            render={({ field }) => (
              <FieldSet data-invalid={Boolean(errors.roleIds) || undefined}>
                <FieldLegend variant="label">Roller</FieldLegend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(roles.data ?? []).map((role) => {
                    const id = `user-role-${role.id}`
                    return (
                      <div key={role.id} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={field.value.includes(role.id)}
                          onCheckedChange={(checked) => {
                            field.onChange(
                              checked
                                ? [...field.value, role.id]
                                : field.value.filter((item) => item !== role.id)
                            )
                          }}
                        />
                        <Label htmlFor={id} className="font-normal">
                          {role.name}
                        </Label>
                      </div>
                    )
                  })}
                </div>
                <FieldError errors={[errors.roleIds]} />
              </FieldSet>
            )}
          />
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <ScopePicker
                value={field.value}
                onChange={field.onChange}
                error={errors.scope?.message ?? errors.scope?.root?.message}
              />
            )}
          />
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="user-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          {user ? "Kaydet" : "Davet gönder"}
        </Button>
      </DialogFooter>
    </>
  )
}
