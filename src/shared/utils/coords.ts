import proj4 from "proj4";
import { SJTSK_DEF } from "./geoUtils";

/** Pokus o konverziu UTM (metricke súradnice) → WGS84 lat/lon.
 *  Funguje pre UTM Severnej pologule zóna 1–60. Vráti null ak nie sú UTM súradnice. */
export function tryUtmToWgs84(easting: number, northing: number): { lat: number; lon: number; zone: number } | null {
  // Kontrola UTM rozsahu
  if (easting < 100000 || easting > 900000) return null
  if (northing < 0 || northing > 10000000) return null

  // Odhadni UTM zónu zo stredového meridiánu
  // Pre Slovakia: UTM 34N (lon 18–24°, stred/východ) alebo 33N (lon 12–18°, západ)
  // Heuristika: ak northing ~5000000-5600000 a easting ~200000-700000 → pravdepodobne UTM
  const a  = 6378137.0
  const f  = 1 / 298.257223563
  const b  = a * (1 - f)
  const e2 = 1 - (b / a) ** 2
  const k0 = 0.9996
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))

  // Skuš zóny, preferuj 34N vzhľadom na najčastejšie jaskynné oblasti SR (Slovenský kras, Tatry)
  for (const zone of [34, 33, 32, 35, 31, 36, 30, 29]) {
    const x  = easting - 500000
    const y  = northing
    const M  = y / k0
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))

    const phi1 = mu
      + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
      + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)

    const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2)
    const T1 = Math.tan(phi1) ** 2
    const C1 = (e2 / (1 - e2)) * Math.cos(phi1) ** 2
    const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5
    const D  = x / (N1 * k0)

    const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
      D ** 2 / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e2 / (1 - e2)) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e2 / (1 - e2) - 3 * C1 ** 2) * D ** 6 / 720
    )
    const lon0_deg = (zone - 1) * 6 - 180 + 3
    const lon0_rad = lon0_deg * Math.PI / 180
    const lon  = lon0_rad + (D
      - (1 + 2 * T1 + C1) * D ** 3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e2 / (1 - e2) + 24 * T1 ** 2) * D ** 5 / 120
    ) / Math.cos(phi1)

    const latDeg = lat * 180 / Math.PI
    const lonDeg = lon * 180 / Math.PI

    // Potrebujeme sa uistiť, že vypočítaná dĺžka naozaj patrí (alebo je veľmi blízko) do danej UTM zóny.
    // UTM zóna má šírku 6°. Povolíme malý presah (napr. 3.5° namiesto 3°) kvôli okraju.
    if (latDeg >= -90 && latDeg <= 90 && lonDeg >= -180 && lonDeg <= 180) {
      if (Math.abs(lonDeg - lon0_deg) <= 3.5) {
        return { lat: latDeg, lon: lonDeg, zone }
      }
    }
  }
  return null
}

/** Pokus o konverziu S-JTSK (metricke súradnice záporné) → WGS84 lat/lon. */
export function tryJtskToWgs84(x: number, y: number): { lat: number; lon: number; epsg: string } | null {
  // S-JTSK má špecifické rozsahy (na Slovensku / v ČR).
  // Therion .lox zvyčajne exportuje orientáciu tak, že originX je -Y a originY je -X.
  // Easting (x) je typicky od -900000 do -150000
  // Northing (y) je typicky od -1350000 do -900000
  if (x > -950000 && x < -150000 && y > -1350000 && y < -900000) {
    try {
      const wgs = proj4(SJTSK_DEF, "WGS84", [x, y])
      if (wgs && wgs.length === 2) return { lat: wgs[1], lon: wgs[0], epsg: 'S-JTSK Křovák' }
    } catch (e) {
      console.warn("Chyba proj4 pri S-JTSK:", e)
    }
  }
  return null
}

/**
 * Konvertuje ľubovoľný bod (worldX, worldY) na WGS84 GPS.
 * Najprv skúsi priamy prevod UTM alebo S-JTSK.
 * Ak zlyhá, a je zadaná referenčná stanica s GPS a lokálnymi súradnicami,
 * prepočíta odklon (dx, dy) pomocou WGS84 tangenciálnej aproximácie.
 */
export function worldToWgs84(
  worldX: number,
  worldY: number,
  ref?: { x: number; y: number; gps?: { lat: number; lon: number } | null } | null
): { lat: number; lon: number } | null {
  const direct = tryUtmToWgs84(worldX, worldY) || tryJtskToWgs84(worldX, worldY)
  if (direct) {
    return { lat: direct.lat, lon: direct.lon }
  }

  if (ref && ref.gps && Number.isFinite(ref.gps.lat) && Number.isFinite(ref.gps.lon)) {
    const { lat: refLat, lon: refLon } = ref.gps
    const dx = worldX - ref.x
    const dy = worldY - ref.y

    const latRad = (refLat * Math.PI) / 180
    const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad)
    const mPerDegLon = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad)

    if (Math.abs(mPerDegLat) > 1e-6 && Math.abs(mPerDegLon) > 1e-6) {
      const lat = refLat + dy / mPerDegLat
      const lon = refLon + dx / mPerDegLon
      return { lat, lon }
    }
  }

  return null
}

/**
 * Vytvorí URL pre ZBGIS terénny portál so zobrazením presného identifikačného bodu a centrovaním mapy.
 * Formát: https://zbgis.skgeodesy.sk/mapka/sk/teren/identification/point/{lat},{lon}?pos={lat},{lon},{zoom}
 */
export function getZbgisPointUrl(lat: number, lon: number, zoom = 18): string {
  const latStr = lat.toFixed(6)
  const lonStr = lon.toFixed(6)
  return `https://zbgis.skgeodesy.sk/mapka/sk/teren/identification/point/${latStr},${lonStr}?pos=${latStr},${lonStr},${zoom}`
}

