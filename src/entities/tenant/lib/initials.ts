/** "Lavanta Tesis Hizmetleri" → "LT" */
export function tenantInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR"))
    .join("")
}
