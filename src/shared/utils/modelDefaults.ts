export type ViewerEngine = 'v1' | 'v2';

const LARGE_POINT_CLOUD_BYTES = 50 * 1024 * 1024;

export function getPreferredEngineForFile(ext: string): ViewerEngine {
  return ext.toLowerCase() === '.ply' ? 'v2' : 'v1';
}

export function isPlyLidarData(
  ext?: string | null,
  cave?: { isLiDAR?: boolean; pointCount?: number; segments?: any[] } | null
): boolean {
  if (ext && ext.toLowerCase() === '.ply') return true;
  if (cave?.isLiDAR && (cave.pointCount ?? 0) > 0 && !(cave.segments?.length)) return true;
  return false;
}

export function getDefaultPointCloudSize(ext: string, byteLength: number): number {
  return ext.toLowerCase() === '.ply' && byteLength > LARGE_POINT_CLOUD_BYTES ? 0.3 : 0.5;
}
