import { describe, it, expect, beforeEach } from 'vitest';
import { createSplayGeometryCache, getSplayCacheKey, getCachedSplayGeometry, setCachedSplayGeometry, clearSplayCache } from '../splayCache';

describe('splayCache session caching', () => {
  beforeEach(() => {
    clearSplayCache();
  });

  it('generates consistent cache keys based on parameters', () => {
    const key1 = getSplayCacheKey('cave_zlomiskovo', 250, 0.22, 0.06, 0.10, 0.0);
    const key2 = getSplayCacheKey('cave_zlomiskovo', 250, 0.22, 0.06, 0.10, 0.0);
    const keyDiff = getSplayCacheKey('cave_zlomiskovo', 250, 0.30, 0.06, 0.10, 0.0);

    expect(key1).toBe(key2);
    expect(key1).not.toBe(keyDiff);
  });

  it('evicts the least recently used geometry to stay within its byte limit', () => {
    const cache = createSplayGeometryCache(24);
    const geometry = (offset: number) => ({
      positions: new Float32Array([offset]),
      normals: new Float32Array([0]),
      indices: new Uint32Array([0]),
      vertexCount: 1,
      triangleCount: 0,
    });

    cache.set('first', geometry(1));
    cache.set('second', geometry(2));
    expect(cache.get('first')).toBeDefined();
    cache.set('third', geometry(3));

    expect(cache.get('first')).toBeDefined();
    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('third')).toBeDefined();
  });

  it('does not cache an individual geometry larger than the byte limit', () => {
    const cache = createSplayGeometryCache(16);
    cache.set('large', {
      positions: new Float32Array(5),
      normals: new Float32Array(),
      indices: new Uint32Array(),
      vertexCount: 5,
      triangleCount: 0,
    });

    expect(cache.get('large')).toBeUndefined();
  });

  it('stores and retrieves cached geometry data across renders', () => {
    const key = getSplayCacheKey('model1', 100, 0.25, 0.08, 0.12);
    expect(getCachedSplayGeometry(key)).toBeUndefined();

    const mockGeo = {
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      vertexCount: 2,
      triangleCount: 1,
    };

    setCachedSplayGeometry(key, mockGeo);
    const cached = getCachedSplayGeometry(key);

    expect(cached).toBeDefined();
    expect(cached?.vertexCount).toBe(2);
    expect(cached?.triangleCount).toBe(1);
    expect(cached?.positions.length).toBe(6);
  });
});
