import proj4 from 'proj4';
import type { CaveSurface, ParsedCave } from '@shared/types';
import { SJTSK_DEF } from './geoUtils';
import { getSjtskBoundsFromDtm } from './surfaceBounds';
import { findReferenceStation } from './stationAltitude';
import { tryUtmToWgs84, tryJtskToWgs84 } from './coords';
import { buildMapProxyUrlCandidates } from './mapProxyUrls';
import { getSlovakiaQuasigeoidUndulation } from './slovakiaQuasigeoid';
import { detectCaveCoordinateSystem } from './caveCoordinateSystem';

/** ETRS89 / UTM zóna 34N (EPSG:3046 / EPSG:25834) používaná pre celoštátny DMR 5.0 SR */
export const UTM34_DEF = "+proj=utm +zone=34 +ellps=GRS80 +units=m +no_defs";

/** Konverzia WGS84 [lat, lon] → UTM 34N [easting, northing] */
export function wgs84ToUtm34(lat: number, lon: number): [number, number] {
  const result = proj4("WGS84", UTM34_DEF, [lon, lat]);
  return [result[0], result[1]];
}

/** Konverzia UTM 34N [easting, northing] → WGS84 [lat, lon] */
export function utm34ToWgs84(easting: number, northing: number): [number, number] {
  const result = proj4(UTM34_DEF, "WGS84", [easting, northing]);
  return [result[1], result[0]];
}

/**
 * Vygeneruje obsah štandardného ESRI World File (.tfw) pre 1-metrový raster DMR 5.0.
 * Súradnice v riadkoch 5 a 6 označujú stred ľavého horného pixela (offset pol pixela).
 */
export function generateTfwContent(minE: number, maxN: number, pixelSize = 1.0): string {
  const xOrigin = (minE + pixelSize / 2).toFixed(4);
  const yOrigin = (maxN - pixelSize / 2).toFixed(4);
  return [
    pixelSize.toFixed(10),
    '0.0000000000',
    '0.0000000000',
    (-pixelSize).toFixed(10),
    xOrigin,
    yOrigin,
  ].join('\n');
}

export interface CaveGpsSource {
  lat: number;
  lon: number;
  source: 'entrance_gps' | 'station_gps' | 'center_offset_utm' | 'center_offset_jtsk';
  stationName?: string;
}

/**
 * Zistí GPS súradnice jaskyne z dostupných metaúdajov:
 * 1. Primárny vchod s GPS (findReferenceStation)
 * 2. Ľubovoľná stanica s GPS v modeli
 * 3. Prevod zo súradníc centerOffset (UTM alebo S-JTSK)
 */
export function guessCaveCoordinates(cave?: ParsedCave | null): CaveGpsSource | null {
  if (!cave) return null;

  // 1. Skús referenčný vchod
  const ref = findReferenceStation(cave);
  if (ref && ref.gps && Number.isFinite(ref.gps.lat) && Number.isFinite(ref.gps.lon)) {
    return {
      lat: ref.gps.lat,
      lon: ref.gps.lon,
      source: 'entrance_gps',
      stationName: ref.name,
    };
  }

  // 2. Skús ľubovoľnú stanicu s GPS
  if (cave.stationLabels && cave.stationLabels.length > 0) {
    for (const st of cave.stationLabels) {
      if (st.gps && Number.isFinite(st.gps.lat) && Number.isFinite(st.gps.lon)) {
        return {
          lat: st.gps.lat,
          lon: st.gps.lon,
          source: 'station_gps',
          stationName: st.name,
        };
      }
    }
  }

  // 3. Skús priamy prevod zo stredu jaskyne (centerOffset)
  const cx = cave.centerOffset.x;
  const cy = cave.centerOffset.y;

  const utmGps = tryUtmToWgs84(cx, cy);
  if (utmGps) {
    return {
      lat: utmGps.lat,
      lon: utmGps.lon,
      source: 'center_offset_utm',
    };
  }

  const jtskGps = tryJtskToWgs84(cx, cy);
  if (jtskGps) {
    return {
      lat: jtskGps.lat,
      lon: jtskGps.lon,
      source: 'center_offset_jtsk',
    };
  }

  return null;
}

export interface Dmr5Bounds {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  width: number;
  height: number;
  centerE: number;
  centerN: number;
}

/**
 * Vypočíta celočíselné ohraničenie (bbox) v UTM 34N pre zadaný stred a rozmer v metroch.
 */
export function calculateDmr5Bounds(centerLat: number, centerLon: number, extentMeters = 500): Dmr5Bounds {
  const [centerE, centerN] = wgs84ToUtm34(centerLat, centerLon);
  const half = Math.round(extentMeters / 2);

  const minE = Math.round(centerE - half);
  const maxE = Math.round(minE + extentMeters);
  const minN = Math.round(centerN - half);
  const maxN = Math.round(minN + extentMeters);

  return {
    minE,
    maxE,
    minN,
    maxN,
    width: maxE - minE,
    height: maxN - minN,
    centerE,
    centerN,
  };
}

