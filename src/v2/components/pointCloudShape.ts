import type { PointCloudShape } from '@shared/types';

export const DEFAULT_POINT_CLOUD_SHAPE: PointCloudShape = 'diamond';

type PointCloudShapeOption = {
  id: PointCloudShape;
};

export const POINT_CLOUD_SHAPE_OPTIONS: readonly PointCloudShapeOption[] = [
  { id: 'square' },
  { id: 'sphere' },
  { id: 'diamond' },
  { id: 'hex' },
  { id: 'surfel' },
] as const;

export function getPointCloudShapeUniform(shape?: PointCloudShape): number {
  switch (shape ?? DEFAULT_POINT_CLOUD_SHAPE) {
    case 'square':
      return 0;
    case 'sphere':
      return 1;
    case 'diamond':
      return 2;
    case 'hex':
      return 3;
    case 'surfel':
      return 4;
    default:
      return 2;
  }
}
