import { tryUtmToWgs84, tryJtskToWgs84 } from "@shared/utils/coords";
import { getSjtskBoundsFromDtm } from "@shared/utils/surfaceBounds";
import { hasUsefulPointColors } from "@shared/utils/pointCloudColors";
import type { Vec3, Segment, Scrap, StationLabel, Calibration, CaveSurface, ParsedCave } from "@shared/types";

/**
 * Cave file parsers for .lox (Therion), .3d (Survex), .plt (Compass)
 */

// ─── Core interfaces removed, now imported from @shared/types ───

// ─── LOX Parser ────────────────────────────────────────────────────────────────

export function parseLox(buffer: ArrayBuffer, onProgress?: (msg: string) => void): ParsedCave {
  const f       = new DataView(buffer)
  const bytes   = new Uint8Array(buffer)
  const l       = buffer.byteLength
  const utf8    = new TextDecoder('utf-8')

  const stationsById  = new Map<number, Vec3>()
  const stationMeta   = new Map<number, { name: string; z: number; isEntrance?: boolean; fullLabel?: string }>()
  const segments:  Segment[]     = []
  const scraps:    Scrap[]       = []
  const surfaces:  CaveSurface[] = []
  const shash: Record<string, Vec3> = {}

  // Terrain accumulator — type 5 and type 6 records share one terrain object per file
  const terrain: Partial<CaveSurface> = {}

  let pos            = 0
  let chunkDataStart = 0

  function readUint(): number      { const v = f.getUint32(pos, true);    pos += 4; return v }
  function readFloat64(): number   { const v = f.getFloat64(pos, true);   pos += 8; return v }
  function readDataPtr()           { return { position: readUint(), size: readUint() } }
  function readString(ptr: { position: number; size: number }): string {
    if (ptr.size === 0) return ''
    return utf8.decode(new Uint8Array(buffer, chunkDataStart + ptr.position, ptr.size - 1))
  }

  while (pos < l) {
    const m_type     = readUint()
    const m_totalRecSize = readUint()
    const m_recCount     = readUint()
    const m_dataSize     = readUint()

    if (m_type === 2 && onProgress) onProgress('parsing_stations');
    if (m_type === 3 && onProgress) onProgress('parsing_shots');
    if (m_type === 4 && onProgress) onProgress('generating_scraps');
    if (m_type === 5 && onProgress) onProgress('generating_surface');

    const m_recSize = m_recCount > 0 ? m_totalRecSize / m_recCount : 0
    chunkDataStart = pos + m_totalRecSize   // out-of-line area for this chunk

    for (let i = 0; i < m_recCount; i++) {
      switch (m_type) {
        case 1: readSurvey();     break
        case 2: readStation();    break
        case 3: readShot();       break
        case 4: readScrap();      break
        case 5: readSurface();    break
        case 6: readSurfaceBMP(); break
        default: 
          // Neznámy typ chunku — preskočíme ho namiesto chyby
          pos += m_recSize
          break
      }
    }
    pos += m_dataSize
  }

  if (onProgress) onProgress('finalizing');

  // Commit terrain if we collected DTM data
  if (terrain.dtm) {
    const sjtskBounds = getSjtskBoundsFromDtm(terrain.dtm);
    surfaces.push({
      dtm:            terrain.dtm!,
      bitmapData:     terrain.bitmapData ?? null,
      bitmapMimeType: terrain.bitmapMimeType ?? null,
      bitmapUrl:      null, // will be populated in main thread
      bitmapCalib:    terrain.bitmapCalib ?? null,
      centerOffset:   { x: 0, y: 0, z: 0 },
      ...(sjtskBounds ? { sjtskBbox: sjtskBounds.bbox, sjtskBboxSource: sjtskBounds.sourceCrs, sjtskAspect: sjtskBounds.aspect } : {}),
    })
  }

  const stations = Array.from(stationsById.values())
  const ids      = Array.from(stationsById.keys())

  return buildResult(segments, stations, stationMeta, scraps, surfaces, ids)

  // ── type 1 ─ Survey ──────────────────────────────────────────────────────────
  function readSurvey() {
    readUint()      // m_id
    readDataPtr()   // namePtr
    readUint()      // m_parent
    readDataPtr()   // titlePtr
  }

  // ── type 2 ─ Station ─────────────────────────────────────────────────────────
  function readStation() {
    const m_id      = readUint()
    readUint()                   // m_surveyId
    const namePtr    = readDataPtr()
    const commentPtr = readDataPtr()
    const rawName    = readString(namePtr)
    const rawComment = readString(commentPtr)
    
    const lowerText = (rawName + " " + rawComment).toLowerCase()
    const m_flags = readUint()
    // Flags v tomto modeli: 0x02 = entrance, 0x01 = surface/point?
    const isEntrance = (m_flags & 0x02) !== 0 || 
                       lowerText.includes('vchod') || 
                       lowerText.includes('vstup') || 
                       lowerText.includes('entrance') || 
                       lowerText.includes('zavrt')
    
    const x = readFloat64()
    const y = readFloat64()
    const z = readFloat64()
    const coords: Vec3 = { x, y, z }

    stationsById.set(m_id, coords)
    
    // Ak je meno len číslo a máme komentár, použi komentár ako plný label
    const isNum = /^\d+$/.test(rawName)
    const fullLabel = (isNum && rawComment) ? rawComment : rawName

    stationMeta.set(m_id, {
      name: rawName || `[${m_id}]`,
      z:    coords.z,   // original altitude before centering
      isEntrance,
      fullLabel: fullLabel || rawName
    } as any)
  }

  function readCoords(): Vec3 {
    const x = readFloat64(); const y = readFloat64(); const z = readFloat64()
    return { x, y, z }
  }

  // ── type 3 ─ Shot ────────────────────────────────────────────────────────────
  function readShot() {
    const m_from_r = readUint(); const m_to_r = readUint()
    const fl_l = readFloat64(); const fl_r = readFloat64(); const fl_u = readFloat64(); const fl_d = readFloat64()  // fromLRUD
    const tl_l = readFloat64(); const tl_r = readFloat64(); const tl_u = readFloat64(); const tl_d = readFloat64()  // toLRUD
    const m_flags = readUint()
    readUint()  // m_sectionType
    readUint()  // m_surveyId
    pos += 8    // m_threshold

    const from = stationsById.get(m_from_r)
    const to   = stationsById.get(m_to_r)
    if (!from || !to) return

    let type: Segment['type'] = 'cave'
    if      (m_flags & 0x10) type = 'splay'
    else if (m_flags & 0x01) type = 'surface'
    else if (m_flags & 0x02) type = 'duplicate'
    
    segments.push({ 
      from, 
      to, 
      type,
      fromLrud: { l: fl_l, r: fl_r, u: fl_u, d: fl_d },
      toLrud: { l: tl_l, r: tl_r, u: tl_u, d: tl_d }
    })
  }

  // ── type 4 ─ Scrap (triangulated wall mesh) ───────────────────────────────
  function readScrap() {
    readUint(); readUint()                    // m_id, m_surveyId
    const m_numPoints  = readUint()
    const pointsPtr    = readDataPtr()
    const m_num3Angles = readUint()
    const facesPtr     = readDataPtr()

    const vDV      = new DataView(buffer, chunkDataStart + pointsPtr.position)
    const vertices: Vec3[] = []
    for (let i = 0; i < m_numPoints; i++) {
      const o = i * 24
      vertices.push({ x: vDV.getFloat64(o, true), y: vDV.getFloat64(o + 8, true), z: vDV.getFloat64(o + 16, true) })
    }

    const fDV  = new DataView(buffer, chunkDataStart + facesPtr.position)
    const faces: number[][] = []
    let lastFace: number[] | undefined

    for (let i = 0; i < m_num3Angles; i++) {
      const o    = i * 12
      const face = [fDV.getUint32(o, true), fDV.getUint32(o + 4, true), fDV.getUint32(o + 8, true)]
      if (face[0] === face[1] || face[0] === face[2] || face[1] === face[2]) continue

      fixWinding: {
        if (lastFace) {
          for (let j = 0; j < 3; j++) {
            if (face[j] === lastFace[(j + 2) % 3] && face[(j + 1) % 3] === lastFace[(j + 3) % 3]) { face.reverse(); break fixWinding }
          }
          for (let j = 0; j < 3; j++) {
            if (face[j] === lastFace[j] && face[(j + 1) % 3] === lastFace[(j + 1) % 3]) { face.reverse(); break fixWinding }
          }
          for (let j = 0; j < 3; j++) {
            if (face[j] === lastFace[(j + 1) % 3] && face[(j + 1) % 3] === lastFace[(j + 2) % 3]) { face.reverse(); break fixWinding }
          }
        }
      }
      faces.push(face); lastFace = face
    }

    if (vertices.length > 0 && faces.length > 0) scraps.push({ vertices, faces })
  }

  // ── type 5 ─ Surface DTM ─────────────────────────────────────────────────
  function readSurface() {
    readUint()                   // m_id
    const m_width   = readUint()
    const m_height  = readUint()
    const surfacePtr = readDataPtr()
    const calib      = readCalibration()

    // elevation data is Float64 grid in the out-of-line area
    const ab  = buffer.slice(chunkDataStart + surfacePtr.position,
                             chunkDataStart + surfacePtr.position + surfacePtr.size)
    const dtm = new Float64Array(ab)

    terrain.dtm = { data: dtm, samples: m_width, lines: m_height, calib }
  }

  function readSurfaceBMP() {
    readUint()   // m_type (texture type)
    readUint()   // m_surfaceId
    const imagePtr = readDataPtr()
    const calib = readCalibration()
    terrain.bitmapCalib = calib

    const imgData = new Uint8Array(buffer, chunkDataStart + imagePtr.position, imagePtr.size)
    const b0 = imgData[0]; const b1 = imgData[1]
    let mimeType = ''
    if      (b0 === 0xff && b1 === 0xd8) mimeType = 'image/jpeg'
    else if (b0 === 0x89 && b1 === 0x50) mimeType = 'image/png'
    if (!mimeType) return

    // We store raw data to avoid Blob URL revocation in Worker
    terrain.bitmapData     = new Uint8Array(imgData) // Clone it so it's not tied to original buffer
    terrain.bitmapMimeType = mimeType
  }

  function readCalibration(): Calibration {
    return {
      xOrigin: readFloat64(), yOrigin: readFloat64(),
      xx: readFloat64(), xy: readFloat64(),
      yx: readFloat64(), yy: readFloat64(),
    }
  }
}

