export type MapProxySource =
  | 'zbgis'
  | 'freemap-orto'
  | 'freemap-shading'
  | 'geology'
  | 'zbgis-wms-orto'
  | 'zbgis-wms-shadow'
  | 'inspire-wcs-dmr';

export type MapProxyMode = 'vite' | 'php';

export type MapProxyParams = Record<string, string | number | boolean | undefined>;

interface BuildUrlOptions {
  mode?: MapProxyMode;
  proxyBase?: string;
  appBase?: string;
  includePublicCorsProxies?: boolean;
}

function normalizeBase(base: string | undefined): string {
  const value = (base || '').trim();
  if (!value || value === '/') return '';
  return value.replace(/\/+$/, '');
}

function encodeQueryValue(value: string | number | boolean): string {
  return encodeURIComponent(String(value))
    .replace(/%7B/gi, '{')
    .replace(/%7D/gi, '}');
}

function encodeProxyTargetPattern(url: string): string {
  return encodeURIComponent(url)
    .replace(/%7B/gi, '{')
    .replace(/%7D/gi, '}');
}

function queryString(params: MapProxyParams): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeQueryValue(value as string | number | boolean)}`)
    .join('&');
}

function getConfiguredMode(): MapProxyMode {
  const mode = String(import.meta.env.VITE_MAP_PROXY_MODE || '').toLowerCase();
  if (mode === 'php' || mode === 'vite') return mode;
  return import.meta.env.DEV ? 'vite' : 'php';
}

function getProxyBase(options?: BuildUrlOptions): string {
  const configuredBase = options?.proxyBase ?? import.meta.env.VITE_TILE_PROXY_BASE;
  if (configuredBase) return normalizeBase(configuredBase);
  return normalizeBase(options?.appBase ?? import.meta.env.BASE_URL);
}

export function buildPhpProxyUrl(
  source: MapProxySource,
  upstreamPath: string,
  params: MapProxyParams = {},
  options?: BuildUrlOptions
): string {
  const base = getProxyBase(options);
  const proxyParams: MapProxyParams = { source };
  if (upstreamPath) proxyParams.path = upstreamPath;
  const query = queryString({ ...proxyParams, ...params });
  return `${base}/map-proxy.php?${query}`;
}

export function buildMapProxyUrl(
  source: MapProxySource,
  upstreamPath: string,
  params: MapProxyParams,
  viteProxyPath: string,
  options?: BuildUrlOptions
): string {
  const mode = options?.mode || getConfiguredMode();
  if (mode === 'php') return buildPhpProxyUrl(source, upstreamPath, params, options);
  return `${getProxyBase(options)}${viteProxyPath}`;
}

export function buildPublicCorsProxyUrls(targetUrlPattern: string): string[] {
  const encodedTarget = encodeProxyTargetPattern(targetUrlPattern);
  return [
    `https://api.allorigins.win/raw?url=${encodedTarget}`,
    `https://corsproxy.io/?${encodedTarget}`,
    `https://api.codetabs.com/v1/proxy/?quest=${encodedTarget}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrlPattern}`,
  ];
}

function uniqueUrls(urls: string[]): string[] {
  return urls.filter((url, index) => url && urls.indexOf(url) === index);
}

export function buildMapProxyUrlCandidates(
  source: MapProxySource,
  upstreamPath: string,
  params: MapProxyParams,
  viteProxyPath: string,
  directUrlPattern: string,
  options?: BuildUrlOptions
): string[] {
  const includePublicCorsProxies = options?.includePublicCorsProxies !== false;
  const sameOriginProxyUrl = buildMapProxyUrl(source, upstreamPath, params, viteProxyPath, options);
  const candidates = [
    directUrlPattern,
    sameOriginProxyUrl,
    ...(includePublicCorsProxies ? buildPublicCorsProxyUrls(directUrlPattern) : []),
  ];
  return uniqueUrls(candidates);
}
