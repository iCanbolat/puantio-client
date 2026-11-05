import { describe, expect, it } from "vitest"

import { boundsOf, clusterPoints, project } from "./cluster"
import {
  accessibleBrandColor,
  contrastRatio,
  isHexColor,
  parseHexColor,
  WHITE,
} from "./color"
import {
  GEOFENCE_RADIUS,
  clampGeofenceRadius,
  createGeofenceSchema,
} from "./geo"
import { isValidVkn, sgkWorkplaceNumberSchema, vknSchema } from "./vkn"

describe("renk ve kontrast (marka rengi)", () => {
  it("onaltılık renk ayrıştırma", () => {
    expect(parseHexColor("#1e3a8a")).toEqual({ r: 30, g: 58, b: 138 })
    expect(parseHexColor("#abc")).toEqual({ r: 170, g: 187, b: 204 })
    expect(parseHexColor("mavi")).toBeNull()
    expect(isHexColor("#12345")).toBe(false)
  })

  it("WCAG kontrast oranı", () => {
    expect(contrastRatio(WHITE, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 0)
    expect(contrastRatio(WHITE, WHITE)).toBe(1)
  })

  it("TC-1.0-06 düşük kontrastlı marka rengi uygulanmaz", () => {
    expect(accessibleBrandColor("#1e3a8a")).toBe("#1e3a8a")
    expect(accessibleBrandColor("#ffff00")).toBeNull()
    expect(accessibleBrandColor("geçersiz")).toBeNull()
    expect(accessibleBrandColor(null)).toBeNull()
  })
})

describe("VKN ve SGK sicil", () => {
  it("geçerli ve geçersiz VKN", () => {
    expect(isValidVkn("1234567890")).toBe(true)
    expect(isValidVkn("1234567891")).toBe(false)
    expect(isValidVkn("0000000000")).toBe(false)
    expect(isValidVkn("4840847211")).toBe(true)
    expect(isValidVkn("4840847212")).toBe(false)
    expect(isValidVkn("123")).toBe(false)
    expect(vknSchema.safeParse("12").error?.issues[0]?.message).toBe(
      "Vergi kimlik numarası 10 haneli olmalı"
    )
    expect(vknSchema.safeParse("4840847212").error?.issues[0]?.message).toBe(
      "Geçersiz vergi kimlik numarası"
    )
  })

  it("SGK işyeri sicil no 26 hane", () => {
    expect(sgkWorkplaceNumberSchema.safeParse("1".repeat(26)).success).toBe(
      true
    )
    expect(sgkWorkplaceNumberSchema.safeParse("1".repeat(25)).success).toBe(
      false
    )
  })
})

describe("kiracı geofence sınırları", () => {
  it("TC-1.5-01 sınır dışı yarıçap mesajı kiracı ayarından gelir", () => {
    const schema = createGeofenceSchema({ min: 15, max: 500, default: 50 })
    const center = { lat: 41, lng: 29 }
    expect(
      schema.safeParse({ center, radiusMeters: 10 }).error?.issues[0]?.message
    ).toBe("Yarıçap en az 15 m olmalı")
    expect(
      schema.safeParse({ center, radiusMeters: 600 }).error?.issues[0]?.message
    ).toBe("Yarıçap en fazla 500 m olabilir")
    expect(clampGeofenceRadius(2000, GEOFENCE_RADIUS)).toBe(1000)
    expect(clampGeofenceRadius(5, { min: 15, max: 500, default: 50 })).toBe(15)
  })
})

describe("harita kümeleme", () => {
  const grid = Array.from({ length: 15_000 }, (_, index) => ({
    id: String(index),
    lat: 36 + (index % 150) * 0.04,
    lng: 26 + Math.floor(index / 150) * 0.18,
  }))

  it("TC-1.5-04 15.000 nokta ülke görünümünde az sayıda kümede toplanır", () => {
    const clusters = clusterPoints(grid, 6)
    expect(clusters.length).toBeLessThan(400)
    expect(clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(
      15_000
    )
    // Yakınlaştırdıkça kümeler açılır
    expect(clusterPoints(grid, 10).length).toBeGreaterThan(clusters.length)
  })

  it("en yakın görünümde kümeleme yapılmaz; tekil noktanın anahtarı kimliğidir", () => {
    const points = grid.slice(0, 3)
    const clusters = clusterPoints(points, 17)
    expect(clusters).toHaveLength(3)
    expect(clusters[0]?.key).toBe("0")
  })

  it("izdüşüm ve sınırlar", () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 })
    expect(boundsOf([])).toBeNull()
    expect(
      boundsOf([
        { lat: 1, lng: 2 },
        { lat: 3, lng: -1 },
      ])
    ).toEqual({
      south: 1,
      north: 3,
      west: -1,
      east: 2,
    })
  })
})