// ─── SVX .3d parser (v3–v8) ────────────────────────────────────────────────────
//
// Follows Survex's format documentation (doc/3dformat.htm for v8, doc/3dformat-old.htm for
// v3–v7). The two families share the header and the coordinate encoding, but number their items
// differently — in v3–v7 0x40–0x7f is a station and 0x80–0xbf a leg, in v8 it is the other way
// round — and patch the running label differently. Every item is read to its full length,
// cross-sections and error statistics included: skipping one by a wrong count misreads the rest
// of the file.

const SVX_FILE_ID = 'Survex 3D Image File'

export function parseSvx(buffer: ArrayBuffer, onProgress?: (msg: string) => void): ParsedCave {
  const data    = new Uint8Array(buffer)
  const dv      = new DataView(buffer)
  const decoder = new TextDecoder()

  const segments:  Segment[]  = []
  const stations:  Vec3[]     = []
  const stationMeta = new Map<number, { name: string; z: number; isEntrance?: boolean }>()
  const seen = new Set<string>()

  let pos = 0

  function need(n: number) {
    if (pos + n > data.length) throw new Error(`.3d file ends inside an item (offset ${pos})`)
  }
  function skip(n: number) { need(n); pos += n }
  function u8()  { need(1); return data[pos++] }
  function u16() { need(2); const v = dv.getUint16(pos, true); pos += 2; return v }
  function u32() { need(4); const v = dv.getUint32(pos, true); pos += 4; return v }

  function readXYZ(): Vec3 {
    need(12)
    const x = dv.getInt32(pos, true) / 100
    const y = dv.getInt32(pos + 4, true) / 100
    const z = dv.getInt32(pos + 8, true) / 100
    pos += 12
    return { x, y, z }
  }

  function readLine(): Uint8Array {
    const start = pos
    while (pos < data.length && data[pos] !== 0x0a) pos++
    if (pos >= data.length) throw new Error('.3d header is incomplete')
    return data.subarray(start, pos++)
  }

  // The running label is kept as bytes: the delete, append and trim counts are byte counts, and a
  // name with diacritics has more bytes than characters.
  let label = new Uint8Array(64)
  let labelLen = 0

  function appendLabel(n: number) {
    need(n)
    if (labelLen + n > label.length) {
      const grown = new Uint8Array(Math.max(label.length * 2, labelLen + n))
      grown.set(label.subarray(0, labelLen))
      label = grown
    }
    label.set(data.subarray(pos, pos + n), labelLen)
    labelLen += n
    pos += n
  }

  // v8: delete D bytes from the end, then append A — packed in one byte's nibbles, or escaped as a
  // byte each, where a byte of 0xff escapes further to a 32-bit count.
  function patchLabelV8() {
    let del: number, add: number
    const b = u8()
    if (b !== 0) { del = b >> 4; add = b & 0x0f }
    else {
      del = u8(); if (del === 0xff) del = u32()
      add = u8(); if (add === 0xff) add = u32()
    }
    if (del > labelLen) throw new Error(`.3d label patch deletes more than the label holds (offset ${pos})`)
    labelLen -= del
    appendLabel(add)
  }

  // v3–v7: append a length-prefixed string; 0xfe and 0xff escape to 16- and 32-bit lengths.
  function appendLabelV3() {
    let len = u8()
    if (len === 0xfe) len = 0xfe + u16()
    else if (len === 0xff) len = u32()
    appendLabel(len)
  }

  // v3–v7 0x01–0x0e: drop the last 16 bytes, then cut back to (and keep) the dot that closes the
  // Nth survey level from there.
  function trimLabelLevels(levels: number) {
    let i = labelLen - 18
    if (i < 0) throw new Error('.3d label level-trim on a too-short label')
    for (;;) {
      if (label[i] === 0x2e && --levels <= 0) break
      if (--i < 0) throw new Error('.3d label level-trim consumed the whole label')
    }
    labelLen = i + 1
  }

  // v3–v7 0x10–0x1f: drop the last N bytes.
  function trimLabelChars(n: number) {
    if (labelLen <= n) throw new Error('.3d label trim consumed the whole label')
    labelLen -= n
  }

  // ─── header
  if (decoder.decode(readLine()) !== SVX_FILE_ID) throw new Error('Not a Survex .3d file')
  const versionLine = decoder.decode(readLine())
  const version = ({ v3: 3, v4: 4, v5: 5, v6: 6, v7: 7, v8: 8 } as Record<string, number | undefined>)[versionLine]
  if (version === undefined) throw new Error('Nepodporovaná verzia .3d: ' + versionLine)
  readLine()                // title; v8 appends the coordinate system and separator after NULs
  readLine()                // datestamp
  if (version >= 8) skip(1) // file-wide flags

  if (onProgress) onProgress('parsing_model')

  let prevPos: Vec3 | null = null

  function addLeg(to: Vec3, flags: number) {
    if (prevPos) {
      const type: Segment['type'] = (flags & 0x01) ? 'surface' : (flags & 0x04) ? 'splay' : 'cave'
      segments.push({ from: prevPos, to, type })
    }
    prevPos = to
  }

  function addStation(coords: Vec3, flags: number) {
    // An anonymous station is the far end of a splay or a wall shot: it has no name to label it
    // or pick it by, and a file can hold many times more of them than named ones.
    if (flags & 0x20) return
    const name = decoder.decode(label.subarray(0, labelLen))
    if (seen.has(name)) return
    seen.add(name)
    stationMeta.set(stations.length, { name, z: coords.z, isEntrance: (flags & 0x04) !== 0 })
    stations.push(coords)
  }

  // A v8 0x00 sets the normal style the first time it is met and ends the file once it is set.
  let style = -1

  items: while (pos < data.length) {
    const opt = u8()

    if (version >= 8) {
      if (opt === 0x00 && style === 0) break items
      else if (opt <= 0x04)                 style = opt
      else if (opt === 0x0f)                prevPos = readXYZ()                 // MOVE
      else if (opt === 0x10)                { /* no date */ }
      else if (opt === 0x11)                skip(2)                             // date
      else if (opt === 0x12)                skip(3)                             // date + span
      else if (opt === 0x13)                skip(4)                             // date range
      else if (opt === 0x1f)                skip(20)                            // error info
      else if (opt >= 0x30 && opt <= 0x33)  { patchLabelV8(); skip(opt >= 0x32 ? 16 : 8) } // LRUD
      else if (opt >= 0x40 && opt <= 0x7f)  { if (!(opt & 0x20)) patchLabelV8(); addLeg(readXYZ(), opt & 0x1f) }
      else if (opt >= 0x80)                 { patchLabelV8(); addStation(readXYZ(), opt & 0x7f) }
      else throw new Error(`.3d reserved item code 0x${opt.toString(16)} (offset ${pos - 1})`)
      continue
    }

    if (opt === 0x00) {
      if (labelLen === 0) break items                                           // STOP
      labelLen = 0                                                              // clear label
    }
    else if (opt <= 0x0e)                                 trimLabelLevels(opt)
    else if (opt === 0x0f)                                prevPos = readXYZ()   // MOVE
    else if (opt <= 0x1f)                                 trimLabelChars(opt - 15)
    else if (opt === 0x20)                                skip(version < 7 ? 4 : 2)  // date
    else if (opt === 0x21)                                skip(version < 7 ? 8 : 3)  // date range
    else if (opt === 0x22 && version >= 6)                skip(20)              // error info
    else if (opt === 0x23 && version >= 7)                skip(4)               // date range
    else if (opt === 0x24 && version >= 7)                { /* no date */ }
    else if (opt >= 0x30 && opt <= 0x33 && version >= 5)  { appendLabelV3(); skip(opt >= 0x32 ? 16 : 8) } // LRUD
    else if (opt >= 0x40 && opt <= 0x7f)                  { appendLabelV3(); addStation(readXYZ(), opt & 0x3f) }
    else if (opt >= 0x80 && opt <= 0xbf)                  { appendLabelV3(); addLeg(readXYZ(), opt & 0x3f) }
    else throw new Error(`.3d reserved item code 0x${opt.toString(16)} for version ${version} (offset ${pos - 1})`)
  }

  return buildResult(segments, stations, stationMeta, [], [])
}

