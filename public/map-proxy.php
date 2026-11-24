<?php
declare(strict_types=1);

$sources = [
    'zbgis' => [
        'base' => 'https://zbgis.skgeodesy.sk/zbgis/rest/services',
        'pathRequired' => true,
    ],
    'freemap-orto' => [
        'base' => 'https://ortofoto.tiles.freemap.sk',
        'pathRequired' => true,
    ],
    'freemap-shading' => [
        'base' => 'https://dmr5-shading.tiles.freemap.sk',
        'pathRequired' => true,
    ],
    'geology' => [
        'base' => 'https://ags.geology.sk/arcgis/services/WebServices/GM50/MapServer/WMSServer',
        'pathRequired' => false,
    ],
    'zbgis-wms-orto' => [
        'base' => 'https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get',
        'pathRequired' => false,
    ],
    'zbgis-wms-shadow' => [
        'base' => 'https://zbgisws.skgeodesy.sk/zbgis_dmr_wms/service.svc/get',
        'pathRequired' => false,
    ],
    'inspire-wcs-dmr' => [
        'base' => 'https://inspirews.skgeodesy.sk/geoserver/el/ows',
        'pathRequired' => false,
    ],
];

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function fail(int $status, string $message): void
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
    exit;
}

function sanitizePath(string $path): string
{
    $path = ltrim(trim($path), '/');
    if (strlen($path) > 1024) {
        fail(400, 'Invalid proxy path: too long');
    }
    if (preg_match('#(^|/)\.\.(/|$)|://|^//#', $path)) {
        fail(400, 'Invalid proxy path');
    }
    if (!preg_match('#^[A-Za-z0-9._~!$&()*+,;=:@/%-]*$#', $path)) {
        fail(400, 'Invalid proxy path characters');
    }
    return $path;
}

function encodePath(string $path): string
{
    if ($path === '') return '';
    return implode('/', array_map('rawurlencode', explode('/', $path)));
}

function sanitizeContentType($contentType): string
{
    if (!is_string($contentType) || $contentType === '' || preg_match('/[\r\n]/', $contentType)) {
        return 'application/octet-stream';
    }
    return $contentType;
}

function proxyWithCurl(string $targetUrl): void
{
    $ch = curl_init($targetUrl);
    if ($ch === false) {
        fail(502, 'Unable to initialize proxy request');
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Referer: https://zbgis.skgeodesy.sk/',
        ],
    ]);

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        fail(502, 'Proxy request failed: ' . $error);
    }

    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $contentType = sanitizeContentType(curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $body = substr($response, $headerSize);
    http_response_code($status >= 100 ? $status : 200);
    header('Content-Type: ' . $contentType);
    header($status >= 200 && $status < 300 ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: no-store');
    echo $body;
    exit;
}

function proxyWithStreams(string $targetUrl): void
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 25,
            'header' => "User-Agent: CaveView-map-proxy/2.1\r\nAccept: image/*, application/json, text/plain, */*\r\n",
            'ignore_errors' => true,
        ],
    ]);

    $body = @file_get_contents($targetUrl, false, $context);
    if ($body === false) {
        fail(502, 'Proxy request failed');
    }

    $status = 200;
    $contentType = 'application/octet-stream';
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $header) {
            if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
                $status = (int) $matches[1];
            } elseif (stripos($header, 'Content-Type:') === 0) {
                $contentType = sanitizeContentType(trim(substr($header, 13)));
            }
        }
    }

    http_response_code($status);
    header('Content-Type: ' . $contentType);
    header($status >= 200 && $status < 300 ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: no-store');
    echo $body;
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Only GET requests are allowed');
}

$sourceKey = isset($_GET['source']) ? (string) $_GET['source'] : '';
if (!isset($sources[$sourceKey])) {
    fail(400, 'Unknown proxy source');
}

$source = $sources[$sourceKey];
$path = isset($_GET['path']) ? sanitizePath((string) $_GET['path']) : '';
if ($source['pathRequired'] && $path === '') {
    fail(400, 'Missing proxy path');
}

$query = $_GET;
unset($query['source'], $query['path']);

$targetUrl = rtrim($source['base'], '/');
if ($path !== '') {
    $targetUrl .= '/' . encodePath($path);
}
if (!empty($query)) {
    $targetUrl .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

if (function_exists('curl_init')) {
    proxyWithCurl($targetUrl);
}

proxyWithStreams($targetUrl);
