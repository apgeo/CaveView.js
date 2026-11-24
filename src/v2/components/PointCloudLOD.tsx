import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import type { LiDARWorkerMessage, ParsedCave, PointCloudShape } from '@shared/types';
import { hasRenderablePointColors, hasUsefulPointColors } from '@shared/utils/pointCloudColors';
import { DEFAULT_POINT_CLOUD_SHAPE, getPointCloudShapeUniform } from './pointCloudShape';

const vertexShader = `
#include <clipping_planes_pars_vertex>

attribute vec3 color;
attribute float intensity;
attribute float relHeight; // NEW

varying vec3 vColor;
varying float vIntensity;
varying vec3 vNormal;
varying vec3 vModelNormal; // NEW (model space normála pre segmenter)
varying vec3 vViewPosition;
varying float vWorldZ;
varying float vRelHeight; // NEW

uniform float pointSize;

void main() {
    vColor = color;
    vIntensity = intensity;
    vRelHeight = relHeight; // NEW
    vWorldZ = position.y; // In v2, Y is altitude
    vModelNormal = length(normal) > 0.001 ? normal : vec3(0.0); // NEW
    
    // Transform normal to view space (pre headlight lighting)
    vec3 rawViewNormal = normalMatrix * normal;
    vNormal = length(rawViewNormal) > 0.001 ? normalize(rawViewNormal) : vec3(0.0);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Point size attenuation
    gl_PointSize = pointSize * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 32.0);

    vViewPosition = - mvPosition.xyz;
    #include <clipping_planes_vertex>
}
`;

