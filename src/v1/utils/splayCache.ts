import type { SplayMeshGeometryData } from '../types/splayTypes';

export const SPLAY_CACHE_MAX_BYTES = 256 * 1024 * 1024;

interface CacheEntry {
  data: SplayMeshGeometryData;
  byteLength: number;
}

export function createSplayGeometryCache(maxBytes = SPLAY_CACHE_MAX_BYTES) {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new RangeError('Splay cache byte limit must be a non-negative finite number');
  }

  const cache = new Map<string, CacheEntry>();
  let totalBytes = 0;

  return {
    get(key: string): SplayMeshGeometryData | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;
      cache.delete(key);
      cache.set(key, entry);
      return entry.data;
    },
    set(key: string, data: SplayMeshGeometryData): void {
      const existing = cache.get(key);
      if (existing) {
        totalBytes -= existing.byteLength;
        cache.delete(key);
      }

      const byteLength = data.positions.byteLength + data.normals.byteLength + data.indices.byteLength;
      if (byteLength > maxBytes) return;

      cache.set(key, { data, byteLength });
      totalBytes += byteLength;

      while (totalBytes > maxBytes) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) break;
        const oldest = cache.get(oldestKey)!;
        cache.delete(oldestKey);
        totalBytes -= oldest.byteLength;
      }
    },
    clear(): void {
      cache.clear();
      totalBytes = 0;
    },
  };
}

/** Session-level cache avoids rebuilding Splay SDF meshes when toggling their visibility. */
const splaySessionCache = createSplayGeometryCache();

export function getSplayCacheKey(
  caveId: string | number,
  stationCount: number,
  voxelSize: number,
  smoothK: number,
  capsuleRadius: number,
  isovalue: number = 0.0
): string {
  return `splay_${caveId}_${stationCount}_${voxelSize.toFixed(3)}_${smoothK.toFixed(3)}_${capsuleRadius.toFixed(3)}_${isovalue.toFixed(3)}`;
}

export function getCachedSplayGeometry(key: string): SplayMeshGeometryData | undefined {
  return splaySessionCache.get(key);
}

export function setCachedSplayGeometry(key: string, data: SplayMeshGeometryData): void {
  splaySessionCache.set(key, data);
}

export function clearSplayCache(): void {
  splaySessionCache.clear();
}
