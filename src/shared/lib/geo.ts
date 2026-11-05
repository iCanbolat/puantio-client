import { z } from "zod"

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type LatLng = z.infer<typeof latLngSchema>

/** Geofence yarıçap sınırları (metre). Kiracı ayarıyla değiştirilebilir. */
export interface GeofenceLimits {
  min: number
  max: number
  default: number
}

/** Varsayılan sınırlar: bodrum kat ve büyük kampüsler için makul aralık. */
export const GEOFENCE_RADIUS: GeofenceLimits = {
  min: 25,
  max: 1000,
  default: 100,
}

export function geofenceRadiusSchema(limits: GeofenceLimits = GEOFENCE_RADIUS) {
  return z
    .number({ error: "Yarıçap girin" })
    .int("Yarıçap tam sayı olmalı")
    .min(limits.min, `Yarıçap en az ${limits.min} m olmalı`)
    .max(limits.max, `Yarıçap en fazla ${limits.max} m olabilir`)
}

export function createGeofenceSchema(limits: GeofenceLimits = GEOFENCE_RADIUS) {
  return z.object({
    center: latLngSchema,
    radiusMeters: geofenceRadiusSchema(limits),
  })
}

export const geofenceSchema = createGeofenceSchema()
export type Geofence = z.infer<typeof geofenceSchema>

const EARTH_RADIUS_METERS = 6_371_000
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** İki nokta arasındaki büyük daire mesafesi (metre). */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface GeofenceCheck {
  inside: boolean
  distanceMeters: number
}

export function checkGeofence(point: LatLng, fence: Geofence): GeofenceCheck {
  const distanceMeters = Math.round(
    haversineDistanceMeters(point, fence.center)
  )
  return { inside: distanceMeters <= fence.radiusMeters, distanceMeters }
}

export function clampGeofenceRadius(
  radius: number,
  limits: GeofenceLimits = GEOFENCE_RADIUS
): number {
  return Math.min(limits.max, Math.max(limits.min, Math.round(radius)))
}
