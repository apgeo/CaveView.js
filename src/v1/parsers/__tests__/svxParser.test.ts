import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSvx } from '../caveParser';

/** Builds a .3d file byte by byte, so each test names exactly the items it is about. */
class Svx3d {
  private bytes: number[] = [];

  constructor(version: 'v7' | 'v8') {
    const title = version === 'v8' ? 'test\0+proj=utm +zone=34 +datum=WGS84\0.' : 'test';
    this.text(`Survex 3D Image File\n${version}\n${title}\n@0\n`);
    if (version === 'v8') this.byte(0x00); // file-wide flags
  }

  byte(...values: number[]) { this.bytes.push(...values); return this; }
  text(s: string) { this.bytes.push(...new TextEncoder().encode(s)); return this; }
  int32(...values: number[]) {
    for (const v of values) {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setInt32(0, v, true);
      this.bytes.push(...b);
    }
    return this;
  }
  /** A coordinate triple in metres. */
  xyz(x: number, y: number, z: number) { return this.int32(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)); }

  /**
   * v8 label patch in the packed form: delete `del`, append `add`, both under 16. A patch that
   * changes nothing cannot be packed — its byte would be 0, which announces the escaped form.
   */
  v8Patch(del: number, add: string) {
    if (del === 0 && add.length === 0) return this.v8PatchLong(0, '');
    return this.byte((del << 4) | add.length).text(add);
  }
  /** v8 label patch in the escaped form, for counts that do not fit a nibble. */
  v8PatchLong(del: number, add: string) { return this.byte(0x00, del, add.length).text(add); }
  /** v3–v7 length-prefixed label. */
  v3Label(add: string) { return this.byte(add.length).text(add); }

  build() { return new Uint8Array(this.bytes).buffer; }
}

describe('parseSvx', () => {
  describe('v8', () => {
    it('reads past error info, cross-sections and dates by their full length', () => {
      const file = new Svx3d('v8')
        .byte(0x00)                                     // style: normal
        .byte(0x11).byte(0x10, 0x2c)                    // single date
        .byte(0x12).byte(0x10, 0x2c, 0x03)              // date + span
        .byte(0x13).byte(0x10, 0x2c, 0x20, 0x2c)        // date range
        .byte(0x0f).xyz(0, 0, 0)                        // MOVE
        .byte(0x40).v8Patch(0, 'a').xyz(10, 0, 0)       // leg, survey label "a"
        .byte(0x1f).int32(1, 1000, 0, 0, 0)             // error info: 20 bytes
        .byte(0x30).v8Patch(0, '.1').byte(0, 1, 0, 1, 0, 1, 0, 1)                // LRUD, 16-bit
        .byte(0x33).v8Patch(1, '2').int32(100, 100, 100, 100)                    // LRUD, 32-bit, ends passage
        .byte(0x80 | 0x02 | 0x04).v8Patch(1, '1').xyz(0, 0, 0)                   // station a.1, entrance
        .byte(0x80 | 0x02).v8Patch(1, '2').xyz(10, 0, 0)                         // station a.2
        .byte(0x00)                                     // stop
        .build();

      const cave = parseSvx(file);

      expect(cave.segmentCount).toBe(1);
      expect(cave.stationLabels.map((s) => s.name)).toEqual(['a.1', 'a.2']);
      expect(cave.stationLabels.map((s) => s.isEntrance)).toEqual([true, false]);
    });

    it('reads the label of an anonymous station, and does not list the station', () => {
      // Flag 0x20 on a station means "anonymous", not "no label follows" as it does on a leg.
      const file = new Svx3d('v8')
        .byte(0x00)
        .byte(0x0f).xyz(0, 0, 0)
        .byte(0x40 | 0x04).v8Patch(0, 's').xyz(1, 1, 0)        // splay
        .byte(0x80 | 0x20).v8Patch(0, '').xyz(1, 1, 0)         // anonymous station: label still present
        .byte(0x80).v8Patch(0, '.1').xyz(0, 0, 0)              // named station after it
        .byte(0x00)
        .build();

      const cave = parseSvx(file);

      expect(cave.segments.map((s) => s.type)).toEqual(['splay']);
      expect(cave.stationLabels.map((s) => s.name)).toEqual(['s.1']);
    });

    it('keeps the label across a style item, and patches it in the escaped form', () => {
      const long = 'a_rather_long_survey_name';
      const file = new Svx3d('v8')
        .byte(0x00)
        .byte(0x80).v8PatchLong(0, `${long}.1`).xyz(0, 0, 0)
        .byte(0x01)                                             // style: diving — the label stays
        .byte(0x80).v8Patch(1, '2').xyz(1, 0, 0)
        .byte(0x00)                                             // back to normal…
        .byte(0x00)                                             // …and stop
        .build();

      expect(parseSvx(file).stationLabels.map((s) => s.name)).toEqual([`${long}.1`, `${long}.2`]);
    });

    it('draws a leg that keeps its label (0x20) from the previous position', () => {
      const file = new Svx3d('v8')
        .byte(0x00)
        .byte(0x0f).xyz(0, 0, 100)
        .byte(0x40).v8Patch(0, 'a').xyz(0, 0, 90)
        .byte(0x40 | 0x20).xyz(0, 0, 80)
        .byte(0x40 | 0x20 | 0x01).xyz(0, 0, 70)                 // surface leg
        .byte(0x00)
        .build();

      const cave = parseSvx(file);

      expect(cave.segments.map((s) => s.type)).toEqual(['cave', 'cave', 'surface']);
      expect(cave.bounds.size.z).toBeCloseTo(30);
    });
  });

  describe('v7', () => {
    it('reads 0x40–0x7f as stations and 0x80–0xbf as legs, the reverse of v8', () => {
      const file = new Svx3d('v7')
        .byte(0x0f).xyz(0, 0, 0)
        .byte(0x40 | 0x04).v3Label('a.1').xyz(0, 0, 0)          // station a.1, entrance
        .byte(0x80).v3Label('').xyz(5, 0, 0)                    // leg, label unchanged
        .byte(0x10).byte(0x40).v3Label('2').xyz(5, 0, 0)        // trim one byte, station a.2
        .byte(0x20).byte(0x10, 0x2c)                            // date: 2 bytes in v7
        .byte(0x21).byte(0x10, 0x2c, 0x02)                      // date + span
        .byte(0x22).int32(1, 500, 0, 0, 0)                      // error info
        .byte(0x23).byte(0x10, 0x2c, 0x20, 0x2c)                // date range
        .byte(0x24)                                             // no date
        .byte(0x31).v3Label('').byte(0, 1, 0, 1, 0, 1, 0, 1)    // LRUD, ends passage
        .byte(0x00)                                             // clear the label
        .byte(0x00)                                             // stop
        .build();

      const cave = parseSvx(file);

      expect(cave.segmentCount).toBe(1);
      expect(cave.stationLabels.map((s) => s.name)).toEqual(['a.1', 'a.2']);
      expect(cave.stationLabels.map((s) => s.isEntrance)).toEqual([true, false]);
    });
  });

  it('says where a truncated file ends instead of failing on an out-of-range read', () => {
    const file = new Svx3d('v8').byte(0x00).byte(0x0f).int32(0, 0).build();
    expect(() => parseSvx(file)).toThrow(/ends inside an item/);
  });

  it('reads the repository sample', () => {
    const bytes = readFileSync(resolve(__dirname, '../../../../test_model/model2.3d'));
    const cave = parseSvx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(cave.segmentCount).toBeGreaterThan(0);
    expect(cave.stationCount).toBeGreaterThan(0);
  });
});
