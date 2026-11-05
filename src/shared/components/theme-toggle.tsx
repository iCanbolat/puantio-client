import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { useTheme, type Theme } from "@/shared/theme"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
  { value: "system", label: "Sistem" },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon =
    theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Tema seç" />}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            setTheme(value as Theme)
          }}
        >
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
