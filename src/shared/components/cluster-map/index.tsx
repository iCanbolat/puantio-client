import { lazy, Suspense, type ComponentProps } from "react"

import { Skeleton } from "@/shared/ui/skeleton"

export type { MapPoint } from "./cluster-map"

const ClusterMap = lazy(() => import("./cluster-map"))

/** Leaflet yalnızca harita gösterildiğinde yüklenir (ayrı chunk). */
export function ClusterMapLazy(props: ComponentProps<typeof ClusterMap>) {
  return (
    <Suspense
      fallback={
        <Skeleton
          className="w-full rounded-2xl"
          style={{ height: props.height ?? 480 }}
        />
      }
    >
      <ClusterMap {...props} />
    </Suspense>
  )
}
