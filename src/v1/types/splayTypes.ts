import type { Vec3 } from '@shared/types';
import * as THREE from 'three';

/**
 * Basic 3D point or vector representation.
 */
export interface SplayPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Survey station containing its 3D origin and associated radial splay endpoints.
 */
export interface StationWithSplays {
  readonly id?: string | number;
  readonly position: SplayPoint;
  readonly splays: readonly SplayPoint[];
  /** Adjacent station positions connected by traverse survey legs */
  readonly connectedTo?: readonly SplayPoint[];
}

/**
 * A 3D tetrahedron formed by a station origin and 3 adjacent splay endpoints.
 */
export interface SplayTetrahedron {
  readonly a: SplayPoint; // Station origin
  readonly b: SplayPoint; // Splay 1
  readonly c: SplayPoint; // Splay 2
  readonly d: SplayPoint; // Splay 3
}

/**
 * 3D bounding box for SDF grid volume calculation.
 */
export interface BoundingBox3D {
  readonly min: SplayPoint;
  readonly max: SplayPoint;
}

/**
 * Configuration options for the splay SDF generation and meshing process.
 */
export interface SplayWorkerConfig {
  /** Size of each voxel in world units (meters). Smaller = finer detail, higher memory. Default: 0.3 */
  readonly voxelSize: number;
  /** Padding around the data bounding box (meters). Default: 1.0 */
  readonly padding: number;
  /** Smoothing factor k for smooth-minimum (smin) union blending. Default: 0.4 */
  readonly smoothK: number;
  /** Isovalue for surface extraction (0 is the exact boundary of empty air). Default: 0.0 */
  readonly isovalue: number;
  /** Whether to construct connector capsules along traverse legs between stations. Default: true */
  readonly includeTraverseCapsules: boolean;
  /** Default radius for traverse connection capsules (meters). Default: 0.4 */
  readonly capsuleRadius: number;
}

/**
 * Geometry buffer data extracted from the isosurface.
 */
export interface SplayMeshGeometryData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

/**
 * Raw 3D scalar grid (SDF) metadata and buffer.
 */
export interface SplaySdfGridData {
  readonly buffer: Float32Array;
  readonly dims: readonly [number, number, number];
  readonly origin: readonly [number, number, number];
  readonly voxelSize: number;
}

/**
 * Input message payload sent to the splay wall Web Worker.
 */
export interface SplayWorkerInputMessage {
  readonly type: 'GENERATE_SURFACE' | 'GENERATE_SDF_GRID';
  readonly stations: readonly StationWithSplays[];
  readonly config: SplayWorkerConfig;
}

/**
 * Output message payload returned by the splay wall Web Worker.
 */
export interface SplayWorkerOutputSuccess {
  readonly status: 'success';
  readonly geometry?: SplayMeshGeometryData;
  readonly sdfGrid?: SplaySdfGridData;
  readonly durationMs: number;
}

export interface SplayWorkerOutputProgress {
  readonly status: 'progress';
  readonly progress: number;
  readonly message?: string;
}

export interface SplayWorkerOutputError {
  readonly status: 'error';
  readonly error: string;
}

export type SplayWorkerOutputMessage = SplayWorkerOutputSuccess | SplayWorkerOutputError | SplayWorkerOutputProgress;

/**
 * Props for the SplayCaveWalls React-Three-Fiber component.
 */
export interface SplayCaveWallsProps {
  readonly stations?: readonly StationWithSplays[];
  readonly cave?: any;
  readonly options?: any;
  readonly clippingPlanes?: THREE.Plane[];
  readonly isMoving?: boolean;
  readonly showAltitude?: boolean;
  readonly voxelSize?: number;
  readonly padding?: number;
  readonly smoothK?: number;
  readonly isovalue?: number;
  readonly includeTraverseCapsules?: boolean;
  readonly capsuleRadius?: number;
  readonly color?: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly opacity?: number;
  readonly transparent?: boolean;
  readonly wireframe?: boolean;
  readonly onGenerated?: (stats: { vertexCount: number; triangleCount: number; durationMs: number }) => void;
  readonly onError?: (errorMessage: string) => void;
  readonly onStatusChange?: (status: { msg: string; type: 'info' | 'error' | 'success' | 'progress'; progress?: number } | null) => void;
}
