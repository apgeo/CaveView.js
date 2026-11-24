import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import { PointCloudDirect, PointCloudLOD } from './PointCloudLOD'
import { EDLPass } from './EDLPass'
const MapboxTerrain = React.lazy(() => import('./MapboxTerrain'))
import { 
  Stations, 
  StationLabels, 
  CaveLegs, 
  EntranceMarkers, 
  Character3D, 
  ManualConnection 
} from '@shared/components/CaveSharedElements'
import { SurfaceDepthVisual } from '@shared/components/SurfaceDepthVisual'
import { TectonicPlaneVisual } from '@shared/components/TectonicPlaneVisual'
import { SurveyPointPicker } from '@shared/components/SurveyPointPicker'
import { MeasurementOverlay } from '@shared/components/MeasurementOverlay'
import { sceneToSurvey } from '@shared/utils/stationInteraction'
import { Scraps } from '@shared/components/Scraps'
import { SplayCaveWalls } from '../../v1/components/SplayCaveWalls'
import { ProjectionController, calculateFitParams } from '@shared/components/ProjectionController'
import type { ParsedCave, ViewerOptions, StationLabel, CaveViewerNextGenProps, Vec3, ViewerCameraSnapshot } from '@shared/types'
import type { LiDARAnomaly } from '@shared/utils/speleoAnalysis'

const SceneBackground = ({ texture, color }: { texture: THREE.Texture | null, color: string }) => {
  const { scene } = useThree()
  useEffect(() => {
    const previousBackground = scene.background
    if (texture) scene.background = texture
    else scene.background = new THREE.Color(color)
    return () => {
      scene.background = previousBackground
      texture?.dispose()
    }
  }, [scene, texture, color])
  return null
}

const CameraMonitor = ({ controlsRef, onUpdate }: {
  controlsRef: React.RefObject<any>,
  onUpdate?: (data: ViewerCameraSnapshot) => void
}) => {
  const { camera, size } = useThree()
  const lastPos = useRef(new THREE.Vector3())
  const lastQuat = useRef(new THREE.Quaternion())
  const lastTime = useRef(0)
  const lastHeading = useRef(-999)
  const lastDistBucket = useRef(-1)

  useEffect(() => {
    if (!onUpdate) return

    const checkUpdate = () => {
      const now = performance.now()
      if (now - lastTime.current < 60) return
      
      const posChanged = camera.position.distanceToSquared(lastPos.current) > 0.0001
      const quatChanged = camera.quaternion.angleTo(lastQuat.current) > 0.001
      if (!posChanged && !quatChanged) return

      const target = controlsRef.current?.target || new THREE.Vector3(0, 0, 0)
      const dist = camera.position.distanceTo(target)

      const dx = target.x - camera.position.x
      const dz = target.z - camera.position.z
      const heading = Math.round((Math.atan2(dx, -dz) * (180 / Math.PI) + 360) % 360)
      const distBucket = dist < 25 ? 0 : dist < 60 ? 1 : dist < 120 ? 2 : dist < 300 ? 3 : dist < 600 ? 4 : dist < 1200 ? 5 : dist < 3000 ? 6 : 7

      const headingChanged = Math.abs(heading - lastHeading.current) >= 1
      const bucketChanged = distBucket !== lastDistBucket.current
      const largePosChange = camera.position.distanceToSquared(lastPos.current) > 0.25

      if (!headingChanged && !bucketChanged && !largePosChange && now - lastTime.current < 150) {
        return
      }

      lastTime.current = now
      lastPos.current.copy(camera.position)
      lastQuat.current.copy(camera.quaternion)
      lastHeading.current = heading
      lastDistBucket.current = distBucket

      const perspective = camera as THREE.PerspectiveCamera
      onUpdate({
        dist,
        fov: perspective.fov || 55,
        width: size.width,
        height: size.height,
        aspect: perspective.aspect || size.width / Math.max(size.height, 1),
        near: perspective.near || 0.1,
        far: perspective.far || 10000,
        position: camera.position.toArray() as [number, number, number],
        quaternion: camera.quaternion.toArray() as [number, number, number, number],
        target: target.toArray() as [number, number, number],
      })
    }

    const timer = setInterval(checkUpdate, 100)
    checkUpdate()
    return () => clearInterval(timer)
  }, [camera, controlsRef, onUpdate, size])

  return null
}