const fragmentShader = `
#include <clipping_planes_pars_fragment>

varying vec3 vColor;
varying float vIntensity;
varying vec3 vNormal;
varying vec3 vModelNormal; // NEW (model space normála)
varying vec3 vViewPosition;
varying float vWorldZ;
varying float vRelHeight; // NEW

uniform float brightness;
uniform float plasticity;
uniform int colorMode; // 0: original, 1: elevation, 2: natural
uniform vec3 customColor;
uniform vec3 highlightColor;
uniform float minZ;
uniform float maxZ;
uniform int uHasUsableVertexColors;
uniform int pointShape; // 0 square, 1 sphere, 2 rounded diamond, 3 hex, 4 surfel
uniform int uEnableEDL;
uniform float uEdlStrength;

// Real-time GPU segmenter uniforms
uniform int uViewMode; // 0: All, 1: Floor, 2: Ceiling, 3: Contour Floor, 4: Heatmap Floor
uniform float uHeightThreshold; // threshold for relHeight (0.0 to 1.0)
uniform float uAngleThreshold;  // threshold for normal.y (0.0 to 1.0)

float getPointShapeAlpha(vec2 coord) {
    if (pointShape == 0) {
        return 1.0;
    }

    if (pointShape == 1) {
        float circleDist = dot(coord, coord);
        return 1.0 - smoothstep(0.92, 1.0, circleDist);
    }

    if (pointShape == 2) {
        vec2 diamondCoord = vec2(
            coord.x * 0.82 + coord.y * 0.32,
            -coord.x * 0.32 + coord.y * 0.82
        );
        float diamondDist = abs(diamondCoord.x) + abs(diamondCoord.y);
        return 1.0 - smoothstep(0.92, 1.02, diamondDist);
    }

    if (pointShape == 3) {
        vec2 hexCoord = abs(coord);
        float hexDist = max(hexCoord.x * 0.8660254 + hexCoord.y * 0.5, hexCoord.y);
        return 1.0 - smoothstep(0.88, 0.98, hexDist);
    }

    if (pointShape == 4) {
        // Surfel (Continuous disk splatting with smooth border)
        float circleDist = dot(coord, coord);
        if (circleDist > 1.0) return 0.0;
        return 1.0 - smoothstep(0.75, 1.0, circleDist);
    }

    return 1.0;
}

float getPointEdgeFactor(vec2 coord) {
    if (pointShape == 0) {
        // Square border (crisp dark edge frame)
        float sq = max(abs(coord.x), abs(coord.y));
        return smoothstep(0.65, 0.94, sq);
    }
    if (pointShape == 1) {
        // Sphere/Circle border (crisp dark ring)
        float d = dot(coord, coord);
        return smoothstep(0.48, 0.92, d);
    }
    if (pointShape == 2) {
        // Diamond border
        vec2 diamondCoord = vec2(
            coord.x * 0.82 + coord.y * 0.32,
            -coord.x * 0.32 + coord.y * 0.82
        );
        float d = abs(diamondCoord.x) + abs(diamondCoord.y);
        return smoothstep(0.62, 0.93, d);
    }
    if (pointShape == 3) {
        // Hexagon border
        vec2 hexCoord = abs(coord);
        float d = max(hexCoord.x * 0.8660254 + hexCoord.y * 0.5, hexCoord.y);
        return smoothstep(0.62, 0.92, d);
    }
    if (pointShape == 4) {
        // Surfel disk edge ring
        float d = dot(coord, coord);
        return smoothstep(0.45, 0.88, d);
    }
    return 0.0;
}

vec3 getElevationColor(float z) {
    float t = clamp((z - minZ) / (maxZ - minZ), 0.0, 1.0);
    
    // Gradient stops (Blue -> Cyan -> Green -> Yellow -> Red)
    vec3 c0 = vec3(0.08, 0.18, 0.65);
    vec3 c1 = vec3(0.10, 0.48, 0.85);
    vec3 c2 = vec3(0.12, 0.78, 0.72);
    vec3 c3 = vec3(0.18, 0.87, 0.38);
    vec3 c4 = vec3(0.80, 0.94, 0.10);
    vec3 c5 = vec3(0.97, 0.60, 0.05);
    vec3 c6 = vec3(0.88, 0.10, 0.10);
    
    if (t < 0.18) return mix(c0, c1, t / 0.18);
    if (t < 0.35) return mix(c1, c2, (t - 0.18) / (0.35 - 0.18));
    if (t < 0.50) return mix(c2, c3, (t - 0.35) / (0.50 - 0.35));
    if (t < 0.65) return mix(c3, c4, (t - 0.50) / (0.65 - 0.50));
    if (t < 0.80) return mix(c4, c5, (t - 0.65) / (0.80 - 0.65));
    return mix(c5, c6, (t - 0.80) / (1.0 - 0.80));
}

void main() {
    vec2 spriteCoord = gl_PointCoord * 2.0 - 1.0;
    float shapeAlpha = getPointShapeAlpha(spriteCoord);
    if (shapeAlpha <= 0.02) discard;

    // 0. Manual Clipping with Highlight Logic
    float minClipDist = 10000.0;
    bool hasClip = false;

    #if NUM_CLIPPING_PLANES > 0
    for ( int i = 0; i < NUM_CLIPPING_PLANES; i ++ ) {
        vec4 plane = clippingPlanes[ i ];
        // Standard Three.js distance calculation in view space
        float dist = dot(vViewPosition, plane.xyz) - plane.w;
        
        if ( dist > 0.0 ) discard; // Standard clipping discard
        
        minClipDist = min(minClipDist, abs(dist));
        hasClip = true;
    }
    #endif

    // ─── Speleo Segmenter: Mold Parting Line Logic (GPU) ─────────────────────
    // Zistíme, či LiDAR model má vypočítané normály. 
    bool hasNormals = (length(vModelNormal) > 0.1);
    vec3 mNormal = hasNormals ? normalize(vModelNormal) : vec3(0.0);

    // Podlaha: body ležiace pod deliacou rovinou (uHeightThreshold)
    // Sklon nahor (mNormal.y > uAngleThreshold) odstraňuje strmé steny.
    bool isFloor = (vRelHeight < uHeightThreshold) && (!hasNormals || mNormal.y > uAngleThreshold);
    
    // Strop: body ležiace nad deliacou rovinou (uHeightThreshold)
    // Sklon nadol (mNormal.y < -uAngleThreshold) odstraňuje strmé steny.
    bool isCeiling = (vRelHeight > uHeightThreshold) && (!hasNormals || mNormal.y < -uAngleThreshold);

    if (uViewMode == 1) { // Floor only
        if (!isFloor) discard;
    } else if (uViewMode == 2) { // Ceiling only
        if (!isCeiling) discard;
    } else if (uViewMode == 3 || uViewMode == 4) { // Contour/Heatmap floor modes
        if (!isFloor) discard;
    }

    // 1. Base color selection
    vec3 baseColor;
    if (uViewMode == 4) {
        // Heatmap floor: height elevation coloring
        baseColor = getElevationColor(vWorldZ);
    } else if (uViewMode == 3) {
        // Contour floor: Draw elegant 1m contours on dark slate floor
        vec3 terrainColor = vec3(0.15, 0.20, 0.25); // Slate background
        
        float fractZ = fract(vWorldZ + 0.5) - 0.5;
        float distToContour = abs(fractZ);
        float contourWidth = 0.03; // sharp 3cm lines
        
        // Anti-aliased lines using smoothstep
        float contourIntensity = 1.0 - smoothstep(0.0, contourWidth, distToContour);
        
        // Highlight every 5th meter contour
        float isIndexContour = 1.0 - smoothstep(0.0, contourWidth * 1.5, abs(fract(vWorldZ / 5.0 + 0.5) - 0.5) * 5.0);
        
        vec3 mainContourCol = vec3(0.95, 0.75, 0.15); // Golden main contours
        vec3 subContourCol = vec3(0.65, 0.70, 0.75);  // Light silver sub-contours
        vec3 finalContourColor = mix(subContourCol, mainContourCol, isIndexContour);
        
        baseColor = mix(terrainColor, finalContourColor, contourIntensity);
    } else if (colorMode == 1) {
        baseColor = getElevationColor(vWorldZ);
    } else if (colorMode == 2) {
        baseColor = customColor; 
    } else {
        // Original mode: trust vertex colors only when the source declared real color data.
        if (uHasUsableVertexColors == 1) {
            baseColor = vColor;
        } else {
            baseColor = customColor;
        }
    }
    
    // 2. Lighting calculation (Headlight effect)
    vec3 lightDir = normalize(vec3(0.2, 0.2, 1.0));
    float dotNL = dot(vNormal, lightDir);
    float spriteShade = 1.0;
    float spriteDiffuse = 0.5;
    if (pointShape == 1) {
        float spriteDist = dot(spriteCoord, spriteCoord);
        float spriteDepth = sqrt(max(0.0, 1.0 - spriteDist));
        spriteShade = mix(0.72, 1.12, spriteDepth);
        vec3 pointSpriteNormal = normalize(vec3(spriteCoord.x * 0.45, -spriteCoord.y * 0.45, spriteDepth));
        spriteDiffuse = max(dot(pointSpriteNormal, lightDir), 0.0);
    }
    float diffuse = (length(vNormal) > 0.01) ? max(dotNL, 0.0) : spriteDiffuse;
    
    // 3. Intensity influence
    float baseIntensityEffect = 0.4 + vIntensity * 0.6;
    float brightIntensity = mix(1.0, baseIntensityEffect, plasticity);
    
    // 4. Final Shading
    float ambient = 0.4;
    float light = (ambient + (diffuse * 0.6 * plasticity)) * brightness;
    
    vec3 finalColor = baseColor * light * brightIntensity * spriteShade;
    finalColor *= mix(0.94, 1.03, shapeAlpha);
    
    // 5. Gamma correction
    finalColor = pow(finalColor, vec3(0.8 / clamp(brightness, 0.5, 2.0)));

    // 6. Point Silhouette / EDL Outline Rim (instant thin crisp black edge around disks/squares)
    float edgeFactor = getPointEdgeFactor(spriteCoord);
    if (uEnableEDL == 1) {
        float borderDarken = 0.75 * clamp(uEdlStrength, 0.5, 2.0);
        finalColor = mix(finalColor, vec3(0.01, 0.01, 0.02), edgeFactor * borderDarken);
    }

    // 7. Highlight for Clipping Edges
    if (hasClip && minClipDist < 0.15) {
        float highlightStrength = 1.0 - (minClipDist / 0.15);
        finalColor = mix(finalColor, highlightColor, highlightStrength * 0.9);
    }

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

type PointCloudRenderProps = {
  pointSize?: number;
  brightness?: number;
  plasticity?: number;
  pointShape?: PointCloudShape;
  colorMode?: 'original' | 'elevation' | 'natural';
  customColor?: string;
  highlightColor?: string;
  minZ?: number;
  maxZ?: number;
  clippingPlanes?: THREE.Plane[];
  viewMode?: 'all' | 'floor' | 'ceiling' | 'contour' | 'heatmap';
  heightThreshold?: number;
  angleThreshold?: number;
  enableEDL?: boolean;
  edlStrength?: number;
};

interface ChunkData {
  id: string;
  points: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  intensity: Float32Array;
  relHeight: Float32Array; // NEW
  vertexCount: number;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

export const PointCloudLOD: React.FC<PointCloudRenderProps & { url: string }> = ({
  url, 
  pointSize = 1.0, 
  brightness = 1.0, 
  plasticity = 1.0,
  pointShape = DEFAULT_POINT_CLOUD_SHAPE,
  colorMode = 'original',
  customColor = '#ffffff',
  highlightColor = '#ff4444',
  minZ = -100,
  maxZ = 100,
  clippingPlanes = [],
  viewMode = 'all', // NEW
  heightThreshold = 0.4, // NEW
  angleThreshold = 0.5, // NEW
  enableEDL = false,
  edlStrength = 1.0,
}) => {
  const [chunks, setChunks] = useState<Map<string, { points: THREE.Points; bounds: THREE.Box3 }>>(new Map());
  const { camera } = useThree();
  const workerRef = useRef<Worker | null>(null);
  
  // Keep track of loaded chunks for reliable GPU cleanup on unmount
  const chunksRef = useRef<Map<string, { points: THREE.Points; bounds: THREE.Box3 }>>(new Map());

  // Reuse Frustum and Matrix4 instances to prevent Garbage Collection stuttering/FPS drops
  const frustumRef = useRef(new THREE.Frustum());
  const matrixRef = useRef(new THREE.Matrix4());

  const modeInt = colorMode === 'elevation' ? 1 : colorMode === 'natural' ? 2 : 0;
  const viewModeInt = viewMode === 'floor' ? 1 : viewMode === 'ceiling' ? 2 : viewMode === 'contour' ? 3 : viewMode === 'heatmap' ? 4 : 0; // NEW
  const shapeInt = getPointCloudShapeUniform(pointShape);
  const threeColor = useMemo(() => new THREE.Color(customColor), [customColor]);
  const threeHighlightColor = useMemo(() => new THREE.Color(highlightColor), [highlightColor]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const worker = new Worker(new URL('../parsers/pointcloud.worker.ts', import.meta.url), {
      type: 'module'
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<LiDARWorkerMessage>) => {
      const data = event.data;
      if (data.type === 'POINTCLOUD_CHUNK' && data.points && data.colors && data.normals && data.intensity && data.relHeight && data.bounds && data.id) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.points, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
        geometry.setAttribute('intensity', new THREE.BufferAttribute(data.intensity, 1));
        geometry.setAttribute('relHeight', new THREE.BufferAttribute(data.relHeight, 1));
        geometry.computeBoundingSphere();

        const material = new THREE.ShaderMaterial({
          uniforms: {
            pointSize: { value: pointSize },
            brightness: { value: brightness },
            plasticity: { value: plasticity },
            pointShape: { value: shapeInt },
            colorMode: { value: modeInt },
            customColor: { value: threeColor },
            highlightColor: { value: threeHighlightColor },
            minZ: { value: minZ },
            maxZ: { value: maxZ },
            uHasUsableVertexColors: { value: hasUsefulPointColors(data.colors, data.vertexCount || 0) ? 1 : 0 },
            uViewMode: { value: viewModeInt },
            uHeightThreshold: { value: heightThreshold },
            uAngleThreshold: { value: angleThreshold },
            uEnableEDL: { value: enableEDL ? 1 : 0 },
            uEdlStrength: { value: edlStrength },
          },
          vertexShader,
          fragmentShader,
          transparent: false,
          depthWrite: true,
          depthTest: true,
          clipping: true,
          clippingPlanes: clippingPlanes,
          side: THREE.DoubleSide
        });

        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;

        const box = new THREE.Box3(
          new THREE.Vector3(data.bounds.min.x, data.bounds.min.y, data.bounds.min.z),
          new THREE.Vector3(data.bounds.max.x, data.bounds.max.y, data.bounds.max.z)
        );

        const chunkObj = { points, bounds: box };
        chunksRef.current.set(data.id, chunkObj);

        setChunks(prev => {
          const next = new Map(prev);
          next.set(data.id!, chunkObj);
          return next;
        });
      }
    };

    fetch(url, { signal: controller.signal })
      .then(res => res.arrayBuffer())
      .then(buffer => {
        if (active) worker.postMessage({ buffer }, [buffer]);
      })
      .catch((err: unknown) => {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') return;
        console.error('Failed to fetch pointcloud:', err);
      });

    return () => {
      active = false;
      controller.abort();
      worker.terminate();
      
      // CRITICAL: 100% reliable GPU VRAM resource cleanup to prevent memory leaks!
      chunksRef.current.forEach(chunk => {
        chunk.points.geometry.dispose();
        if (Array.isArray(chunk.points.material)) {
          chunk.points.material.forEach(m => m.dispose());
        } else {
          chunk.points.material.dispose();
        }
      });
      chunksRef.current.clear();
      setChunks(new Map());
    };
  }, [url]);

  useEffect(() => {
    chunks.forEach(chunk => {
      const material = chunk.points.material as THREE.ShaderMaterial;
      if (material.uniforms) {
        if (material.uniforms.pointSize) material.uniforms.pointSize.value = pointSize;
        if (material.uniforms.brightness) material.uniforms.brightness.value = brightness;
        if (material.uniforms.plasticity) material.uniforms.plasticity.value = plasticity;
        if (material.uniforms.pointShape) material.uniforms.pointShape.value = shapeInt;
        if (material.uniforms.colorMode) material.uniforms.colorMode.value = modeInt;
        if (material.uniforms.customColor) material.uniforms.customColor.value = threeColor;
        if (material.uniforms.highlightColor) material.uniforms.highlightColor.value = threeHighlightColor;
        if (material.uniforms.minZ) material.uniforms.minZ.value = minZ;
        if (material.uniforms.maxZ) material.uniforms.maxZ.value = maxZ;
        if (material.uniforms.uViewMode) material.uniforms.uViewMode.value = viewModeInt; // NEW
        if (material.uniforms.uHeightThreshold) material.uniforms.uHeightThreshold.value = heightThreshold; // NEW
        if (material.uniforms.uAngleThreshold) material.uniforms.uAngleThreshold.value = angleThreshold; // NEW
        if (material.uniforms.uEnableEDL) material.uniforms.uEnableEDL.value = enableEDL ? 1 : 0;
        if (material.uniforms.uEdlStrength) material.uniforms.uEdlStrength.value = edlStrength;
      }
      material.clippingPlanes = clippingPlanes;
      material.needsUpdate = true;
    });
  }, [pointSize, brightness, plasticity, shapeInt, colorMode, customColor, highlightColor, threeColor, threeHighlightColor, minZ, maxZ, clippingPlanes, chunks, viewMode, heightThreshold, angleThreshold, enableEDL, edlStrength]); // NEW dependencies

  useFrame(() => {
    const frustum = frustumRef.current;
    const matrix = matrixRef.current;
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);

    chunks.forEach(chunk => {
      chunk.points.visible = frustum.intersectsBox(chunk.bounds);
    });
  });

  return (
    <group>
      {Array.from(chunks.values()).map((chunk, idx) => (
        <primitive key={idx} object={chunk.points} />
      ))}
    </group>
  );
};

function buildDirectRelHeights(cave: ParsedCave): Float32Array {
  const points = cave.points;
  const count = cave.pointCount;
  const relHeights = new Float32Array(count);
  if (!points || count === 0) return relHeights;

  const cellSize = Math.max(0.2, Math.max(cave.bounds.size.x, cave.bounds.size.y, 1) / 280);
  const invCell = 1 / cellSize;
  const columns = new Map<string, { min: number; max: number }>();

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const key = `${Math.floor(points[p] * invCell)},${Math.floor(points[p + 1] * invCell)}`;
    const z = points[p + 2];
    const column = columns.get(key);
    if (column) {
      if (z < column.min) column.min = z;
      if (z > column.max) column.max = z;
    } else {
      columns.set(key, { min: z, max: z });
    }
  }

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const key = `${Math.floor(points[p] * invCell)},${Math.floor(points[p + 1] * invCell)}`;
    const column = columns.get(key);
    if (!column) {
      relHeights[i] = 0;
      continue;
    }
    const halfHeight = (column.max - column.min) / 2;
    relHeights[i] = halfHeight > 0.02 ? (points[p + 2] - (column.min + column.max) / 2) / halfHeight : -1;
  }

  return relHeights;
}

function hasDirectPointColors(cave: ParsedCave): boolean {
  const count = cave.pointCount;
  if (!cave.pointColors || cave.pointColors.length < count * 3) return false;
  return hasRenderablePointColors(cave, count);
}

function hasDirectPointNormals(cave: ParsedCave): boolean {
  const count = cave.pointCount;
  if (!cave.pointNormals || cave.pointNormals.length < count * 3) return false;
  if (cave.hasPointNormals === false) return false;
  return true;
}

export const PointCloudDirect: React.FC<PointCloudRenderProps & { cave: ParsedCave }> = ({
  cave,
  pointSize = 1.0,
  brightness = 1.0,
  plasticity = 1.0,
  pointShape = DEFAULT_POINT_CLOUD_SHAPE,
  colorMode = 'original',
  customColor = '#ffffff',
  highlightColor = '#ff4444',
  minZ = -100,
  maxZ = 100,
  clippingPlanes = [],
  viewMode = 'all',
  heightThreshold = 0.4,
  angleThreshold = 0.5,
  enableEDL = false,
  edlStrength = 1.0,
}) => {
  const modeInt = colorMode === 'elevation' ? 1 : colorMode === 'natural' ? 2 : 0;
  const viewModeInt = viewMode === 'floor' ? 1 : viewMode === 'ceiling' ? 2 : viewMode === 'contour' ? 3 : viewMode === 'heatmap' ? 4 : 0;
  const shapeInt = getPointCloudShapeUniform(pointShape);
  const threeColor = useMemo(() => new THREE.Color(customColor), [customColor]);
  const threeHighlightColor = useMemo(() => new THREE.Color(highlightColor), [highlightColor]);
  const hasSourceVertexColors = useMemo(
    () => hasDirectPointColors(cave),
    [cave]
  );

  const geometry = useMemo(() => {
    const count = cave.pointCount;
    const source = cave.points;
    if (!source || count === 0) return null;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const normals = hasDirectPointNormals(cave) ? new Float32Array(count * 3) : null;
    const intensity = new Float32Array(count);
    const relHeight = buildDirectRelHeights(cave);
    const hasColors = hasSourceVertexColors && !!cave.pointColors && cave.pointColors.length >= count * 3;
    const hasIntensity = !!cave.pointIntensity && cave.pointIntensity.length >= count;

    for (let i = 0; i < count; i++) {
      const src = i * 3;
      positions[src] = source[src];
      positions[src + 1] = source[src + 2];
      positions[src + 2] = -source[src + 1];

      if (hasColors) {
        colors[src] = cave.pointColors![src];
        colors[src + 1] = cave.pointColors![src + 1];
        colors[src + 2] = cave.pointColors![src + 2];
      } else {
        colors[src] = 0;
        colors[src + 1] = 0;
        colors[src + 2] = 0;
      }

      if (normals) {
        normals[src] = cave.pointNormals![src];
        normals[src + 1] = cave.pointNormals![src + 2];
        normals[src + 2] = -cave.pointNormals![src + 1];
      }

      intensity[i] = hasIntensity ? cave.pointIntensity![i] : 1;
    }

    const directGeometry = new THREE.BufferGeometry();
    directGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    directGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (normals) directGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    directGeometry.setAttribute('intensity', new THREE.BufferAttribute(intensity, 1));
    directGeometry.setAttribute('relHeight', new THREE.BufferAttribute(relHeight, 1));
    directGeometry.computeBoundingSphere();
    return directGeometry;
  }, [cave, cave.pointNormals, hasSourceVertexColors]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      pointSize: { value: pointSize },
      brightness: { value: brightness },
      plasticity: { value: plasticity },
      pointShape: { value: shapeInt },
      colorMode: { value: modeInt },
      customColor: { value: threeColor },
      highlightColor: { value: threeHighlightColor },
      minZ: { value: minZ },
      maxZ: { value: maxZ },
      uHasUsableVertexColors: { value: hasSourceVertexColors ? 1 : 0 },
      uViewMode: { value: viewModeInt },
      uHeightThreshold: { value: heightThreshold },
      uAngleThreshold: { value: angleThreshold },
      uEnableEDL: { value: enableEDL ? 1 : 0 },
      uEdlStrength: { value: edlStrength },
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    clipping: true,
    clippingPlanes,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => {
    if (!geometry) return undefined;
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useEffect(() => {
    material.uniforms.pointSize.value = pointSize;
    material.uniforms.brightness.value = brightness;
    material.uniforms.plasticity.value = plasticity;
    material.uniforms.pointShape.value = shapeInt;
    material.uniforms.colorMode.value = modeInt;
    material.uniforms.customColor.value = threeColor;
    material.uniforms.highlightColor.value = threeHighlightColor;
    material.uniforms.minZ.value = minZ;
    material.uniforms.maxZ.value = maxZ;
    material.uniforms.uHasUsableVertexColors.value = hasSourceVertexColors ? 1 : 0;
    material.uniforms.uViewMode.value = viewModeInt;
    material.uniforms.uHeightThreshold.value = heightThreshold;
    material.uniforms.uAngleThreshold.value = angleThreshold;
    material.uniforms.uEnableEDL.value = enableEDL ? 1 : 0;
    material.uniforms.uEdlStrength.value = edlStrength;
    material.clippingPlanes = clippingPlanes;
    material.needsUpdate = true;
  }, [
    material,
    pointSize,
    brightness,
    plasticity,
    shapeInt,
    modeInt,
    threeColor,
    threeHighlightColor,
    minZ,
    maxZ,
    hasSourceVertexColors,
    viewModeInt,
    heightThreshold,
    angleThreshold,
    clippingPlanes,
    enableEDL,
    edlStrength,
  ]);

  if (!geometry) return null;

  return <points geometry={geometry} material={material} frustumCulled={false} />;
};
