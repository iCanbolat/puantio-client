import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import {
  keepPreviousData,
  useQuery,
  type QueryKey,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { getErrorMessage } from "@/shared/api/errors"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/ui/combobox"

export interface AsyncComboboxOption {
  value: string
  label: string
  description?: string
}

/**
 * Sunucu taraflı arama yapan seçim kutusu. 15.000 lokasyon / 6.000 personel gibi büyük
 * listeler istemciye yüklenmez; kullanıcı yazdıkça (gecikmeli) sorgulanır.
 */
export function AsyncCombobox({
  queryKey,
  fetchOptions,
  value,
  selectedLabel,
  onValueChange,
  placeholder = "Ara ve seç…",
  emptyText = "Sonuç bulunamadı",
  minQueryLength = 0,
  debounceMs = 300,
  className,
  "aria-label": ariaLabel,
}: {
  queryKey: QueryKey
  fetchOptions: (
    query: string,
    signal: AbortSignal
  ) => Promise<AsyncComboboxOption[]>
  value: string | null
  /** Seçili değer sonuç listesinde yoksa gösterilecek etiket */
  selectedLabel?: string
  onValueChange: (
    value: string | null,
    option: AsyncComboboxOption | null
  ) => void
  placeholder?: string
  emptyText?: string
  minQueryLength?: number
  debounceMs?: number
  className?: string
  "aria-label": string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query.trim(), debounceMs)
  const enabled = open && debouncedQuery.length >= minQueryLength

  const result = useQuery({
    queryKey: [...queryKey, { q: debouncedQuery }],
    queryFn: ({ signal }) => fetchOptions(debouncedQuery, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    meta: { silent: true },
  })

  const selected = useMemo<AsyncComboboxOption | null>(
    () =>
      value === null
        ? null
        : (result.data?.find((option) => option.value === value) ?? {
            value,
            label: selectedLabel ?? value,
          }),
    [value, selectedLabel, result.data]
  )

  const items = enabled ? (result.data ?? []) : []
  const status = !enabled
    ? minQueryLength > 0 && debouncedQuery.length < minQueryLength
      ? `En az ${minQueryLength} karakter yazın`
      : null
    : result.isFetching
      ? "Aranıyor…"
      : result.isError
        ? getErrorMessage(result.error)
        : null

  return (
    <Combobox
      items={items}
      filter={null}
      value={selected}
      onValueChange={(next) => {
        onValueChange(next?.value ?? null, next ?? null)
      }}
      onInputValueChange={(next) => {
        setQuery(next)
      }}
      open={open}
      onOpenChange={setOpen}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(item, current) => item.value === current.value}
    >
      <ComboboxInput
        placeholder={placeholder}
        aria-label={ariaLabel}
        showClear={value !== null}
        className={className}
      />
      <ComboboxContent>
        {status ? (
          <ComboboxPrimitive.Status className="px-3 py-2 text-sm text-muted-foreground">
            {status}
          </ComboboxPrimitive.Status>
        ) : null}
        {!status ? <ComboboxEmpty>{emptyText}</ComboboxEmpty> : null}
        <ComboboxList>
          {(option: AsyncComboboxOption) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{option.label}</span>
                {option.description ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
