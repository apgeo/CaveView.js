import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POINT_CLOUD_SHAPE,
  POINT_CLOUD_SHAPE_OPTIONS,
  getPointCloudShapeUniform,
} from '../pointCloudShape';

describe('point cloud shape options', () => {
  it('maps each sidebar shape to the shader uniform expected by PointCloudLOD', () => {
    expect(POINT_CLOUD_SHAPE_OPTIONS.map(option => option.id)).toEqual([
      'square',
      'sphere',
      'diamond',
      'hex',
      'surfel',
    ]);

    expect(getPointCloudShapeUniform('square')).toBe(0);
    expect(getPointCloudShapeUniform('sphere')).toBe(1);
    expect(getPointCloudShapeUniform('diamond')).toBe(2);
    expect(getPointCloudShapeUniform('hex')).toBe(3);
    expect(getPointCloudShapeUniform('surfel')).toBe(4);
  });

  it('keeps the current rounded diamond experiment as the default shape', () => {
    expect(DEFAULT_POINT_CLOUD_SHAPE).toBe('diamond');
    expect(getPointCloudShapeUniform(undefined)).toBe(2);
  });
});