const AutoFit = ({ cave, trigger, offset }: { cave: ParsedCave, trigger?: number, offset?: Vec3 }) => {
  const { camera, controls, size, invalidate } = useThree() as any
  useEffect(() => {
    const b = cave.bounds
    // Account for calibration offset in world space
    const ox = offset?.x || 0
    const oy = offset?.z || 0
    const oz = -(offset?.y || 0)
    
    const targetX = b.center.x + ox
    const targetY = b.center.z + oy
    const targetZ = -b.center.y + oz

    const { fitDist, frustumHalf, aspect } = calculateFitParams(b, size, camera.fov || 55, 'iso')
    
    if (camera instanceof THREE.OrthographicCamera) {
      camera.left = -frustumHalf * aspect
      camera.right = frustumHalf * aspect
      camera.top = frustumHalf
      camera.bottom = -frustumHalf
      camera.zoom = 1
      camera.position.set(targetX + fitDist * 0.707, targetY + fitDist * 0.577, targetZ + fitDist * 0.707)
      camera.updateProjectionMatrix()
    } else {
      camera.position.set(targetX + fitDist * 0.707, targetY + fitDist * 0.577, targetZ + fitDist * 0.707)
      camera.near = Math.max(0.1, fitDist * 0.001)
      camera.far = Math.max(fitDist * 25, 10000)
      camera.updateProjectionMatrix()
    }

    if (controls && controls.target) {
      controls.target.set(targetX, targetY, targetZ)
      controls.update()
    }
    invalidate()
  }, [cave, trigger, camera, controls, offset, size, invalidate])
  return null
}