// ─── PLT parser (Compass) ──────────────────────────────────────────────────────

export function parsePlt(text: string, onProgress?: (msg: string) => void): ParsedCave {
  const lines    = text.split('\n')
  const segments: Segment[]  = []
  const stations: Vec3[]     = []
  const meta     = new Map<number, { name: string; z: number }>()
  let prevPos: Vec3 | null   = null; let idx = 0

  if (onProgress) onProgress('parsing_model');
  for (const rawLine of lines) {
    const line = rawLine.trim(); const cmd = line.charAt(0)
    if (cmd !== 'M' && cmd !== 'D') { prevPos = null; continue }
    const parts = line.split(/\s+/)
    if (parts.length < 4) continue
    const x = parseFloat(parts[1]); const y = parseFloat(parts[2]); const z = parseFloat(parts[3])
    if (isNaN(x) || isNaN(y) || isNaN(z)) continue
    const coords: Vec3 = { x: x * 0.3048, y: y * 0.3048, z: z * 0.3048 }
    // Extract station name from last token if present
    const name = parts.length >= 5 ? parts[parts.length - 1] : `P${idx}`
    stations.push(coords)
    meta.set(idx++, { name, z: coords.z })
    if (cmd === 'D' && prevPos) segments.push({ from: prevPos, to: coords, type: 'cave' })
    prevPos = coords
  }

  return buildResult(segments, stations, meta, [], [])
}

