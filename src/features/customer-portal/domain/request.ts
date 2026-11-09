import type { RequestOptions } from "../model/portal"

/** Alan tipine ve lokasyonun hizmet hatlarına uyan sorunlar (sunucu aynı kuralı uygular) */
export function issuesForSelection(
  options: RequestOptions,
  locationId: string,
  areaId: string | null
) {
  const location = options.locations.find((item) => item.id === locationId)
  if (!location) return []
  const areaType =
    location.areas.find((area) => area.id === areaId)?.type ?? "lobby"
  const matching = options.issues.filter(
    (issue) =>
      location.serviceLines.includes(issue.serviceLine) &&
      issue.areaTypes.includes(areaType)
  )
  return matching.length > 0
    ? matching
    : options.issues.filter((issue) => issue.code === "other")
}
