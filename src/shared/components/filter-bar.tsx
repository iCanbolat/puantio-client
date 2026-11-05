import { FilterXIcon, SearchIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { Button } from "@/shared/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/shared/ui/input-group"

/**
 * Liste ekranlarının filtre çubuğu: gecikmeli arama kutusu + filtre alanları + "Temizle".
 * Arama değeri URL'de tutulur; yazarken geçmişe kayıt eklenmez (`replace`).
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Ara…",
  searchLabel = "Ara",
  activeFilterCount = 0,
  onReset,
  children,
}: {
  search: string | undefined
  onSearchChange: (value: string | undefined) => void
  searchPlaceholder?: string
  searchLabel?: string
  activeFilterCount?: number
  onReset?: () => void
  children?: ReactNode
}) {
  const [value, setValue] = useState(search ?? "")
  const [lastExternal, setLastExternal] = useState(search)

  // Dışarıdan (ör. "Temizle" veya geri tuşu) değişen arama değerini input'a yansıt
  if (search !== lastExternal) {
    setLastExternal(search)
    setValue(search ?? "")
  }

  const debounced = useDebouncedValue(value, 300)

  useEffect(() => {
    const normalized = debounced.trim() || undefined
    if (normalized !== search) onSearchChange(normalized)
    // `search` bilerek bağımlılıkta değil: yalnızca kullanıcının yazdığı değer tetikler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const hasActive = activeFilterCount > 0 || Boolean(search)

  return (
    <div className="flex w-full flex-wrap items-center gap-2" role="search">
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={value}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          onChange={(event) => {
            setValue(event.target.value)
          }}
        />
      </InputGroup>
      {children}
      {hasActive && onReset ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue("")
            onReset()
          }}
        >
          <FilterXIcon data-icon="inline-start" />
          Filtreleri temizle
        </Button>
      ) : null}
    </div>
  )
}
