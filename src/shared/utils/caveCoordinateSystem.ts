import proj4 from 'proj4';
import type { ParsedCave, StationLabel, Vec3 } from '@shared/types';
import { SJTSK_DEF } from './geoUtils';
import { UTM34_DEF, wgs84ToUtm34 } from './dmrDownloader';
import { isEntranceStation } from './stationAltitude';

export type CaveCrsType = 'sjtsk' | 'utm' | 'wgs84' | 'local';

export interface CaveCrsDetection {
  type: CaveCrsType;
  labelSk: string;
  labelEn: string;
  descriptionSk: string;
  descriptionEn: string;
  georeferenced: boolean;
  hasEntrance: boolean;
  hasFixedStation: boolean;
  entranceStation: StationLabel | null;
  meridianConvergenceDeg?: number;
}

/**
 * Zistí súradnicový systém jaskyne a spôsob zamerania vchodu z načítaného modelu (.lox, .3d, .plt).
 */
export function detectCaveCoordinateSystem(cave?: ParsedCave | null): CaveCrsDetection {
  if (!cave) {
    return {
      type: 'local',
      labelSk: 'Neznámy / žiadny model',
      labelEn: 'Unknown / no model',
      descriptionSk: 'Model nie je načítaný.',
      descriptionEn: 'No model loaded.',
      georeferenced: false,
      hasEntrance: false,
      hasFixedStation: false,
      entranceStation: null,
    };
  }

  // Nájdi vchodové stanice a fixované stanice
  let entranceStation: StationLabel | null = null;
  let hasEntrance = false;
  let hasFixedStation = false;

  if (cave.stationLabels && cave.stationLabels.length > 0) {
    for (const st of cave.stationLabels) {
      if (st.isFixed) hasFixedStation = true;
      if (isEntranceStation(st)) {
        hasEntrance = true;
        if (!entranceStation) entranceStation = st;
      }
    }
  }

  const cx = cave.centerOffset?.x || 0;
  const cy = cave.centerOffset?.y || 0;

  // 1. Kontrola S-JTSK (Křovák)
  // Easting (x) typicky -950 000 až -150 000, Northing (y) typicky -1 350 000 až -900 000
  const isSjtsk = cx > -950000 && cx < -150000 && cy > -1350000 && cy < -900000;
  if (isSjtsk) {
    // Výpočet meridiánovej konvergencie pre stred jaskyne voči UTM 34N
    let convergence = 0;
    try {
      const wgs0 = proj4(SJTSK_DEF, 'WGS84', [cx, cy]);
      const wgsN = proj4(SJTSK_DEF, 'WGS84', [cx, cy + 100]);
      const [u0x, u0y] = wgs84ToUtm34(wgs0[1], wgs0[0]);
      const [uNx, uNy] = wgs84ToUtm34(wgsN[1], wgsN[0]);
      convergence = Math.atan2(uNx - u0x, uNy - u0y) * (180 / Math.PI);
    } catch {
      convergence = 0;
    }

    return {
      type: 'sjtsk',
      labelSk: 'S-JTSK (Křovák)',
      labelEn: 'S-JTSK (Krovak)',
      descriptionSk: `Jaskyňa je zameraná v štátnom systéme S-JTSK (odklon od UTM severu: ${convergence.toFixed(1)}°). Povrch sa automaticky prepočíta do S-JTSK.`,
      descriptionEn: `Cave is surveyed in national S-JTSK frame (grid convergence vs UTM: ${convergence.toFixed(1)}°). Surface will be reprojected to S-JTSK.`,
      georeferenced: true,
      hasEntrance,
      hasFixedStation,
      entranceStation,
      meridianConvergenceDeg: convergence,
    };
  }

  // 2. Kontrola ETRS89 / UTM (zóna 34N alebo 33N)
  // Easting (x) typicky 100 000 až 900 000, Northing (y) typicky 4 700 000 až 5 600 000
  const isUtm = cx > 100000 && cx < 900000 && cy > 4700000 && cy < 5600000;
  if (isUtm) {
    return {
      type: 'utm',
      labelSk: 'GPS (ETRS89-TM34 / UTM)',
      labelEn: 'GPS (ETRS89-TM34 / UTM)',
      descriptionSk: 'Jaskyňa je zameraná cez GPS priamo v UTM 34N. DMR 5.0 povrch sedí 1:1 bez nutnosti rotácie.',
      descriptionEn: 'Cave is surveyed via GPS in UTM 34N. DMR 5.0 surface matches 1:1 without rotation.',
      georeferenced: true,
      hasEntrance,
      hasFixedStation,
      entranceStation,
      meridianConvergenceDeg: 0,
    };
  }

  // 3. Kontrola priamych WGS84 stupňov
  const isWgs84 = cx >= 16.0 && cx <= 23.0 && cy >= 47.0 && cy <= 50.0;
  if (isWgs84) {
    return {
      type: 'wgs84',
      labelSk: 'WGS84 (geografické stupne)',
      labelEn: 'WGS84 (geographic degrees)',
      descriptionSk: 'Súradnice sú v desatinných stupňoch WGS84.',
      descriptionEn: 'Coordinates are in WGS84 decimal degrees.',
      georeferenced: true,
      hasEntrance,
      hasFixedStation,
      entranceStation,
    };
  }

  // 4. Lokálny meračský systém (nezameraný vchod)
  return {
    type: 'local',
    labelSk: 'Lokálny meračský systém',
    labelEn: 'Local survey frame',
    descriptionSk: hasEntrance
      ? 'Vchod nemá geodetické GPS/S-JTSK súradnice. Povrch sa ukotví na vchod podľa zadaného GPS.'
      : 'Model nemá geodetické súradnice ani označený vchod. Povrch sa vycentruje na stred modelu.',
    descriptionEn: hasEntrance
      ? 'Entrance lacks absolute GPS/S-JTSK coordinates. Terrain will be anchored to entrance using entered GPS.'
      : 'Model lacks absolute georeferencing and entrance tag. Terrain will be centered on model midpoint.',
    georeferenced: false,
    hasEntrance,
    hasFixedStation,
    entranceStation,
  };
}