/**
 * Vytvorí priamu OGC WCS 2.0.1 požiadavku GetCoverage pre službu DMR 5.0 GKÚ SR.
 */
export function buildDmr5WcsUrl(minE: number, maxE: number, minN: number, maxN: number): string {
  const params = new URLSearchParams({
    service: 'WCS',
    version: '2.0.1',
    request: 'GetCoverage',
    coverageId: 'el__EL.GridCoverage',
    format: 'image/tiff;application=geotiff',
    subset: `N(${minN},${maxN})`,
  });
  // WCS 2.0.1 vyžaduje viacnásobný parameter subset
  return `https://inspirews.skgeodesy.sk/geoserver/el/ows?${params.toString()}&subset=E(${minE},${maxE})`;
}

/**
 * Stiahne GeoTIFF raster DMR 5.0 z WCS služby s automatickým fallbackom cez proxy.
 */
export async function fetchDmr5GeoTiff(
  minE: number,
  maxE: number,
  minN: number,
  maxN: number,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const directUrl = buildDmr5WcsUrl(minE, maxE, minN, maxN);
  const queryParams = {
    service: 'WCS',
    version: '2.0.1',
    request: 'GetCoverage',
    coverageId: 'el__EL.GridCoverage',
    format: 'image/tiff;application=geotiff',
    'subset': `N(${minN},${maxN})`,
    'subset__E': `E(${minE},${maxE})`,
  };

  const candidateUrls = buildMapProxyUrlCandidates(
    'inspire-wcs-dmr',
    '',
    queryParams,
    `/wcs-proxy/el?service=WCS&version=2.0.1&request=GetCoverage&coverageId=el__EL.GridCoverage&format=image%2Ftiff%3Bapplication%3Dgeotiff&subset=N(${minN},${maxN})&subset=E(${minE},${maxE})`,
    directUrl
  );

  let lastError: Error | null = null;
  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url, { signal });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('xml') || contentType.includes('text')) {
        const text = await resp.text();
        throw new Error(`WCS Service Exception: ${text.slice(0, 300)}`);
      }
      return await resp.arrayBuffer();
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      console.warn(`[DMR5] Fetch failed for ${url}:`, err);
    }
  }

  throw lastError || new Error('Nepodarilo sa stiahnuť DMR 5.0 GeoTIFF z dostupných serverov.');
}

export interface CreateDmr5SurfaceOptions {
  /** Výškový referenčný systém: 'bpv' (predvolené, nadmorská výška znížená o kvázigeoid) alebo 'etrs89' (surová elipsoidická) */
  heightSystem?: 'bpv' | 'etrs89';
}

export interface Dmr5SurfaceResult {
  surface: CaveSurface;
  tfwText: string;
  heightSystem: 'bpv' | 'etrs89';
  quasigeoidUndulation: number;
}

/**
 * Vytvorí plnohodnotný CaveSurface objekt z binárneho GeoTIFF bufferu
 * a presne ho napasuje na súradnicový systém a stred jaskyne.
 * Predvolene prevedie elipsoidické výšky ETRS89 na normálne nadmorské výšky Bpv (Balt po vyrovnaní)
 * odpočítaním odľahlosti slovenského kvázigeoidu zeta(lat, lon).
 */