// ─── PLY parser (LiDAR / Mesh) ──────────────────────────────────────────────────

function readPlyScalar(dv: DataView, offset: number, type: string): number {
  switch (type.toLowerCase()) {
    case 'char':
    case 'int8':
      return dv.getInt8(offset);
    case 'uchar':
    case 'uint8':
      return dv.getUint8(offset);
    case 'short':
    case 'int16':
      return dv.getInt16(offset, true);
    case 'ushort':
    case 'uint16':
      return dv.getUint16(offset, true);
    case 'int':
    case 'int32':
      return dv.getInt32(offset, true);
    case 'uint':
    case 'uint32':
      return dv.getUint32(offset, true);
    case 'double':
    case 'float64':
      return dv.getFloat64(offset, true);
    case 'float':
    case 'float32':
    default:
      return dv.getFloat32(offset, true);
  }
}

function normalizePlyColor(value: number, type: string): number {
  switch (type.toLowerCase()) {
    case 'uchar':
    case 'uint8':
      return value / 255;
    case 'char':
    case 'int8':
      return Math.max(0, value) / 127;
    case 'ushort':
    case 'uint16':
      return value / 65535;
    case 'short':
    case 'int16':
      return Math.max(0, value) / 32767;
    case 'uint':
    case 'uint32':
      return value / 4294967295;
    case 'int':
    case 'int32':
      return Math.max(0, value) / 2147483647;
    case 'double':
    case 'float64':
    case 'float':
    case 'float32':
    default:
      return value > 1 ? value / 255 : value;
  }
}