const NavigationHandler = ({ 
  isMeasuringMode, 
  controlsRef, 
  fitTrigger, 
  cave, 
  offset,
  onStationClick,
  anomalies,
  activeAnomalyId
}: { 
  isMeasuringMode: boolean, 
  controlsRef: React.RefObject<any>,
  fitTrigger?: number,
  cave: ParsedCave,
  offset?: Vec3,
  onStationClick?: (idx: number, x: number, y: number, ctrl: boolean, p?: any) => void,
  anomalies?: LiDARAnomaly[],
  activeAnomalyId?: string | null
}) => {
  const { camera, scene, raycaster, gl } = useThree();
  const historyRef = useRef<{ pos: THREE.Vector3, target: THREE.Vector3 }[]>([]);
  const clickStart = useRef<{ x: number; y: number; dragged: boolean } | null>(null)

  const getCanvasPointer = useCallback((e: MouseEvent) => {
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    return new THREE.Vector2(
      (x / rect.width) * 2 - 1,
      -(y / rect.height) * 2 + 1
    );
  }, [gl]);

  const flyTo = useCallback((endPos: THREE.Vector3, targetPoint: THREE.Vector3) => {
    // Save current state to history before flying
    if (controlsRef.current) {
      historyRef.current.push({
        pos: camera.position.clone(),
        target: controlsRef.current.target.clone()
      });
      // Keep history manageable
      if (historyRef.current.length > 20) historyRef.current.shift();
    }

    gsap.to(camera.position, {
      x: endPos.x,
      y: endPos.y,
      z: endPos.z,
      duration: 1.2,
      ease: "power2.inOut",
      onUpdate: () => {
        if (controlsRef.current) {
          controlsRef.current.target.lerp(targetPoint, 0.1);
        }
      },
      onComplete: () => {
        if (controlsRef.current) {
          controlsRef.current.target.copy(targetPoint);
          controlsRef.current.update();
        }
      }
    });
  }, [camera, controlsRef]);

  useEffect(() => {
    if (!activeAnomalyId || !anomalies || !controlsRef.current) return;
    const a = anomalies.find(x => x.id === activeAnomalyId);
    if (!a) return;
    
    const offX = offset?.x || 0;
    const offY = offset?.z || 0;
    const offZ = -(offset?.y || 0);
    
    const posX = a.pos.x + offX;
    const posY = a.pos.z + offY;
    const posZ = -a.pos.y + offZ;
    
    const targetPoint = new THREE.Vector3(posX, posY, posZ);
    const endPos = new THREE.Vector3(posX + 15, posY + 10, posZ + 15);
    
    flyTo(endPos, targetPoint);
  }, [activeAnomalyId, anomalies, offset, flyTo, controlsRef]);

  const handleUndo = useCallback(() => {
    const prevState = historyRef.current.pop();
    if (prevState && controlsRef.current) {
      gsap.to(camera.position, {
        x: prevState.pos.x,
        y: prevState.pos.y,
        z: prevState.pos.z,
        duration: 1.0,
        ease: "power2.out"
      });
      gsap.to(controlsRef.current.target, {
        x: prevState.target.x,
        y: prevState.target.y,
        z: prevState.target.z,
        duration: 1.0,
        ease: "power2.out",
        onUpdate: () => controlsRef.current.update()
      });
    }
  }, [camera, controlsRef]);

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    if (isMeasuringMode) return;

    const mouse = getCanvasPointer(e);
    if (!mouse) return;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Points = { threshold: 0.5 };
    
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
      const targetPoint = intersects[0].point;
      const startPos = camera.position.clone();
      const direction = new THREE.Vector3().subVectors(targetPoint, startPos).normalize();
      const distance = startPos.distanceTo(targetPoint);
      const flyDistance = Math.max(0, distance - 3.0);
      const endPos = startPos.clone().add(direction.multiplyScalar(flyDistance));

      flyTo(endPos, targetPoint);
    }
  }, [camera, scene, raycaster, isMeasuringMode, flyTo, getCanvasPointer]);

  const handleClick = useCallback((e: MouseEvent) => {
    if (clickStart.current?.dragged || e.button !== 0) return;

    const mouse = getCanvasPointer(e);
    if (!mouse) return;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Points = { threshold: 0.2 };
    
    const intersects = raycaster.intersectObjects(scene.children, true);
    const hit = intersects.find(intersection => {
      let object: THREE.Object3D | null = intersection.object
      while (object) {
        if (!object.visible) return false
        if (object.userData.measurementSource) return true
        object = object.parent
      }
      return false
    })
    if (hit) {
      const point = hit.object instanceof THREE.Points && hit.index !== undefined
        ? new THREE.Vector3().fromBufferAttribute(hit.object.geometry.getAttribute('position'), hit.index).applyMatrix4(hit.object.matrixWorld)
        : hit.point
      onStationClick?.(-1, e.clientX, e.clientY, e.ctrlKey || e.metaKey, sceneToSurvey(point, offset));
    }
  }, [camera, scene, raycaster, isMeasuringMode, onStationClick, getCanvasPointer, offset]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => { clickStart.current = { x: e.clientX, y: e.clientY, dragged: false } }
    const onPointerMove = (e: PointerEvent) => {
      const start = clickStart.current
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) start.dragged = true
    }
    gl.domElement.addEventListener('pointerdown', onPointerDown)
    gl.domElement.addEventListener('pointermove', onPointerMove)
    gl.domElement.addEventListener('dblclick', handleDoubleClick);
    gl.domElement.addEventListener('click', handleClick);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') handleUndo();
    };
    window.addEventListener('keydown', handleKeyDown);
    
    const onUndoEvent = () => handleUndo();
    window.addEventListener('cave-navigation-undo', onUndoEvent);

    return () => {
      gl.domElement.removeEventListener('pointerdown', onPointerDown)
      gl.domElement.removeEventListener('pointermove', onPointerMove)
      gl.domElement.removeEventListener('dblclick', handleDoubleClick);
      gl.domElement.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('cave-navigation-undo', onUndoEvent);
    };
  }, [handleDoubleClick, handleClick, handleUndo, gl]);

  return null;
};