export async function createDmr5Surface(
  tifBuffer: ArrayBuffer,
  minE: number,
  maxN: number,
  cave?: ParsedCave | null,
  options?: CreateDmr5SurfaceOptions
): Promise<Dmr5SurfaceResult> {
  const heightSystem = options?.heightSystem ?? 'bpv';
  const tfwText = generateTfwContent(minE, maxN, 1.0);
  const centerOffset = cave ? { ...cave.centerOffset } : { x: minE, y: maxN, z: 0 };

  const { parseGeoTiff } = await import('@v1/parsers/tiffParser');
  const surface = await parseGeoTiff(tifBuffer, tfwText, centerOffset);

  // 1. Zisťovanie stredu stiahnutého rastra vo WGS84 pre výpočet odľahlosti kvázigeoidu
  const extentWidth = surface.dtm.samples * Math.abs(surface.dtm.calib.xx || 1.0);
  const extentHeight = surface.dtm.lines * Math.abs(surface.dtm.calib.yy || 1.0);
  const centerE = minE + extentWidth / 2;
  const centerN = maxN - extentHeight / 2;
  const [centerLat, centerLon] = utm34ToWgs84(centerE, centerN);

  let quasigeoidUndulation = 0;
  if (heightSystem === 'bpv') {
    quasigeoidUndulation = getSlovakiaQuasigeoidUndulation(centerLat, centerLon);
    // Odpočítanie odľahlosti kvázigeoidu: H_Bpv = h_ETRS89 - zeta
    const data = surface.dtm.data;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > -9000 && data[i] < 1e30) {
        data[i] -= quasigeoidUndulation;
      }
    }
    if (surface.bounds) {
      surface.bounds.minZ -= quasigeoidUndulation;
      surface.bounds.maxZ -= quasigeoidUndulation;
    }
  }

  surface.heightSystem = heightSystem;
  surface.quasigeoidUndulation = quasigeoidUndulation;

  // 2. Geodetické zosúladenie s jaskyňou podľa detekovaného CRS
  if (cave) {
    const crsInfo = detectCaveCoordinateSystem(cave);
    const cal = surface.dtm.calib;

    if (crsInfo.type === 'utm') {
      // Jaskyňa je priamo v UTM 34N
      surface.centerOffset = { ...cave.centerOffset };
    } else if (crsInfo.type === 'sjtsk') {
      // Jaskyňa je v S-JTSK: prepočítaj kalibráciu DTM z UTM 34N do S-JTSK vrátane meridiánovej konvergencie
      try {
        const oWgs = proj4(UTM34_DEF, "WGS84", [cal.xOrigin, cal.yOrigin]);
        const oTarget = proj4("WGS84", SJTSK_DEF, oWgs);

        const xWgs = proj4(UTM34_DEF, "WGS84", [cal.xOrigin + cal.xx, cal.yOrigin + cal.yx]);
        const xTarget = proj4("WGS84", SJTSK_DEF, xWgs);

        const yWgs = proj4(UTM34_DEF, "WGS84", [cal.xOrigin + cal.xy, cal.yOrigin + cal.yy]);
        const yTarget = proj4("WGS84", SJTSK_DEF, yWgs);

        surface.dtm.calib = {
          xOrigin: oTarget[0],
          yOrigin: oTarget[1],
          xx: xTarget[0] - oTarget[0],
          yx: xTarget[1] - oTarget[1],
          xy: yTarget[0] - oTarget[0],
          yy: yTarget[1] - oTarget[1],
        };
        surface.centerOffset = { ...cave.centerOffset };
      } catch (e) {
        console.error('[DMR5] Reprojection from UTM34 to S-JTSK failed:', e);
      }
    } else {
      // Jaskyňa je v lokálnych meračských súradniciach, ale máme GPS referenčného vchodu
      const ref = findReferenceStation(cave);
      const refPos = ref?.station?.pos || (ref && ref.idx >= 0 && cave.stations ? cave.stations[ref.idx] : null) || { x: 0, y: 0, z: 0 };
      if (ref && ref.gps && Number.isFinite(ref.gps.lat) && Number.isFinite(ref.gps.lon)) {
        const [refE, refN] = wgs84ToUtm34(ref.gps.lat, ref.gps.lon);
        const caveOriginE = refE - refPos.x;
        const caveOriginN = refN - refPos.y;

        surface.dtm.calib = {
          ...surface.dtm.calib,
          xOrigin: minE - caveOriginE,
          yOrigin: maxN - caveOriginN,
        };
        surface.centerOffset = { ...cave.centerOffset };
      }
    }
  }

  // Prepočet S-JTSK BBoxu, aby na novom teréne okamžite fungovali aj mapové textúry (Ortofoto, tieňovanie)
  const sjtskBounds = getSjtskBoundsFromDtm(surface.dtm);
  if (sjtskBounds) {
    surface.sjtskBbox = sjtskBounds.bbox;
    surface.sjtskBboxSource = sjtskBounds.sourceCrs;
    surface.sjtskAspect = sjtskBounds.aspect;
  }

  return { surface, tfwText, heightSystem, quasigeoidUndulation };
}

/**
 * Pomocná funkcia na stiahnutie vygenerovaných súborov (.tif a .tfw) do počítača používateľa.
 */
export function downloadDmrFiles(
  tifBuffer: ArrayBuffer,
  tfwText: string,
  baseName = 'dmr5_terrain'
): void {
  // Stiahnutie .tif
  const tifBlob = new Blob([tifBuffer], { type: 'image/tiff' });
  const tifUrl = URL.createObjectURL(tifBlob);
  const aTif = document.createElement('a');
  aTif.href = tifUrl;
  aTif.download = `${baseName}.tif`;
  document.body.appendChild(aTif);
  aTif.click();
  document.body.removeChild(aTif);
  URL.revokeObjectURL(tifUrl);

  // Stiahnutie .tfw
  const tfwBlob = new Blob([tfwText], { type: 'text/plain;charset=utf-8' });
  const tfwUrl = URL.createObjectURL(tfwBlob);
  const aTfw = document.createElement('a');
  aTfw.href = tfwUrl;
  aTfw.download = `${baseName}.tfw`;
  document.body.appendChild(aTfw);
  aTfw.click();
  document.body.removeChild(aTfw);
  URL.revokeObjectURL(tfwUrl);
}
