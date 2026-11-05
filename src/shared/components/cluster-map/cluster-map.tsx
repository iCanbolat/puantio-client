import "leaflet/dist/leaflet.css"

import { useEffect, useMemo, useState } from "react"
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet"

import {
  boundsOf,
  clusterPoints,
  type ClusterPoint,
} from "@/shared/lib/cluster"
import { formatNumber } from "@/shared/lib/format"

export interface MapPoint extends ClusterPoint {
  label: string
}

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoom(map.getZoom())
    },
  })
  return null
}

function FitBounds({ points }: { points: readonly MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    const bounds = boundsOf(points)
    if (!bounds) return
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [24, 24], maxZoom: 15 }
    )
  }, [map, points])
  return null
}

function Clusters({
  points,
  zoom,
  onSelect,
}: {
  points: readonly MapPoint[]
  zoom: number
  onSelect?: ((id: string) => void) | undefined
}) {
  const map = useMap()
  const clusters = useMemo(() => clusterPoints(points, zoom), [points, zoom])
  return (
    <>
      {clusters.map((cluster) => {
        const single = cluster.count === 1 ? cluster.points[0] : undefined
        const radius = single
          ? 7
          : Math.min(28, 10 + Math.log2(cluster.count) * 3)
        return (
          <CircleMarker
            key={cluster.key}
            center={[cluster.lat, cluster.lng]}
            radius={radius}
            pathOptions={{
              color: "var(--primary)",
              fillColor: "var(--primary)",
              fillOpacity: single ? 0.9 : 0.55,
            }}
            eventHandlers={{
              click: () => {
                if (single) onSelect?.(single.id)
                else map.flyTo([cluster.lat, cluster.lng], map.getZoom() + 2)
              },
            }}
          >
            <Tooltip direction="top" permanent={!single}>
              {single ? single.label : formatNumber(cluster.count)}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}

/**
 * Kümelenmiş nokta haritası (lokasyon haritası). Leaflet ağır olduğu için `ClusterMapLazy`
 * üzerinden yüklenir. Kümeye tıklayınca yakınlaşır, tekil noktaya tıklayınca `onSelect`.
 */
export default function ClusterMap({
  points,
  height = 480,
  label,
  onSelect,
}: {
  points: readonly MapPoint[]
  height?: number
  label: string
  onSelect?: (id: string) => void
}) {
  const [zoom, setZoom] = useState(6)
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ height }}
      role="application"
      aria-label={label}
    >
      <MapContainer
        center={[39.0, 35.0]}
        zoom={6}
        scrollWheelZoom
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıda bulunanlar'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomTracker onZoom={setZoom} />
        <FitBounds points={points} />
        <Clusters points={points} zoom={zoom} onSelect={onSelect} />
      </MapContainer>
    </div>
  )
}
