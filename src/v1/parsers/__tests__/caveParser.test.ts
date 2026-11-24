import { describe, it, expect } from 'vitest';
import { parsePlt, parsePly } from '../caveParser';

function makeBinaryPly(header: string, bodyLength: number, writeBody: (dv: DataView) => void) {
  const headerBytes = new TextEncoder().encode(header);
  const buffer = new ArrayBuffer(headerBytes.byteLength + bodyLength);
  new Uint8Array(buffer).set(headerBytes);
  writeBody(new DataView(buffer, headerBytes.byteLength));
  return buffer;
}

describe('caveParser', () => {
  describe('parsePlt', () => {
    it('should parse simple PLT data correctly', () => {
      const pltData = `
M 0 0 0
D 10 0 0 Station1
D 10 10 5 Station2
`;
      const result = parsePlt(pltData);

      expect(result.stationCount).toBe(3);
      expect(result.segmentCount).toBe(2);
      
      // Feet to Meters conversion check (0.3048)
      // 10 feet = 3.048 meters
      expect(result.bounds.size.x).toBeCloseTo(3.048);
      expect(result.bounds.size.y).toBeCloseTo(3.048);
      expect(result.bounds.size.z).toBeCloseTo(1.524); // 5 * 0.3048
    });

    it('should handle invalid lines gracefully', () => {
      const pltData = `
INVALID LINE
M 0 0 0
D 10 0 0
X 10 10 10
D 10 10 10
`;
      const result = parsePlt(pltData);
      expect(result.stationCount).toBe(3);
      expect(result.segmentCount).toBe(1); // M -> D works, then X breaks, then D fails because prevPos is null
    });
  });

  describe('parsePly', () => {
    it('parses typed binary coordinates, colors, intensity, and classification', () => {
      const header = [
        'ply',
        'format binary_little_endian 1.0',
        'element vertex 2',
        'property double x',
        'property double y',
        'property double z',
        'property ushort red',
        'property uchar green',
        'property float blue',
        'property ushort intensity',
        'property uchar classification',
        'end_header',
        ''
      ].join('\n');

      const stride = 34;
      const buffer = makeBinaryPly(header, stride * 2, dv => {
        const writeVertex = (base: number, x: number, y: number, z: number, red: number, green: number, blue: number, intensity: number, cls: number) => {
          dv.setFloat64(base, x, true);
          dv.setFloat64(base + 8, y, true);
          dv.setFloat64(base + 16, z, true);
          dv.setUint16(base + 24, red, true);
          dv.setUint8(base + 26, green);
          dv.setFloat32(base + 27, blue, true);
          dv.setUint16(base + 31, intensity, true);
          dv.setUint8(base + 33, cls);
        };

        writeVertex(0, 10, 20, 30, 32768, 128, 0.5, 65535, 10);
        writeVertex(stride, 14, 26, 36, 65535, 64, 1.0, 32768, 2);
      });

      const result = parsePly(buffer);

      expect(result.pointCount).toBe(2);
      expect(result.points![0]).toBeCloseTo(-2);
      expect(result.points![1]).toBeCloseTo(-3);
      expect(result.points![2]).toBeCloseTo(-3);
      expect(result.points![3]).toBeCloseTo(2);
      expect(result.points![4]).toBeCloseTo(3);
      expect(result.points![5]).toBeCloseTo(3);
      expect(result.pointColors![0]).toBeCloseTo(32768 / 65535);
      expect(result.pointColors![1]).toBeCloseTo(128 / 255);
      expect(result.pointColors![2]).toBeCloseTo(0.5);
      expect(result.hasPointColors).toBe(true);
      expect(result.hasPointNormals).toBe(false);
      expect(result.pointIntensity![0]).toBeCloseTo(1);
      expect(result.pointIntensity![1]).toBeCloseTo(32768 / 65535);
      expect(result.pointClassification![0]).toBe(10);
      expect(result.pointClassification![1]).toBe(2);
    });

    it('preserves PLY normals for edited LiDAR direct rendering', () => {
      const header = [
        'ply',
        'format binary_little_endian 1.0',
        'element vertex 1',
        'property float x',
        'property float y',
        'property float z',
        'property float nx',
        'property float ny',
        'property float nz',
        'end_header',
        ''
      ].join('\n');

      const buffer = makeBinaryPly(header, 24, dv => {
        dv.setFloat32(0, 10, true);
        dv.setFloat32(4, 20, true);
        dv.setFloat32(8, 30, true);
        dv.setFloat32(12, 0.25, true);
        dv.setFloat32(16, -0.5, true);
        dv.setFloat32(20, 0.75, true);
      });

      const result = parsePly(buffer);

      expect(result.pointNormals).toHaveLength(3);
      expect(result.pointNormals![0]).toBeCloseTo(0.25);
      expect(result.pointNormals![1]).toBeCloseTo(-0.5);
      expect(result.pointNormals![2]).toBeCloseTo(0.75);
      expect(result.hasPointColors).toBe(false);
      expect(result.hasPointNormals).toBe(true);
    });

    it('parses LOX datasets and extracts splay segments correctly', async () => {
      const fs = await import('fs');
      const { parseLox } = await import('../caveParser');
      if (fs.existsSync('public/zlomiskovo.lox')) {
        const buf = fs.readFileSync('public/zlomiskovo.lox');
        const cave = parseLox(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        expect(cave.segments.length).toBeGreaterThan(0);
        const splaySegs = cave.segments.filter((s: any) => s.type === 'splay');
        expect(splaySegs.length).toBe(457);
      }
    });
  });
});