const CaveViewerNextGen = ({ 
  cave, options: o, onStationClick, onCameraUpdate, onStatusChange, fitTrigger, 
  selectedStations, activeProfilePoints, isMeasuringMode, manualConnection,
  anomalies, activeAnomalyId, onSurfaceOffsetChange, lang = 'sk'
}: CaveViewerNextGenProps) => {
  const [isMoving, setIsModelMoving] = useState(false)
  const [isFullyIdle, setIsFullyIdle] = useState(true)
  const controlsRef = useRef<any>(null);
  const movingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLargeModel = useMemo(() => {
    const legCount = cave.segments?.length || 0;
    const stationCount = cave.stations?.length || 0;
    const pointCount = cave.pointCount || 0;
    const scrapCount = cave.scraps?.length || 0;
    return legCount > 800 || stationCount > 800 || pointCount > 100000 || scrapCount > 80;
  }, [cave]);
  
  const terrainRef = useRef<THREE.Group>(null);
  const transformControlsRef = useRef<any>(null);

  // Disable OrbitControls while dragging terrain
  useEffect(() => {
    if (!transformControlsRef.current || !controlsRef.current) return;
    
    const controls = controlsRef.current;
    const transform = transformControlsRef.current;
    
    const handleDragging = (e: any) => {
      controls.enabled = !e.value;
    };
    
    transform.addEventListener('dragging-changed', handleDragging);
    
    return () => {
      transform.removeEventListener('dragging-changed', handleDragging);
    };
  }, [o.terrainCalibrationMode]);

  const handleTerrainTransform = useCallback(() => {
    if (terrainRef.current && onSurfaceOffsetChange) {
      const pos = terrainRef.current.position;
      onSurfaceOffsetChange({
        x: Number(pos.x.toFixed(2)),
        y: Number((-pos.z).toFixed(2)),
        z: Number(pos.y.toFixed(2))
      });
    }
  }, [onSurfaceOffsetChange]);

  const handleCameraMoveStart = () => {
    setIsModelMoving(true)
    setIsFullyIdle(false)
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current)
      idleTimeoutRef.current = null
    }
  }

  const handleCameraMoveEnd = () => {
    setIsModelMoving(false)
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    idleTimeoutRef.current = setTimeout(() => {
      setIsFullyIdle(true)
    }, 180)
  }

  const handleCameraChange = useCallback(() => {
    if (!isMoving) setIsModelMoving(true)
    if (isFullyIdle) setIsFullyIdle(false)

    if (movingTimeoutRef.current) clearTimeout(movingTimeoutRef.current)
    movingTimeoutRef.current = setTimeout(() => {
      setIsModelMoving(false)
      movingTimeoutRef.current = null
    }, 400)

    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    idleTimeoutRef.current = setTimeout(() => {
      setIsFullyIdle(true)
    }, 180)
  }, [isMoving, isFullyIdle])

  useEffect(() => {
    return () => {
      if (movingTimeoutRef.current) clearTimeout(movingTimeoutRef.current)
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    }
  }, [])

  const diag = Math.sqrt(cave.bounds.size.x ** 2 + cave.bounds.size.y ** 2 + cave.bounds.size.z ** 2)

  // Calculate GPS center for Mapbox Terrain
  const gpsCenter = useMemo(() => {
    const labelsWithGps = cave.stationLabels.filter((l: StationLabel) => l.gps && l.gps.lat && l.gps.lon);
    if (labelsWithGps.length > 0) {
      const avgLat = labelsWithGps.reduce((sum: number, l: StationLabel) => sum + l.gps!.lat, 0) / labelsWithGps.length;
      const avgLon = labelsWithGps.reduce((sum: number, l: StationLabel) => sum + l.gps!.lon, 0) / labelsWithGps.length;
      return { lat: avgLat, lng: avgLon };
    }
    return null;
  }, [cave.stationLabels]);

  const bgTexture = useMemo(() => {
    if (!o.colorBackground2) return null
    const canvas = document.createElement('canvas')
    canvas.width = 2; canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const grad = ctx.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, o.colorBackground)
    grad.addColorStop(1, o.colorBackground2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 2, 512)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [o.colorBackground, o.colorBackground2])

  const compositeClippingPlanes = useMemo(() => {
    const planes: THREE.Plane[] = []
    if (o.showClipping) {
      planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), o.clippingHeight - cave.centerOffset.z))
    }
    if (o.showProfileClipping && activeProfilePoints && activeProfilePoints.length === 2) {
      const s1 = activeProfilePoints[0] as any;
      const s2 = activeProfilePoints[1] as any;
      const p1 = new THREE.Vector3(s1.origX - (s1.centerX||0), 0, -(s1.origY - (s1.centerY||0)))
      const p2 = new THREE.Vector3(s2.origX - (s1.centerX||0), 0, -(s2.origY - (s1.centerY||0)))
      const v = new THREE.Vector3().subVectors(p2, p1).normalize()
      if (v.lengthSq() > 0.0001) {
        const normal = new THREE.Vector3(-v.z, 0, v.x)
        if (o.profileClipFlip) normal.multiplyScalar(-1)
        planes.push(new THREE.Plane(normal, -normal.dot(p1) - o.profileClipOffset))
      }
    }
    return planes
  }, [o.showClipping, o.clippingHeight, o.showProfileClipping, o.profileClipFlip, o.profileClipOffset, activeProfilePoints, cave.centerOffset.z])

  const caveClippingPlanes = useMemo(() => {
    if (o.excludeModelFromClipping) return []
    return compositeClippingPlanes
  }, [o.excludeModelFromClipping, compositeClippingPlanes])

  return (
    <Canvas
      id="nextgen-cave-canvas"
      style={{ isolation: 'isolate' }}
      frameloop={o.autoRotate || isMoving || !isFullyIdle ? 'always' : 'demand'}
      dpr={isLargeModel ? 1.0 : (typeof window !== 'undefined' && window.devicePixelRatio > 1.5 ? 1.5 : 1)}
      gl={{ 
        antialias: !isLargeModel, 
        alpha: false, 
        preserveDrawingBuffer: true, 
        powerPreference: 'high-performance',
        localClippingEnabled: true 
      }}
      camera={{ fov: 55, near: 0.1, far: Math.max(diag * 20, 10000) }}
    >
      <SceneBackground texture={bgTexture} color={o.colorBackground} />
      <ProjectionController projection={o.cameraProjection ?? 'perspective'} cave={cave} controlsRef={controlsRef} />
      <NavigationHandler 
        isMeasuringMode={isMeasuringMode} 
        controlsRef={controlsRef} 
        cave={cave} 
        offset={o.caveCalibrationOffset}
        onStationClick={onStationClick}
        anomalies={anomalies}
        activeAnomalyId={activeAnomalyId}
      />
      
      <ambientLight intensity={0.32} />
      <hemisphereLight color="#ffffff" groundColor="#334155" intensity={0.42} />
      <directionalLight position={[4, 6, 3]} intensity={1.15} color="#ffffff" castShadow={false} />
      <directionalLight position={[-5, 2, -4]} intensity={0.40} color="#e2e8f0" />
      <directionalLight position={[-4, 5, 6]} intensity={0.60} color="#bae6fd" />
      <directionalLight position={[0, -3, 2]} intensity={0.18} color="#fef3c7" />

      {(o.enableEDL ?? true) && (
        <EDLPass strength={o.edlStrength || 1.0} radius={o.edlRadius || 1.0} />
      )}

      <group position={[
        o.caveCalibrationOffset?.x || 0, 
        o.caveCalibrationOffset?.z || 0, 
        -(o.caveCalibrationOffset?.y || 0)
      ]}>
        <Stations cave={cave} options={o} />
        <SurveyPointPicker cave={cave} options={o} onStationClick={onStationClick} />
        <CaveLegs cave={cave} options={o} showSplay={o.showSplay} showAltitude={o.traverseAltitude} clippingPlanes={compositeClippingPlanes} isMoving={!isFullyIdle} isLargeModel={isLargeModel} />
        <group visible={isFullyIdle}>
          <StationLabels cave={cave} options={o} showNames={o.showStationNames} showAltitudes={o.showStationAlt} />
        </group>
        <group visible={isFullyIdle || !isLargeModel}>
          <EntranceMarkers cave={cave} options={o} />
        </group>

        {/* ── Splay SDF Cave Walls (2D) ── */}
        {o.enableSplayWalls && (
          <SplayCaveWalls 
            cave={cave} 
            options={o} 
            showAltitude={o.splayAltitude ?? true}
            clippingPlanes={caveClippingPlanes}
            isMoving={!isFullyIdle}
            onStatusChange={onStatusChange}
          />
        )}

        {(o.showScraps || o.accurateScraps || o.scrapsWireframe) && cave.scraps?.length > 0 && (
          <Scraps 
            cave={cave} 
            options={o}
            opacity={o.scrapsOpacity}
            showSolid={o.showScraps && (cave.pointCount === 0 ? o.scrapsSolid : (o.smoothScraps || o.accurateScraps))}
            showWire={o.scrapsWireframe}
            showAltitude={o.scrapsAltitude}
            smooth={o.smoothScraps && !o.accurateScraps}
            showRender={o.showRenderCave}
            caveTexture={o.caveTexture}
            renderOpacity={o.renderOpacity}
            isMoving={isMoving}
            isFullyIdle={isFullyIdle}
            clippingPlanes={compositeClippingPlanes}
            onProcessingStart={onStatusChange ? (msg) => onStatusChange({ msg, type: 'progress' }) : undefined}
            onProcessingEnd={onStatusChange ? () => onStatusChange(null) : undefined}
          />
        )}

        {isMeasuringMode && <MeasurementOverlay stations={selectedStations ?? []} />}
        {!isMeasuringMode && selectedStations && selectedStations.length === 2 && (
          <ManualConnection p1={selectedStations[0].pos} p2={selectedStations[1].pos} />
        )}

        {selectedStations && selectedStations.length === 3 && (
          <TectonicPlaneVisual
            p1={selectedStations[0].pos}
            p2={selectedStations[1].pos}
            p3={selectedStations[2].pos}
          />
        )}

        {selectedStations && selectedStations.length === 1 && selectedStations[0].distToSurf !== null && selectedStations[0].surfaceZ !== null && (
          <SurfaceDepthVisual station={selectedStations[0]} lang={lang} />
        )}

        {o.placedCaver && (
          <Character3D pos={o.placedCaver.pos} pose={o.placedCaver.pose} clippingPlanes={compositeClippingPlanes} />
        )}

        <group visible={o.showScraps} userData={{ measurementSource: true }}>
        {cave.pointCloudUrl && (
          <PointCloudLOD 
            url={cave.pointCloudUrl} 
            pointSize={o.pointCloudSize || 1.0} 
            brightness={o.pointCloudBrightness || 1.0}
            plasticity={o.pointCloudPlasticity || 1.0}
            pointShape={o.pointCloudShape || 'diamond'}
            colorMode={o.pointCloudColorMode || 'original'}
            customColor={o.pointCloudCustomColor || '#b3a694'}
            highlightColor={o.colorClippingEdges || '#ff4444'}
            minZ={cave.bounds.min.z}
            maxZ={cave.bounds.max.z}
            clippingPlanes={caveClippingPlanes}
            viewMode={o.pointCloudViewMode || 'all'}
            heightThreshold={o.pointCloudHeightThreshold ?? 0.4}
            angleThreshold={o.pointCloudAngleThreshold ?? 0.5}
            enableEDL={o.enableEDL !== false}
            edlStrength={o.edlStrength || 1.0}
          />
        )}

        {!cave.pointCloudUrl && cave.points && cave.pointCount > 0 && (
          <PointCloudDirect
            cave={cave}
            pointSize={o.pointCloudSize || 1.0}
            brightness={o.pointCloudBrightness || 1.0}
            plasticity={o.pointCloudPlasticity || 1.0}
            pointShape={o.pointCloudShape || 'diamond'}
            colorMode={o.pointCloudColorMode || 'original'}
            customColor={o.pointCloudCustomColor || '#b3a694'}
            highlightColor={o.colorClippingEdges || '#ff4444'}
            minZ={cave.bounds.min.z}
            maxZ={cave.bounds.max.z}
            clippingPlanes={caveClippingPlanes}
            viewMode={o.pointCloudViewMode || 'all'}
            heightThreshold={o.pointCloudHeightThreshold ?? 0.4}
            angleThreshold={o.pointCloudAngleThreshold ?? 0.5}
            enableEDL={o.enableEDL !== false}
            edlStrength={o.edlStrength || 1.0}
          />
        )}

        </group>
        {/* LiDAR Anomálie */}
        {anomalies && anomalies.map((a) => {
          const isSelected = activeAnomalyId === a.id;
          
          // Prepočet súradníc: Speleo (x, y, z) -> Three.js (x, z, -y)
          const posX = a.pos.x;
          const posY = a.pos.z;
          const posZ = -a.pos.y;
          
          if (a.type === 'chimney') {
            return (
              <group key={a.id} position={[posX, posY, posZ]}>
                <mesh>
                  <coneGeometry args={[0.4, a.size, 8]} />
                  <meshBasicMaterial 
                    color={isSelected ? "#f43f5e" : "#f97316"} 
                    transparent 
                    opacity={isSelected ? 0.6 : 0.3} 
                    wireframe={!isSelected}
                  />
                </mesh>
                <pointLight color="#f97316" intensity={isSelected ? 2.0 : 0.5} distance={8} />
              </group>
            )
          } else if (a.type === 'window') {
            return (
              <group key={a.id} position={[posX, posY, posZ]}>
                <mesh>
                  <sphereGeometry args={[0.6, 16, 16]} />
                  <meshBasicMaterial 
                    color={isSelected ? "#06b6d4" : "#0284c7"} 
                    transparent 
                    opacity={isSelected ? 0.6 : 0.3} 
                    wireframe={!isSelected}
                  />
                </mesh>
                <pointLight color="#0284c7" intensity={isSelected ? 2.0 : 0.5} distance={6} />
              </group>
            )
          } else if (a.type === 'dome') {
            return (
              <group key={a.id} position={[posX, posY, posZ]}>
                <mesh>
                  <sphereGeometry args={[0.8, 16, 16]} />
                  <meshBasicMaterial 
                    color={isSelected ? "#a855f7" : "#8b5cf6"} 
                    transparent 
                    opacity={isSelected ? 0.6 : 0.3} 
                    wireframe={!isSelected}
                  />
                </mesh>
                <pointLight color="#8b5cf6" intensity={isSelected ? 2.0 : 0.5} distance={8} />
              </group>
            )
          } else if (a.type === 'fracture') {
            let rotation: [number, number, number] = [0, 0, 0];
            if (a.normal) {
              const normal = new THREE.Vector3(a.normal.x, a.normal.z, -a.normal.y);
              const up = new THREE.Vector3(0, 1, 0);
              const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
              const euler = new THREE.Euler().setFromQuaternion(quaternion);
              rotation = [euler.x, euler.y, euler.z];
            }
            return (
              <group key={a.id} position={[posX, posY, posZ]}>
                <mesh rotation={rotation}>
                  <boxGeometry args={[a.size, 0.05, a.size]} />
                  <meshBasicMaterial 
                    color={isSelected ? "#ec4899" : "#d946ef"} 
                    transparent 
                    opacity={isSelected ? 0.7 : 0.4} 
                    wireframe={!isSelected}
                  />
                </mesh>
                <pointLight color="#d946ef" intensity={isSelected ? 2.0 : 0.5} distance={8} />
              </group>
            )
          }
          return null;
        })}

        {gpsCenter && o.showMapboxTerrain && o.mapboxToken && (
          <group 
            ref={terrainRef} 
            position={[
              o.surfaceOffset?.x || 0, 
              o.surfaceOffset?.z || 0, 
              -(o.surfaceOffset?.y || 0)
            ]}
          >
            <React.Suspense fallback={null}>
              <MapboxTerrain 
                lat={gpsCenter.lat}
                lng={gpsCenter.lng}
                radius={o.mapboxRadius || 2.0}
                zoom={o.mapboxZoom || 13}
                opacity={o.mapboxOpacity || 0.5}
                visible={o.showMapboxTerrain}
                mapboxToken={o.mapboxToken}
              />
            </React.Suspense>
          </group>
        )}

        {o.terrainCalibrationMode && o.showMapboxTerrain && terrainRef.current && (
          <TransformControls 
            ref={transformControlsRef}
            object={terrainRef.current} 
            mode="translate" 
            onChange={handleTerrainTransform}
          />
        )}
      </group>

      <AutoFit cave={cave} trigger={fitTrigger} offset={o.caveCalibrationOffset} />

      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ef4444', '#84cc16', '#3b82f6']} labelColor="white" labels={['V', 'H', 'J']} />
      </GizmoHelper>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!isLargeModel}
        dampingFactor={isLargeModel ? 0.2 : 0.05}
        onStart={handleCameraMoveStart}
        onEnd={handleCameraMoveEnd}
        onChange={handleCameraChange}
      />
      <CameraMonitor controlsRef={controlsRef} onUpdate={onCameraUpdate} />
    </Canvas>
  )
}

export default CaveViewerNextGen