function normalizePlyIntensity(value: number, type: string): number {
  switch (type.toLowerCase()) {
    case 'uchar':
    case 'uint8':
      return value / 255;
    case 'ushort':
    case 'uint16':
      return value / 65535;
    default:
      return value;
  }
}

export function parsePly(buffer: ArrayBuffer, onProgress?: (msg: string) => void): ParsedCave {
  // Read header more robustly (can be > 1024 bytes)
  const bytes = new Uint8Array(buffer);
  let headerEnd = -1;
  const decoder = new TextDecoder();
  
  // Find "end_header"
  const searchStr = 'end_header';
  for (let i = 0; i < Math.min(bytes.length, 16384); i++) {
    if (bytes[i] === 101 && bytes[i+1] === 110 && bytes[i+2] === 100) { // "end"
      const chunk = decoder.decode(bytes.subarray(i, i + 20));
      if (chunk.startsWith('end_header')) {
        headerEnd = i + chunk.indexOf('\n') + 1;
        if (chunk.includes('\r\n')) headerEnd = i + chunk.indexOf('\n') + 1;
        break;
      }
    }
  }

  if (headerEnd === -1) throw new Error('Invalid PLY: Missing end_header');
  
  const headerText = decoder.decode(bytes.subarray(0, headerEnd));
  const headerLines = headerText.split(/\r?\n/);
  
  let vertexCount = 0;
  let faceCount = 0;
  let format = '';
  
  const properties: { name: string, type: string, size: number, offset: number }[] = [];
  let currentElement = '';
  let currentStride = 0;
  
  const typeSizes: Record<string, number> = {
    'char': 1, 'uchar': 1, 'short': 2, 'ushort': 2, 'int': 4, 'uint': 4, 'float': 4, 'double': 8,
    'int8': 1, 'uint8': 1, 'int16': 2, 'uint16': 2, 'int32': 4, 'uint32': 4, 'float32': 4, 'float64': 8
  };

  for (const line of headerLines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'format') format = parts[1];
    if (parts[0] === 'element') {
      currentElement = parts[1];
      if (parts[1] === 'vertex') vertexCount = parseInt(parts[2]);
      if (parts[1] === 'face') faceCount = parseInt(parts[2]);
    }
    if (parts[0] === 'property' && currentElement === 'vertex') {
      const type = parts[1].toLowerCase();
      const name = parts[2];
      const size = typeSizes[type] || 4;
      properties.push({ name, type, size, offset: currentStride });
      currentStride += size;
    }
  }

  if (format !== 'binary_little_endian') {
    throw new Error('Support for ASCII or Big Endian PLY not implemented yet.');
  }

  if (onProgress) onProgress(vertexCount > 500000 ? 'loading_large_lidar' : 'parsing_model');

  const vertexStride = currentStride;
  const dv = new DataView(buffer, headerEnd);
  
  // Allocate optimized typed arrays
  const points = new Float32Array(vertexCount * 3);
  const pointColors = new Float32Array(vertexCount * 3);
  const pointNormals = new Float32Array(vertexCount * 3);
  const pointIntensity = new Float32Array(vertexCount);
  const pointClassification = new Uint8Array(vertexCount);
  
  // Property indices for fast access
  const propName = (name: string) => name.toLowerCase();
  const propIdx = {
    x: properties.find(p => propName(p.name) === 'x'),
    y: properties.find(p => propName(p.name) === 'y'),
    z: properties.find(p => propName(p.name) === 'z'),
    r: properties.find(p => ['red', 'r', 'diffuse_red'].includes(propName(p.name))),
    g: properties.find(p => ['green', 'g', 'diffuse_green'].includes(propName(p.name))),
    b: properties.find(p => ['blue', 'b', 'diffuse_blue'].includes(propName(p.name))),
    nx: properties.find(p => ['nx', 'normal_x', 'n_x'].includes(propName(p.name))),
    ny: properties.find(p => ['ny', 'normal_y', 'n_y'].includes(propName(p.name))),
    nz: properties.find(p => ['nz', 'normal_z', 'n_z'].includes(propName(p.name))),
    intensity: properties.find(p => ['intensity', 'i', 'scalar_intensity', 'value'].includes(propName(p.name))),
    class: properties.find(p => ['classification', 'class', 'scalar_classification'].includes(propName(p.name)))
  };

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  // Faster parsing loop
  for (let i = 0; i < vertexCount; i++) {
    const vOffset = i * vertexStride;
    
    // Position (mandatory)
    let x = 0, y = 0, z = 0;
    if (propIdx.x) x = readPlyScalar(dv, vOffset + propIdx.x.offset, propIdx.x.type);
    if (propIdx.y) y = readPlyScalar(dv, vOffset + propIdx.y.offset, propIdx.y.type);
    if (propIdx.z) z = readPlyScalar(dv, vOffset + propIdx.z.offset, propIdx.z.type);
    
    points[i*3] = x; points[i*3+1] = y; points[i*3+2] = z;
    
    // Bounds
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

    // Color (optional)
    if (propIdx.r && propIdx.g && propIdx.b) {
      pointColors[i*3]   = normalizePlyColor(readPlyScalar(dv, vOffset + propIdx.r.offset, propIdx.r.type), propIdx.r.type);
      pointColors[i*3+1] = normalizePlyColor(readPlyScalar(dv, vOffset + propIdx.g.offset, propIdx.g.type), propIdx.g.type);
      pointColors[i*3+2] = normalizePlyColor(readPlyScalar(dv, vOffset + propIdx.b.offset, propIdx.b.type), propIdx.b.type);
    } else {
      pointColors[i*3] = 1; pointColors[i*3+1] = 1; pointColors[i*3+2] = 1;
    }

    // Normals (optional)
    if (propIdx.nx && propIdx.ny && propIdx.nz) {
      pointNormals[i*3]   = readPlyScalar(dv, vOffset + propIdx.nx.offset, propIdx.nx.type);
      pointNormals[i*3+1] = readPlyScalar(dv, vOffset + propIdx.ny.offset, propIdx.ny.type);
      pointNormals[i*3+2] = readPlyScalar(dv, vOffset + propIdx.nz.offset, propIdx.nz.type);
    }

    // Intensity (optional)
    if (propIdx.intensity) {
      pointIntensity[i] = normalizePlyIntensity(readPlyScalar(dv, vOffset + propIdx.intensity.offset, propIdx.intensity.type), propIdx.intensity.type);
    }

    // Classification (optional)
    if (propIdx.class) {
      pointClassification[i] = Math.max(0, Math.min(255, Math.round(readPlyScalar(dv, vOffset + propIdx.class.offset, propIdx.class.type))));
    }
  }

  // ── Voxelová decimácia (rovnomerná, celý model) ───────────────────────────
  // OPRAVA: Predtým sa zastavilo pri MAX_POINTS → zachoval sa len začiatok súboru.
  // Teraz: VŠETKY body prechádzajú voxelovou mriežkou; voxelový krok zabezpečí
  // rovnomernú hustotu po celom modeli.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  const MAX_POINTS = 1_000_000;
  const rangeMax = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

  const dX = maxX - minX, dY = maxY - minY, dZ = maxZ - minZ;
  const approxSurface = 2 * (dX*dY + dX*dZ + dY*dZ) || rangeMax * rangeMax;
  const surfaceVoxel = Math.sqrt(approxSurface / MAX_POINTS);
  const voxelStep = vertexCount > MAX_POINTS
    ? Math.max(0.005, surfaceVoxel)
    : 0.002;

  const invVoxel = 1.0 / voxelStep;
  const voxelMap = new Map<bigint, number>();

  const outPoints = new Float32Array(Math.min(vertexCount, MAX_POINTS) * 3);
  const hasColors = !!(propIdx.r && propIdx.g && propIdx.b);
  const outColors    = hasColors     ? new Float32Array(outPoints.length)               : new Float32Array(0);
  const hasNativeNormals = !!(propIdx.nx && propIdx.ny && propIdx.nz);
  const outNormals   = hasNativeNormals ? new Float32Array(outPoints.length)             : new Float32Array(0);
  const hasNativeCls = propIdx.class !== undefined;
  const outCls       = hasNativeCls  ? new Uint8Array(Math.min(vertexCount, MAX_POINTS)) : new Uint8Array(0);
  const hasIntensity = propIdx.intensity !== undefined;
  const outIntensity = hasIntensity  ? new Float32Array(Math.min(vertexCount, MAX_POINTS)) : new Float32Array(0);
  const outKeys = new Array<bigint>(Math.min(vertexCount, MAX_POINTS));

  let outCount = 0;
  let uniqueVoxelCount = 0;
  const hashVoxelKey = (key: bigint) => Number((key ^ (key >> 21n) ^ (key >> 42n)) & 0xffffffffn);

  for (let i = 0; i < vertexCount; i++) {
    const x = points[i*3];
    const y = points[i*3+1];
    const z = points[i*3+2];

    const ix = Math.floor((x - minX) * invVoxel);
    const iy = Math.floor((y - minY) * invVoxel);
    const iz = Math.floor((z - minZ) * invVoxel);

    const key = BigInt(ix & 0x3FFF) | (BigInt(iy & 0x3FFF) << 14n) | (BigInt(iz & 0x3FFF) << 28n);
    if (voxelMap.has(key)) continue;
    uniqueVoxelCount++;

    let targetIndex = outCount;
    if (outCount < MAX_POINTS) {
      outCount++;
    } else {
      const selectionHash = hashVoxelKey(key ^ BigInt(uniqueVoxelCount));
      const replaceProbability = MAX_POINTS / uniqueVoxelCount;
      if (selectionHash / 0xffffffff > replaceProbability) continue;
      targetIndex = hashVoxelKey(key + 0x9e3779b97f4a7c15n) % MAX_POINTS;
      const replacedKey = outKeys[targetIndex];
      if (replacedKey !== undefined) voxelMap.delete(replacedKey);
    }

    voxelMap.set(key, targetIndex);
    outKeys[targetIndex] = key;

    const o3 = targetIndex * 3;
    outPoints[o3]   = x - cx;
    outPoints[o3+1] = y - cy;
    outPoints[o3+2] = z - cz;

    if (hasColors) {
      outColors[o3]   = pointColors[i*3];
      outColors[o3+1] = pointColors[i*3+1];
      outColors[o3+2] = pointColors[i*3+2];
    }
    if (hasNativeNormals) {
      outNormals[o3]   = pointNormals[i*3];
      outNormals[o3+1] = pointNormals[i*3+1];
      outNormals[o3+2] = pointNormals[i*3+2];
    }
    if (hasNativeCls) outCls[targetIndex] = pointClassification[i];
    if (hasIntensity) outIntensity[targetIndex] = pointIntensity[i];
  }

  if (onProgress) onProgress('finalizing');

  const finalPoints  = outPoints.subarray(0, outCount * 3);
  const finalColors  = hasColors ? outColors.subarray(0, outCount * 3) : null;
  const finalNormals = hasNativeNormals ? outNormals.subarray(0, outCount * 3) : null;
  const finalCls     = hasNativeCls ? outCls.subarray(0, outCount) : null;
  const finalInt     = hasIntensity ? outIntensity.subarray(0, outCount) : null;

  return {
    segments: [],
    stations: [],
    stationLabels: [],
    scraps: [],
    surfaces: [],
    bounds: {
      min:    { x: minX - cx, y: minY - cy, z: minZ - cz },
      max:    { x: maxX - cx, y: maxY - cy, z: maxZ - cz },
      center: { x: 0, y: 0, z: 0 },
      size:   { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    },
    centerOffset: { x: cx, y: cy, z: cz },
    stationCount: 0,
    segmentCount: 0,
    scrapCount: 0,
    pointCount: outCount,
    hasSurface: false,
    isLiDAR: true,
    points:               new Float32Array(finalPoints),
    pointColors:          finalColors  ? new Float32Array(finalColors)  : new Float32Array(outCount * 3),
    hasPointColors:       hasColors,
    hasUsablePointColors: hasColors && hasUsefulPointColors(finalColors || undefined, outCount),
    pointNormals:         finalNormals ? new Float32Array(finalNormals) : new Float32Array(0),
    hasPointNormals:      hasNativeNormals,
    pointIntensity:       finalInt     ? new Float32Array(finalInt)     : new Float32Array(0),
    pointClassification:  finalCls     ? new Uint8Array(finalCls)       : new Uint8Array(0),
  };
}

