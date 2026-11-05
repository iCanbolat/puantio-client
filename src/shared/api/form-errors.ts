import type { FieldValues, Path, UseFormSetError } from "react-hook-form"

import { ApiError, getErrorMessage } from "./errors"

/**
 * API hatasını react-hook-form alanlarına işler.
 * - 422 + `fieldErrors`: her alan için ilk mesaj ilgili input'a yazılır.
 * - Diğer hatalar: `root.server` altına genel mesaj yazılır.
 *
 * @returns Alan bazlı hata işlendiyse `true`.
 */
export function applyApiErrorToForm<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  knownFields?: readonly Path<TValues>[]
): boolean {
  if (error instanceof ApiError && error.status === 422 && error.fieldErrors) {
    let applied = false
    const unknownMessages: string[] = []
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      const message = messages[0]
      if (!message) continue
      if (knownFields && !knownFields.includes(field as Path<TValues>)) {
        unknownMessages.push(message)
        continue
      }
      setError(
        field as Path<TValues>,
        { type: "server", message },
        { shouldFocus: !applied }
      )
      applied = true
    }
    if (unknownMessages.length > 0) {
      setError("root.server", {
        type: "server",
        message: unknownMessages.join(" "),
      })
    }
    return applied
  }

  setError("root.server", {
    type: "server",
    message: getErrorMessage(error),
  })
  return false
}
