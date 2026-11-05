import { describe, expect, it } from "vitest"

import {
  GEOFENCE_RADIUS,
  checkGeofence,
  clampGeofenceRadius,
  geofenceSchema,
  haversineDistanceMeters,
} from "./geo"

const KIZILAY = { lat: 39.9208, lng: 32.8541 }
const TAKSIM = { lat: 41.0369, lng: 28.985 }

describe("geo", () => {
  it("haversine: Kızılay–Taksim yaklaşık 350 km", () => {
    const km = haversineDistanceMeters(KIZILAY, TAKSIM) / 1000
    expect(km).toBeGreaterThan(345)
    expect(km).toBeLessThan(355)
    expect(haversineDistanceMeters(TAKSIM, TAKSIM)).toBe(0)
  })

  it("TC-0.3-11 geofence içi/dışı ve mesafe", () => {
    const fence = { center: TAKSIM, radiusMeters: 150 }
    // ~111 m kuzey
    expect(checkGeofence({ lat: 41.0379, lng: 28.985 }, fence)).toEqual({
      inside: true,
      distanceMeters: 111,
    })
    // ~445 m kuzey
    const outside = checkGeofence({ lat: 41.0409, lng: 28.985 }, fence)
    expect(outside.inside).toBe(false)
    expect(outside.distanceMeters).toBe(445)
  })

  it("yarıçap sınırları", () => {
    expect(clampGeofenceRadius(10)).toBe(GEOFENCE_RADIUS.min)
    expect(clampGeofenceRadius(2000)).toBe(GEOFENCE_RADIUS.max)
    expect(clampGeofenceRadius(120.4)).toBe(120)

    const tooSmall = geofenceSchema.safeParse({
      center: TAKSIM,
      radiusMeters: 10,
    })
    expect(tooSmall.success).toBe(false)
    expect(tooSmall.error?.issues[0]?.message).toBe("Yarıçap en az 25 m olmalı")
    const tooLarge = geofenceSchema.safeParse({
      center: TAKSIM,
      radiusMeters: 2000,
    })
    expect(tooLarge.error?.issues[0]?.message).toBe(
      "Yarıçap en fazla 1000 m olabilir"
    )
  })
})