/**
 * Heuristic classification of LiDAR points.
 * Distinguishes between Ground, Vegetation, and Cave Passages.
 */
export function classifyLiDAR(cave: ParsedCave) {
  if (!cave.points || !cave.pointNormals) return;
  const count = cave.pointCount;
  const classes = new Uint8Array(count);
  const points = cave.points;
  const normals = cave.pointNormals;

  // Calculate local stats if needed (simplified for performance)
  let avgZ = 0;
  for (let i = 0; i < count; i++) avgZ += points[i*3+2];
  avgZ /= count;

  for (let i = 0; i < count; i++) {
    const pIdx = i * 3;
    const nz = normals[pIdx + 2];
    const z = points[pIdx + 2];

    // 1. GROUND (Horizontal normals, relatively flat)
    if (nz > 0.85) {
      classes[i] = 2; // Ground
    } 
    // 2. VEGETATION (Random normals, usually high up)
    else if (z > avgZ + 2 && Math.abs(nz) < 0.7) {
      classes[i] = 4; // Vegetation
    }
    // 3. CAVE (Deep points, mostly vertical walls)
    else if (z < avgZ - 5) {
      classes[i] = 10; // Custom: Cave
    }
    // 4. UNCLASSIFIED
    else {
      classes[i] = 1; 
    }
  }
  cave.pointClassification = classes;
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function buildResult(
  segments:    Segment[],
  stations:    Vec3[],
  stationMeta: Map<number, { name: string; z: number; isEntrance?: boolean; fullLabel?: string }>,
  scraps:      Scrap[],
  surfaces:    CaveSurface[],
  stationIds?: number[]
): ParsedCave {
  if (stations.length === 0 && segments.length > 0) {
    segments.forEach(s => { stations.push(s.from, s.to) })
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  const pts = segments.length > 0 ? segments.flatMap(s => [s.from, s.to]) : stations
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
  }
  for (const sc of scraps) for (const v of sc.vertices) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z
  }

  const cx = (isFinite(minX) && isFinite(maxX)) ? (minX + maxX) / 2 : 0
  const cy = (isFinite(minY) && isFinite(maxY)) ? (minY + maxY) / 2 : 0
  const cz = (isFinite(minZ) && isFinite(maxZ)) ? (minZ + maxZ) / 2 : 0

  const centered = segments.map(s => ({
    type: s.type,
    from: { x: s.from.x - cx, y: s.from.y - cy, z: s.from.z - cz },
    to:   { x: s.to.x   - cx, y: s.to.y   - cy, z: s.to.z   - cz },
    fromLrud: s.fromLrud,
    toLrud: s.toLrud,
  }))

  const centeredStations = stations.map(s => ({ x: s.x - cx, y: s.y - cy, z: s.z - cz }))
  const isLiDAR = stationMeta.size === 0 && stations.length > 5000

  // Build station labels — use original z for altitude
  const stationLabels: StationLabel[] = isLiDAR ? [] : centeredStations.map((pos, i) => {

    const lookupId = stationIds ? stationIds[i] : i
    const meta = stationMeta.get(lookupId)
    let n = meta?.name ?? `S${i}`
    if (!/[a-zA-Z0-9]/.test(n)) n = ''

    const origX = pos.x + cx;
    const origY = pos.y + cy;
    let gps = null;
    try {
      gps = tryUtmToWgs84(origX, origY) || tryJtskToWgs84(origX, origY) || null;
    } catch (e) {
      console.warn("GPS calculation failed for station", n, e);
    }

    return {

      pos,
      name:     n,
      altitude: meta?.z        ?? (pos.z + cz),   // original altitude in metres
      isEntrance: meta?.isEntrance,
      fullLabel:  meta?.fullLabel
    ,
      gps
    }
  })

  const centeredScraps = scraps.map(sc => ({
    faces: sc.faces,
    vertices: sc.vertices.map((v: Vec3) => ({ x: v.x - cx, y: v.y - cy, z: v.z - cz })),
  }))

  const centerOffset: Vec3 = { x: cx, y: cy, z: cz }
  const centeredSurfaces = surfaces.map(s => ({ ...s, centerOffset }))

  // Convert stations to Float32Array points for rendering
  const pointCount = centeredStations.length
  const pointsTyped = new Float32Array(pointCount * 3)
  for (let i = 0; i < pointCount; i++) {
    pointsTyped[i*3] = centeredStations[i].x
    pointsTyped[i*3+1] = centeredStations[i].y
    pointsTyped[i*3+2] = centeredStations[i].z
  }

  return {
    segments:      centered,
    stations:      centeredStations,
    stationLabels,
    scraps:        centeredScraps,
    surfaces:      centeredSurfaces,
    bounds: {
      min:    { x: minX - cx, y: minY - cy, z: minZ - cz },
      max:    { x: maxX - cx, y: maxY - cy, z: maxZ - cz },
      center: { x: 0, y: 0, z: 0 },
      size:   { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    },
    centerOffset,
    stationCount:  stations.length,
    segmentCount:  segments.length,
    scrapCount:    scraps.length,
    pointCount:    pointCount,
    hasSurface:    surfaces.length > 0,
    isLiDAR:       isLiDAR,
    points:        pointsTyped
  }
}
