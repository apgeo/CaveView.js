import proj4 from 'proj4';
import { SJTSK_DEF } from './geoUtils';
import { browserTileCache, createXyzTileCacheKey, type TileCacheBackend } from './tileCache';

proj4.defs('EPSG:5514', SJTSK_DEF);
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs');

const TILE_SIZE = 256;
const TILE_REQUEST_TIMEOUT_MS = 15_000;

export interface Progress {
    current: number;
    total: number;
}

export interface DownloadFailure {
    z?: number;
    x?: number;
    y?: number;
    url: string;
    error: string;
}

export type WmsCrs = 'EPSG:3857' | 'EPSG:5514';

export type UrlPatternCandidates = string | string[];

export type TextureDownloadMode = 'xyz' | 'wms';
export type TextureDownloadStatus = 'running' | 'success' | 'error';

export interface TextureDownloadInspector {
    mode: TextureDownloadMode;
    status: TextureDownloadStatus;
    sourceKey?: string;
    provider?: string;
    zoom?: number;
    totalTiles: number;
    completedTiles: number;
    successfulTiles: number;
    failedTiles: number;
    cacheHits: number;
    cacheMisses: number;
    networkTiles: number;
    candidateRequests: number;
    fallbackRequests: number;
    fallbackTiles: number;
    bytesDownloaded: number;
    bytesFromCache: number;
    widthPixels?: number;
    heightPixels?: number;
    metersPerPixel?: number;
    outputFormat?: string;
    startedAt: number;
    finishedAt?: number;
    durationMs?: number;
    message?: string;
}

export interface XyzDownloadOptions {
    cache?: TileCacheBackend | null;
    cacheKeyPrefix?: string;
    sourceKey?: string;
    provider?: string;
    onInspectorUpdate?: (info: TextureDownloadInspector) => void;
    requestTimeoutMs?: number;
}

export interface XyzTilePlan {
    zoom: number;
    numTilesX: number;
    numTilesY: number;
    totalTiles: number;
    widthPixels: number;
    heightPixels: number;
    metersPerPixel: number;
}

const gpsToTile = (lat: number, lon: number, zoom: number): { x: number; y: number } => {
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lon + 180.0) / 360.0 * n);
  const ytile = Math.floor((1.0 - Math.log(Math.tan(lat * Math.PI / 180.0) + 1 / Math.cos(lat * Math.PI / 180.0)) / Math.PI) / 2.0 * n);
  return { x: xtile, y: ytile };
};

const tileToGps = (x: number, y: number, zoom: number): { lat: number; lon: number } => {
    const n = Math.pow(2, zoom);
    const lon = (x / n) * 360.0 - 180.0;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
    const lat = latRad * 180.0 / Math.PI;
    return { lat, lon };
};

const metersPerPixel = (lat: number, zoom: number): number => {
    return (2 * Math.PI * 6378137 / TILE_SIZE) * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
};

export interface DownloadResult {
    dataUrl: string;
    // The exact bounding box in S-JTSK of the stitched image!
    sjtskBbox: string;
    totalTiles?: number;
    successfulTiles?: number;
    failedTiles?: DownloadFailure[];
    inspector?: TextureDownloadInspector;
}

function mapProxyFailureHint(url: string): string {
    if (url.includes('map-proxy.php')) {
        return ' (check that map-proxy.php was copied to hosting and PHP can fetch external HTTPS URLs)';
    }
    if (url.includes('/xyz-proxy/') || url.includes('/wms-proxy/')) {
        return ' (production hosting is missing the map proxy route; use the PHP proxy deployment files)';
    }
    if (url.includes('allorigins.win') || url.includes('corsproxy.io') || url.includes('codetabs.com') || url.includes('thingproxy.freeboard.io')) {
        return ' (public CORS proxy fallback failed)';
    }
    return '';
}

function toUrlPatterns(urlPattern: UrlPatternCandidates): string[] {
    return Array.isArray(urlPattern) ? urlPattern : [urlPattern];
}

