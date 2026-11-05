import { lazy, Suspense, type ComponentProps } from "react"

import { Skeleton } from "@/shared/ui/skeleton"

export { GeofenceRadiusControl } from "./geofence-radius-control"

const MapPicker = lazy(() => import("./map-picker"))

/** Leaflet yalnızca harita gerçekten gösterildiğinde yüklenir (ayrı chunk). */
export function MapPickerLazy(props: ComponentProps<typeof MapPicker>) {
  return (
    <Suspense
      fallback={
        <Skeleton
          className="w-full rounded-2xl"
          style={{ height: props.height ?? 360 }}
        />
      }
    >
      <MapPicker {...props} />
    </Suspense>
  )
}
