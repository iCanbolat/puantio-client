import "leaflet/dist/leaflet.css"

import { useEffect } from "react"
import {
  Circle,
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"

import {
  GEOFENCE_RADIUS,
  type Geofence,
  type GeofenceLimits,
  type LatLng,
} from "@/shared/lib/geo"
import { formatNumber } from "@/shared/lib/format"

import { GeofenceRadiusControl } from "./geofence-radius-control"

const DEFAULT_CENTER: LatLng = { lat: 41.0082, lng: 28.9784 }

function ClickToSetCenter({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click: (event) => {
      onPick({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      })
    },
  })
  return null
}

function FollowCenter({ center }: { center: LatLng }) {
  const map = useMap()
  useEffect(() => {
    map.panTo([center.lat, center.lng])
  }, [map, center.lat, center.lng])
  return null
}

/**
 * Lokasyon geofence seçimi: haritaya tıklayarak merkez, kontrolle yarıçap belirlenir.
 * Leaflet ağır olduğu için `MapPickerLazy` üzerinden yüklenir.
 */
export default function MapPicker({
  value,
  onChange,
  height = 360,
  limits = GEOFENCE_RADIUS,
  showRadiusControl = true,
}: {
  value: Geofence | null
  onChange: (value: Geofence) => void
  height?: number
  limits?: GeofenceLimits
  /** Formlar yarıçapı kendi alanıyla yönetir; harita yalnızca merkezi seçtirir */
  showRadiusControl?: boolean
}) {
  const center = value?.center ?? DEFAULT_CENTER
  const radius = value?.radiusMeters ?? limits.default

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ height }}
        role="application"
        aria-label="Geofence haritası. Merkezi belirlemek için haritaya tıklayın."
      >
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          scrollWheelZoom
          className="size-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıda bulunanlar'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToSetCenter
            onPick={(point) => {
              onChange({ center: point, radiusMeters: radius })
            }}
          />
          <FollowCenter center={center} />
          {value ? (
            <>
              <Circle
                center={[center.lat, center.lng]}
                radius={radius}
                pathOptions={{ color: "var(--primary)", fillOpacity: 0.15 }}
              />
              <CircleMarker
                center={[center.lat, center.lng]}
                radius={6}
                pathOptions={{ color: "var(--primary)", fillOpacity: 1 }}
              />
            </>
          ) : null}
        </MapContainer>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        {showRadiusControl ? (
          <GeofenceRadiusControl
            value={radius}
            limits={limits}
            onChange={(radiusMeters) => {
              onChange({ center, radiusMeters })
            }}
          />
        ) : (
          <span />
        )}
        <p
          className="text-sm text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {value
            ? `Merkez: ${formatNumber(center.lat, { maximumFractionDigits: 6 })}, ${formatNumber(center.lng, { maximumFractionDigits: 6 })}`
            : "Henüz merkez seçilmedi"}
        </p>
      </div>
    </div>
  )
}