function summarizeCandidateFailures(failures: { url: string; error: string }[]): string {
    if (failures.length === 0) return 'No URL candidates were attempted';
    const first = failures[0];
    const suffix = failures.length > 1 ? `; ${failures.length - 1} fallback candidate(s) also failed` : '';
    return `${first.error}${suffix}`;
}

function hashString(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function mimeFromDataUrl(dataUrl: string): string | undefined {
    const match = /^data:([^;,]+)/.exec(dataUrl);
    return match?.[1];
}

function parseSjtskBbox(sjtskBbox: string): [number, number, number, number] {
    const parts = sjtskBbox.split(',').map(Number);
    if (parts.length !== 4 || !parts.every(Number.isFinite)) {
        throw new Error(`Invalid S-JTSK bbox: ${sjtskBbox}`);
    }

    const [minX, minY, maxX, maxY] = parts;
    if (maxX <= minX || maxY <= minY) {
        throw new Error(`Invalid S-JTSK bbox extent: ${sjtskBbox}`);
    }

    return [minX, minY, maxX, maxY];
}

export function estimateXyzTilePlan(sjtskBbox: string, zoom: number): XyzTilePlan {
    const [minX, minY, maxX, maxY] = parseSjtskBbox(sjtskBbox);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const widthMeters = Math.abs(maxX - minX);
    const heightMeters = Math.abs(maxY - minY);
    const centerGps = proj4('EPSG:5514', 'EPSG:4326').forward([centerX, centerY]);
    const lon = centerGps[0];
    const lat = centerGps[1];
    const centerTile = gpsToTile(lat, lon, zoom);
    const mpp = metersPerPixel(lat, zoom);
    const metersPerTile = mpp * TILE_SIZE;
    const paddingTiles = 1;
    const tileE = Math.ceil((widthMeters / 2) / metersPerTile) + paddingTiles;
    const tileW = Math.ceil((widthMeters / 2) / metersPerTile) + paddingTiles;
    const tileN = Math.ceil((heightMeters / 2) / metersPerTile) + paddingTiles;
    const tileS = Math.ceil((heightMeters / 2) / metersPerTile) + paddingTiles;
    const xMin = centerTile.x - tileW;
    const xMax = centerTile.x + tileE;
    const yMin = centerTile.y - tileN;
    const yMax = centerTile.y + tileS;
    const numTilesX = xMax - xMin + 1;
    const numTilesY = yMax - yMin + 1;

    return {
        zoom,
        numTilesX,
        numTilesY,
        totalTiles: numTilesX * numTilesY,
        widthPixels: numTilesX * TILE_SIZE,
        heightPixels: numTilesY * TILE_SIZE,
        metersPerPixel: mpp,
    };
}

function getTileBudget(requestedResolution: number): { maxTileAxis: number; maxTiles: number } {
    const resolution = Number.isFinite(requestedResolution) ? requestedResolution : 4096;
    const maxTileAxis = Math.max(4, Math.min(16, Math.ceil(resolution / TILE_SIZE)));
    return {
        maxTileAxis,
        maxTiles: Math.max(25, Math.min(96, maxTileAxis * maxTileAxis)),
    };
}

export function selectBestXyzZoom(
    sjtskBbox: string,
    maxZoom: number = 18,
    requestedResolution: number = 4096,
    minZoom: number = 12
): XyzTilePlan {
    const { maxTileAxis, maxTiles } = getTileBudget(requestedResolution);
    const startZoom = Math.max(minZoom, Math.floor(maxZoom));

    for (let zoom = startZoom; zoom >= minZoom; zoom--) {
        const plan = estimateXyzTilePlan(sjtskBbox, zoom);
        if (plan.numTilesX <= maxTileAxis && plan.numTilesY <= maxTileAxis && plan.totalTiles <= maxTiles) {
            return plan;
        }
    }

    return estimateXyzTilePlan(sjtskBbox, minZoom);
}

let webpCanvasSupport: boolean | null = null;

function supportsCanvasFormat(format: string): boolean {
    if (typeof document === 'undefined') return false;
    if (format === 'image/webp' && webpCanvasSupport !== null) return webpCanvasSupport;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const supported = canvas.toDataURL(format).startsWith(`data:${format}`);
    if (format === 'image/webp') webpCanvasSupport = supported;
    return supported;
}

export function getPreferredTextureFormat(inputFormat: string = 'image/jpeg'): string {
    if (inputFormat === 'image/png') return 'image/png';
    return supportsCanvasFormat('image/webp') ? 'image/webp' : inputFormat;
}

function canvasToTextureDataUrl(canvas: HTMLCanvasElement, inputFormat: string): string {
    const outputFormat = getPreferredTextureFormat(inputFormat);
    const quality = outputFormat === 'image/webp' ? 0.98 : outputFormat === 'image/jpeg' ? 0.95 : 1.0;
    const dataUrl = canvas.toDataURL(outputFormat, quality);
    if (dataUrl.startsWith(`data:${outputFormat}`)) return dataUrl;
    return canvas.toDataURL(inputFormat, inputFormat === 'image/jpeg' ? 0.92 : 1.0);
}

export async function downloadWmsImage(
    urlPattern: UrlPatternCandidates,
    sjtskBbox: string, // S-JTSK bounding box
    width: number,
    height: number,
    format: string = 'image/jpeg',
    onProgress?: (p: Progress) => void,
    crs: WmsCrs = 'EPSG:3857'
): Promise<DownloadResult> {
    const parts = parseSjtskBbox(sjtskBbox);
    // Expand by 150 meters to ensure the texture is always larger than the 3D model
    const margin = 150;
    const minX = parts[0] - margin;
    const minY = parts[1] - margin;
    const maxX = parts[2] + margin;
    const maxY = parts[3] + margin;

    // Convert corners to EPSG:3857 (Web Mercator) since WMS uses crs=EPSG:3857
    const blGps = proj4('EPSG:5514', 'EPSG:4326').forward([minX, minY]);
    const trGps = proj4('EPSG:5514', 'EPSG:4326').forward([maxX, maxY]);

    // We update the BBox string to reflect the newly expanded area for exact calibration
    const expandedSjtskBbox = `${minX},${minY},${maxX},${maxY}`;

    let requestBbox = expandedSjtskBbox;
    if (crs === 'EPSG:3857') {
        const bl3857 = proj4('EPSG:4326', 'EPSG:3857').forward(blGps);
        const tr3857 = proj4('EPSG:4326', 'EPSG:3857').forward(trGps);
        requestBbox = `${Math.min(bl3857[0], tr3857[0])},${Math.min(bl3857[1], tr3857[1])},${Math.max(bl3857[0], tr3857[0])},${Math.max(bl3857[1], tr3857[1])}`;
    }

    const urls = toUrlPatterns(urlPattern).map(pattern => pattern
        .replace('{bbox}', requestBbox)
        .replace('{width}', width.toString())
        .replace('{height}', height.toString())
        .replace('{crs}', encodeURIComponent(crs))
    );

    if (onProgress) onProgress({ current: 0, total: 1 });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (!ctx) throw new Error('Canvas 2D context is unavailable');
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, width, height);

    const startedAt = Date.now();
    const candidateFailures: { url: string; error: string }[] = [];
    let candidateRequests = 0;
    try {
        for (const [index, url] of urls.entries()) {
            try {
                candidateRequests++;
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`WMS fetch failed: ${resp.status} ${resp.statusText}${mapProxyFailureHint(url)}`);
                const blob = await resp.blob();
                const img = await createImageBitmap(blob);
                ctx.drawImage(img, 0, 0, width, height);
                img.close?.();
                const dataUrl = canvasToTextureDataUrl(canvas, format);
                const finishedAt = Date.now();
                return {
                    dataUrl,
                    sjtskBbox: expandedSjtskBbox,
                    totalTiles: 1,
                    successfulTiles: 1,
                    failedTiles: [],
                    inspector: {
                        mode: 'wms',
                        status: 'success',
                        totalTiles: 1,
                        completedTiles: 1,
                        successfulTiles: 1,
                        failedTiles: 0,
                        cacheHits: 0,
                        cacheMisses: 0,
                        networkTiles: 1,
                        candidateRequests,
                        fallbackRequests: index,
                        fallbackTiles: index > 0 ? 1 : 0,
                        bytesDownloaded: blob.size,
                        bytesFromCache: 0,
                        widthPixels: width,
                        heightPixels: height,
                        outputFormat: mimeFromDataUrl(dataUrl),
                        startedAt,
                        finishedAt,
                        durationMs: finishedAt - startedAt,
                    },
                };
            } catch (e) {
                const error = e instanceof Error ? e.message : String(e);
                candidateFailures.push({ url, error });
                console.warn(`Failed to fetch WMS candidate`, { url, error });
            }
        }

        throw new Error(summarizeCandidateFailures(candidateFailures));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to fetch WMS image: ${message}`);
    } finally {
        if (onProgress) onProgress({ current: 1, total: 1 });
    }
}

export async function downloadTiledXyz(
    urlPattern: UrlPatternCandidates,
    sjtskBbox: string, // S-JTSK bounding box
    format: string = 'image/jpeg',
    onProgress?: (p: Progress) => void,
    forceZoom?: number,
    options: XyzDownloadOptions = {}
): Promise<DownloadResult> {
    const urlPatterns = toUrlPatterns(urlPattern);
    const requestTimeoutMs = options.requestTimeoutMs ?? TILE_REQUEST_TIMEOUT_MS;
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
        throw new RangeError('Tile request timeout must be a positive finite number');
    }
    const cache = options.cache === null ? null : (options.cache || browserTileCache);
    const useCache = !!cache && cache.isAvailable();
    const sourceKey = options.cacheKeyPrefix || options.sourceKey || `url-${hashString(urlPatterns[0] || 'unknown')}`;
    const parts = parseSjtskBbox(sjtskBbox);
    const minX = parts[0];
    const minY = parts[1];
    const maxX = parts[2];
    const maxY = parts[3];
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const widthMeters = Math.abs(maxX - minX);
    const heightMeters = Math.abs(maxY - minY);

    // Convert center from S-JTSK to WGS84
    const centerGps = proj4('EPSG:5514', 'EPSG:4326').forward([centerX, centerY]);
    const lon = centerGps[0];
    const lat = centerGps[1];

    let zoom = forceZoom || 18;
    const maxMeters = Math.max(widthMeters, heightMeters);
    if (!forceZoom) {
        if (maxMeters > 3000) zoom = 15;
        else if (maxMeters > 1500) zoom = 16;
        else if (maxMeters > 500) zoom = 17;
    }

    const centerTile = gpsToTile(lat, lon, zoom);

    const mpp = metersPerPixel(lat, zoom);
    const metersPerTile = mpp * TILE_SIZE;

    // We pad by at least 1 tile in each direction to ensure coverage
    const paddingTiles = 1;
    
    // Calculate how many tiles we need from center
    const tileE = Math.ceil((widthMeters / 2) / metersPerTile) + paddingTiles;
    const tileW = Math.ceil((widthMeters / 2) / metersPerTile) + paddingTiles;
    const tileN = Math.ceil((heightMeters / 2) / metersPerTile) + paddingTiles;
    const tileS = Math.ceil((heightMeters / 2) / metersPerTile) + paddingTiles;

    const xMin = centerTile.x - tileW;
    const xMax = centerTile.x + tileE;
    const yMin = centerTile.y - tileN;
    const yMax = centerTile.y + tileS;

    const numTilesX = xMax - xMin + 1;
    const numTilesY = yMax - yMin + 1;

    // Calculate EXACT corner GPS coordinates of the stitched whole-tile image
    const blGps = tileToGps(xMin, yMax + 1, zoom);
    const trGps = tileToGps(xMax + 1, yMin, zoom);

    // Convert corners back to S-JTSK
    const blJtsk = proj4('EPSG:4326', 'EPSG:5514').forward([blGps.lon, blGps.lat]);
    const trJtsk = proj4('EPSG:4326', 'EPSG:5514').forward([trGps.lon, trGps.lat]);
    
    // Create actual returned BBOX. Note: Krovak bounds (X, Y)
    const exactSjtskBbox = `${Math.min(blJtsk[0], trJtsk[0])},${Math.min(blJtsk[1], trJtsk[1])},${Math.max(blJtsk[0], trJtsk[0])},${Math.max(blJtsk[1], trJtsk[1])}`;

    const canvas = document.createElement('canvas');
    canvas.width = numTilesX * TILE_SIZE;
    canvas.height = numTilesY * TILE_SIZE;
    
    const ctx = canvas.getContext('2d')!;
    if (!ctx) throw new Error('Canvas 2D context is unavailable');
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const total = numTilesX * numTilesY;
    let current = 0;
    let successfulTiles = 0;
    const failedTiles: DownloadFailure[] = [];
    const startedAt = Date.now();
    const inspector: TextureDownloadInspector = {
        mode: 'xyz',
        status: 'running',
        sourceKey,
        provider: options.provider,
        zoom,
        totalTiles: total,
        completedTiles: 0,
        successfulTiles: 0,
        failedTiles: 0,
        cacheHits: 0,
        cacheMisses: 0,
        networkTiles: 0,
        candidateRequests: 0,
        fallbackRequests: 0,
        fallbackTiles: 0,
        bytesDownloaded: 0,
        bytesFromCache: 0,
        widthPixels: canvas.width,
        heightPixels: canvas.height,
        metersPerPixel: mpp,
        startedAt,
    };

    const emitInspector = (status: TextureDownloadStatus = inspector.status, message?: string) => {
        const now = Date.now();
        options.onInspectorUpdate?.({
            ...inspector,
            status,
            message,
            durationMs: now - startedAt,
            finishedAt: status === 'running' ? undefined : now,
        });
    };

    const buildTileUrl = (pattern: string, tx: number, ty: number): string => {
        let url = pattern
            .replace('{z}', zoom.toString())
            .replace('{x}', tx.toString())
            .replace('{y}', ty.toString())
            .replace('{width}', TILE_SIZE.toString())
            .replace('{height}', TILE_SIZE.toString());
        
        if (url.includes('{bbox}')) {
            // Calculate tile bbox in EPSG:3857
            const bl = tileToGps(tx, ty + 1, zoom);
            const tr = tileToGps(tx + 1, ty, zoom);
            const bl3857 = proj4('EPSG:4326', 'EPSG:3857').forward([bl.lon, bl.lat]);
            const tr3857 = proj4('EPSG:4326', 'EPSG:3857').forward([tr.lon, tr.lat]);
            const bboxStr = `${bl3857[0]},${bl3857[1]},${tr3857[0]},${tr3857[1]}`;
            url = url.replace('{bbox}', bboxStr);
        }
        return url;
    };

    const fetchTile = async (tx: number, ty: number) => {
        const urls = urlPatterns.map(pattern => buildTileUrl(pattern, tx, ty));
        const candidateFailures: { url: string; error: string }[] = [];
        const cacheKey = createXyzTileCacheKey(sourceKey, zoom, tx, ty);

        if (useCache && cache) {
            try {
                const cachedBlob = await cache.get(cacheKey);
                if (cachedBlob && cachedBlob.size !== 1843) {
                    const img = await createImageBitmap(cachedBlob);
                    const dx = (tx - xMin) * TILE_SIZE;
                    const dy = (ty - yMin) * TILE_SIZE;
                    ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
                    img.close?.();
                    inspector.cacheHits++;
                    inspector.bytesFromCache += cachedBlob.size;
                    successfulTiles++;
                    inspector.successfulTiles = successfulTiles;
                    return;
                }
                inspector.cacheMisses++;
            } catch (e) {
                const error = e instanceof Error ? e.message : String(e);
                console.warn(`Failed to read tile cache ${zoom}/${tx}/${ty}`, { error });
            }
        }

        for (const [index, url] of urls.entries()) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
            try {
                inspector.candidateRequests++;
                if (index > 0) inspector.fallbackRequests++;
                const resp = await fetch(url, { signal: controller.signal });
                if (!resp.ok) throw new Error(`Tile fetch failed: ${resp.status} ${resp.statusText}${mapProxyFailureHint(url)}`);
                const blob = await resp.blob();
                if (blob.size === 1843) {
                    throw new Error('Tile is an empty placeholder image ("no map data")');
                }
                const img = await createImageBitmap(blob);
                
                const dx = (tx - xMin) * TILE_SIZE;
                const dy = (ty - yMin) * TILE_SIZE;
                ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
                img.close?.();
                inspector.networkTiles++;
                inspector.bytesDownloaded += blob.size;
                if (index > 0) inspector.fallbackTiles++;
                successfulTiles++;
                inspector.successfulTiles = successfulTiles;
                if (useCache && cache) {
                    void cache.put(cacheKey, blob);
                }
                return;
            } catch (e) {
                const error = e instanceof Error ? e.message : String(e);
                candidateFailures.push({ url, error });
                console.warn(`Failed to fetch tile candidate ${zoom}/${tx}/${ty}`, { url, error });
            } finally {
                clearTimeout(timeoutId);
            }
        }

        const firstUrl = urls[0] || '';
        failedTiles.push({
            z: zoom,
            x: tx,
            y: ty,
            url: firstUrl,
            error: summarizeCandidateFailures(candidateFailures),
        });
        inspector.failedTiles = failedTiles.length;
    };

    const queue: [number, number][] = [];
    for (let ty = yMin; ty <= yMax; ty++) {
        for (let tx = xMin; tx <= xMax; tx++) {
            queue.push([tx, ty]);
        }
    }

    emitInspector();

    const concurrency = 6;
    for (let i = 0; i < queue.length; i += concurrency) {
        const batch = queue.slice(i, i + concurrency);
        await Promise.all(batch.map(async ([tx, ty]) => {
            try {
                await fetchTile(tx, ty);
            } finally {
                current++;
                inspector.completedTiles = current;
                inspector.successfulTiles = successfulTiles;
                inspector.failedTiles = failedTiles.length;
                if (onProgress) onProgress({ current, total });
                emitInspector();
            }
        }));
    }

    if (successfulTiles === 0) {
        const firstFailure = failedTiles[0];
        const detail = firstFailure ? ` First failure: ${firstFailure.error}` : '';
        emitInspector('error', `No map tiles downloaded (${failedTiles.length}/${total} failed).${detail}`);
        throw new Error(`No map tiles downloaded (${failedTiles.length}/${total} failed).${detail}`);
    }

    const dataUrl = canvasToTextureDataUrl(canvas, format);
    inspector.outputFormat = mimeFromDataUrl(dataUrl);
    const finishedAt = Date.now();
    const finalInspector: TextureDownloadInspector = {
        ...inspector,
        status: 'success',
        completedTiles: current,
        successfulTiles,
        failedTiles: failedTiles.length,
        outputFormat: inspector.outputFormat,
        finishedAt,
        durationMs: finishedAt - startedAt,
    };
    options.onInspectorUpdate?.(finalInspector);

    return {
        dataUrl,
        sjtskBbox: exactSjtskBbox,
        totalTiles: total,
        successfulTiles,
        failedTiles,
        inspector: finalInspector,
    };
}
