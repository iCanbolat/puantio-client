/**
 * Harita için ızgara tabanlı nokta kümeleme (15.000 lokasyon tek tek çizilmez).
 * Noktalar Web Mercator piksel uzayına çevrilir; aynı `cellSizePx` hücresine düşenler
 * tek kümede birleşir. Yakınlaştırdıkça hücreler küçülür ve kümeler açılır.
 */
export interface ClusterPoint {
  id: string
  lat: number
  lng: number
}

export interface Cluster<TPoint extends ClusterPoint> {
  key: string
  lat: number
  lng: number
  count: number
  points: TPoint[]
}

const TILE_SIZE = 256

/** Enlem/boylam → verilen yakınlaştırmada dünya piksel koordinatı. */
export function project(
  point: { lat: number; lng: number },
  zoom: number
): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom
  const sin = Math.min(
    Math.max(Math.sin((point.lat * Math.PI) / 180), -0.9999),
    0.9999
  )
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

export function clusterPoints<TPoint extends ClusterPoint>(
  points: readonly TPoint[],
  zoom: number,
  options: { cellSizePx?: number; maxClusterZoom?: number } = {}
): Cluster<TPoint>[] {
  const { cellSizePx = 64, maxClusterZoom = 16 } = options
  if (zoom > maxClusterZoom) {
    return points.map((point) => ({
      key: point.id,
      lat: point.lat,
      lng: point.lng,
      count: 1,
      points: [point],
    }))
  }
  const cells = new Map<string, TPoint[]>()
  for (const point of points) {
    const { x, y } = project(point, zoom)
    const key = `${Math.floor(x / cellSizePx)}:${Math.floor(y / cellSizePx)}`
    const bucket = cells.get(key)
    if (bucket) bucket.push(point)
    else cells.set(key, [point])
  }
  return [...cells.entries()].map(([key, members]) => {
    const lat = members.reduce((sum, point) => sum + point.lat, 0)
    const lng = members.reduce((sum, point) => sum + point.lng, 0)
    return {
      key: members.length === 1 ? (members[0]?.id ?? key) : `c:${key}`,
      lat: lat / members.length,
      lng: lng / members.length,
      count: members.length,
      points: members,
    }
  })
}

export interface Bounds {
  south: number
  west: number
  north: number
  east: number
}

export function boundsOf(
  points: readonly { lat: number; lng: number }[]
): Bounds | null {
  if (points.length === 0) return null
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const point of points) {
    south = Math.min(south, point.lat)
    north = Math.max(north, point.lat)
    west = Math.min(west, point.lng)
    east = Math.max(east, point.lng)
  }
  return { south, west, north, east }
}
