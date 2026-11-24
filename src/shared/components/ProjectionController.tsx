import React, { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import type { ParsedCave, ViewPreset } from '@shared/types'

export interface ProjectionControllerProps {
  projection: 'perspective' | 'orthographic'
  cave: ParsedCave
  controlsRef?: React.RefObject<any>
}

/**
 * Calculates optimal distance and frustum so that the 3D model fills ~85% of screen.
 */
export function calculateFitParams(
  bounds: ParsedCave['bounds'],
  size: { width: number; height: number },
  fovDeg: number = 55,
  viewType: ViewPreset | 'fit' | 'reset' | 'current' = 'iso'
) {
  const sx = bounds.size.x || 1
  const sy = bounds.size.y || 1
  const sz = bounds.size.z || 1
  
  let radius = Math.sqrt(sx * sx + sy * sy + sz * sz) / 2
  if (viewType === 'top' || viewType === 'bottom') {
    radius = Math.sqrt(sx * sx + sy * sy) / 2
  } else if (viewType === 'front' || viewType === 'back') {
    radius = Math.sqrt(sx * sx + sz * sz) / 2
  } else if (viewType === 'side' || viewType === 'east') {
    radius = Math.sqrt(sy * sy + sz * sz) / 2
  }
  radius = Math.max(radius, 0.5)

  const aspect = Math.max(size.width, 1) / Math.max(size.height, 1)
  const fovRad = (fovDeg * Math.PI) / 180
  const halfFov = fovRad / 2

  // Perspective distance to fill ~85% of viewport
  const distV = radius / Math.sin(halfFov)
  const distH = radius / (Math.sin(halfFov) * aspect)
  const fitDist = Math.max(distV, distH) * 1.12

  // Orthographic half-frustum
  const frustumHalf = (radius / Math.min(aspect, 1.0)) * 1.12

  return { radius, fitDist, frustumHalf, aspect }
}

/**
 * ProjectionController manages switching between PerspectiveCamera and OrthographicCamera
 * across both Engine v1 and Engine v2 (NextGen). It preserves camera position, target,
 * and handles view preset events ('cave-set-view' for Plan, Profile, Section, and Isometric).
 */
export function ProjectionController({ projection, cave, controlsRef }: ProjectionControllerProps) {
  const { camera, set, get, size, controls: contextControls, invalidate } = useThree() as any
  const viewTween = useRef<gsap.core.Tween | null>(null)

  useEffect(() => () => { viewTween.current?.kill() }, [])

  // Switch between Perspective and Orthographic camera
  useEffect(() => {
    if ((projection === 'orthographic') === (camera instanceof THREE.OrthographicCamera)) return

    const currentControls = controlsRef?.current || contextControls
    const target = currentControls?.target
      ? currentControls.target.clone()
      : new THREE.Vector3(cave.bounds.center.x, cave.bounds.center.z, -cave.bounds.center.y)

    const currentPos = camera.position.clone()
    const dir = currentPos.clone().sub(target)
    const dist = Math.max(dir.length(), 1)

    const b = cave.bounds
    const { frustumHalf, aspect } = calculateFitParams(b, size, camera.fov || 55)
    const far = Math.max(b.size.x, b.size.y, b.size.z) * 35 + 5000

    if (projection === 'orthographic') {
      const ortho = new THREE.OrthographicCamera(
        -frustumHalf * aspect, frustumHalf * aspect,
        frustumHalf, -frustumHalf,
        0.01, far
      )
      ortho.position.copy(currentPos)
      ortho.up.copy(camera.up)
      ortho.lookAt(target)
      ortho.updateProjectionMatrix()
      set({ camera: ortho })

      if (currentControls) {
        currentControls.object = ortho
        if (currentControls.target) currentControls.target.copy(target)
        currentControls.update()
      }
    } else {
      const persp = new THREE.PerspectiveCamera(55, aspect, 0.1, far)
      persp.position.copy(currentPos)
      persp.up.copy(camera.up)
      persp.lookAt(target)
      persp.updateProjectionMatrix()
      set({ camera: persp })

      if (currentControls) {
        currentControls.object = persp
        if (currentControls.target) currentControls.target.copy(target)
        currentControls.update()
      }
    }
    invalidate()
  }, [projection, camera, cave, set, size, contextControls, controlsRef, invalidate])

  // Keep orthographic frustum in sync with window resize / distance changes without continuous loop
  useFrame(() => {
    if (projection !== 'orthographic') return
    if (!(camera instanceof THREE.OrthographicCamera)) return
    const currentControls = controlsRef?.current || contextControls
    const target = currentControls?.target ?? new THREE.Vector3()
    const dist = Math.max(camera.position.distanceTo(target), 1)
    const halfFov = (55 * Math.PI) / 180 / 2
    const frustumHalf = dist * Math.tan(halfFov)
    const aspect = size.width / Math.max(size.height, 1)
    if (Math.abs(camera.top - frustumHalf) > 0.001 || Math.abs(camera.right - frustumHalf * aspect) > 0.001) {
      camera.left = -frustumHalf * aspect
      camera.right = frustumHalf * aspect
      camera.top = frustumHalf
      camera.bottom = -frustumHalf
      camera.updateProjectionMatrix()
    }
  })

  // Listen to standard view events (top/plan, front/profile, side/section, iso, and fit)
  useEffect(() => {
    const handleSetView = (e: any) => {
      const viewType = e?.detail?.view || 'iso'
      const currentControls = controlsRef?.current || contextControls
      const b = cave.bounds
      const target = currentControls?.target
        ? currentControls.target.clone()
        : new THREE.Vector3(b.center.x, b.center.z, -b.center.y)

      const { fitDist, frustumHalf, aspect } = calculateFitParams(b, size, camera.fov || 55, viewType)
      const endPos = new THREE.Vector3()
      const endUp = new THREE.Vector3(0, 1, 0)

      switch (viewType) {
        case 'top': // Pôdorys (Plan view from above, North = -Z -> screen UP)
          endPos.set(target.x, target.y + fitDist, target.z)
          endUp.set(0, 0, -1)
          break
        case 'bottom': // Pohľad zdola (North stays screen UP, image is mirrored E-W)
          endPos.set(target.x, target.y - fitDist, target.z)
          endUp.set(0, 0, -1)
          break
        case 'front': // Pozdĺžny profil (South -> North)
          endPos.set(target.x, target.y, target.z + fitDist)
          endUp.set(0, 1, 0)
          break
        case 'side': // Priečny profil (West -> East)
          endPos.set(target.x - fitDist, target.y, target.z)
          endUp.set(0, 1, 0)
          break
        case 'east': // Pohľad z východu (East -> West)
          endPos.set(target.x + fitDist, target.y, target.z)
          endUp.set(0, 1, 0)
          break
        case 'back': // Pohľad zo severu (North -> South)
          endPos.set(target.x, target.y, target.z - fitDist)
          endUp.set(0, 1, 0)
          break
        case 'fit': // Zoom to fit keeping current camera angle
          {
            const curDir = camera.position.clone().sub(target).normalize()
            if (curDir.lengthSq() < 0.001) curDir.set(0.707, 0.577, 0.707)
            endPos.copy(target).addScaledVector(curDir, fitDist)
            endUp.copy(camera.up)
          }
          break
        case 'iso': // 3D Axonometria / Izometria
        case 'reset':
        default:
          endPos.set(target.x + fitDist * 0.707, target.y + fitDist * 0.577, target.z + fitDist * 0.707)
          endUp.set(0, 1, 0)
          break
      }

      if (camera instanceof THREE.OrthographicCamera) {
        camera.left = -frustumHalf * aspect
        camera.right = frustumHalf * aspect
        camera.top = frustumHalf
        camera.bottom = -frustumHalf
        camera.zoom = 1
        camera.updateProjectionMatrix()
      }

      gsap.killTweensOf(camera.position)
      viewTween.current?.kill()
      const position = camera.position.clone()
      // A projection switch can replace the camera while this preset is animating.
      const applyPosition = () => {
        const state = get()
        const activeCamera = state.camera
        activeCamera.position.copy(position)
        activeCamera.up.copy(endUp)
        activeCamera.lookAt(target)
        const activeControls = controlsRef?.current || state.controls
        activeControls?.update()
        invalidate()
      }
      viewTween.current = gsap.to(position, {
        x: endPos.x,
        y: endPos.y,
        z: endPos.z,
        duration: 0.65,
        ease: 'power2.out',
        onUpdate: applyPosition,
        onComplete: applyPosition
      })
    }

    window.addEventListener('cave-set-view', handleSetView)
    return () => window.removeEventListener('cave-set-view', handleSetView)
  }, [cave, camera, get, contextControls, controlsRef, size, invalidate])

  return null
}
