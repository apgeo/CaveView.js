import { parseLox, parsePly, parseSvx, parsePlt } from './caveParser';
import { parseStl } from './stlParser';

self.onmessage = async (e: MessageEvent) => {
  const { buffer, ext } = e.data;
  if (!buffer) return;

  try {
    let cave;
    const progress = (msg: string) => {
      self.postMessage({ type: 'progress', message: msg });
    };

    if (ext === '.ply') {
      cave = parsePly(buffer, progress);
    } else if (ext === '.stl') {
      cave = parseStl(buffer);
    } else if (ext === '.lox') {
      cave = parseLox(buffer, progress);
    } else if (ext === '.plt') {
      const text = new TextDecoder().decode(buffer);
      cave = parsePlt(text, progress);
    } else {
      // Default k SVX pre neznáme prípony
      cave = parseSvx(buffer, progress);
    }

    // Všetky body sa posielajú bez filtrácie.
    // Filtrovanie podľa klasifikácie robí OrganicShell v CaveViewer3D.tsx.

    // Vrátime výsledok hlavnému vláknu
    // Ak je to veľký point cloud, môžeme preniesť typed arrays (transferables) pre výkon
    const transferables: Transferable[] = [];
    if (cave.points?.buffer) transferables.push(cave.points.buffer);
    if (cave.pointColors?.buffer) transferables.push(cave.pointColors.buffer);
    if (cave.pointNormals?.buffer) transferables.push(cave.pointNormals.buffer);
    if (cave.pointIntensity?.buffer) transferables.push(cave.pointIntensity.buffer);
    if (cave.pointClassification?.buffer) transferables.push(cave.pointClassification.buffer);
    if (cave.surfaces && Array.isArray(cave.surfaces)) {
      for (const surf of cave.surfaces) {
        if (surf.dtm?.data?.buffer) transferables.push(surf.dtm.data.buffer);
        if (surf.bitmapData?.buffer) transferables.push(surf.bitmapData.buffer);
      }
    }

    self.postMessage({ type: 'done', cave }, transferables as any);
  } catch (err: any) {
    console.error('Worker error:', err);
    self.postMessage({ type: 'error', error: err.message || 'Unknown parsing error' });
  }
};
