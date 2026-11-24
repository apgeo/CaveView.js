# 🛠️ LochViewer - Developer & Mathematical Specification (v2.5.11)

*Comprehensive technical architecture, mathematical formulations, shader models, and Web Worker data flows for developers and contributors.*

### Contour Rendering 60 FPS Performance Architecture (v2.5.11)

1. **DOM Overlay Motion Gate (`ContourLabels`)**:
   - **Root Cause**: Each elevation contour label previously instantiated an independent `@react-three/drei` `<Html>` component. On steep or large terrains (e.g., 500 m DMR 5.0), this generated 100–400 active DOM elements. During camera orbit and panning, Drei ran 3D-to-2D matrix unprojections and DOM inline transform modifications (`style.transform`) on every frame (16.6 ms). Combined with CSS `backdropFilter: blur` and per-label `useFrame` distance calculations, this caused severe layout thrashing and dropped frame rates to 15–25 FPS.
   - **Motion Gate (`isMoving`)**:
     ```typescript
     const ContourLabels = React.memo(({ surface, majorInterval, color, opacity, isMoving }: any) => {
       if (isMoving) return null;
       // ... point extraction
     });
     ```
     During continuous camera navigation (`isMoving === true`), DOM label projection is completely deferred (0 DOM operations). Once motion ceases (180 ms idle threshold), labels cleanly remount.
   - **`ContourLabelItem` Simplification**:
     Removed per-item `useFrame` hook, removed expensive GPU `backdropFilter: blur(2px)`, and eliminated CSS transition fight. Perspective scaling is handled directly by Drei's native `distanceFactor={85}` alongside hardware GPU layer promotion (`willChange: transform`). Label budget is constrained to a maximum of 36 globally and 3 per elevation contour.

2. **Shared Lightweight Contour Material (`MeshBasicMaterial` in `TerrainMesh`)**:
   - **Root Cause**: Previously, each terrain tile instantiated its own `MeshStandardMaterial` ($N$ tiles = $N$ compilations). Standard materials performed full PBR lighting calculations (4 lights, normal matrices, diffuse/specular evaluation) across 500,000 triangles, only for the `#include <dithering_fragment>` injection to overwrite the fragment color with an unlit line color. Face culling was also disabled (`DoubleSide`).
   - **Consolidated Pipeline**:
     Lifted material instantiation to `TerrainMesh` as a single shared `MeshBasicMaterial`:
     - **Hardware Culling**: `side: THREE.FrontSide` enables GPU triangle face culling.
     - **Zero Lighting Overhead**: `ShaderLib.basic` excludes all lighting loops and normal matrices.
     - **Single Instance**: 1 shader compile instead of $N$, eliminating material swapping during the WebGL tile draw loop.

---

### Baltic Sea Datum (Bpv), Slovak Quasigeoid Interpolator & Cave CRS Detection (v2.5.10)

1. **Mathematical Model of Slovak Quasigeoid (DMQSK2014-E / DVRM05, `slovakiaQuasigeoid.ts`)**:
   - **Physical Context**: The official Slovak INSPIRE WCS (`inspirews.skgeodesy.sk`) delivers DMR 5.0 in coordinate system `EPSG:3046` with ellipsoidal heights $h$ referenced to the GRS80 ellipsoid (ETRS89). Cave survey data in Slovakia and Central Europe consistently reference normal heights above Baltic sea level (Kronstadt datum, Bpv).
   - **Height Reduction Equation**:
     $$H_{\text{Bpv}} = h_{\text{ETRS89}} - \zeta(\varphi, \lambda)$$
     where $\zeta(\varphi, \lambda)$ is the quasigeoidal undulation above the GRS80 ellipsoid ($36.0\ \text{m} \le \zeta \le 46.5\ \text{m}$ across Slovakia; $\zeta \approx 41.6\ \text{m}$ in Slovak Karst).
   - **Embedded Quasigeoid Grid**:
     Grid covers Slovakia: $\varphi \in [47.5^\circ, 49.7^\circ]$ (step $\Delta\varphi = 0.05^\circ$, 45 rows), $\lambda \in [16.7^\circ, 22.7^\circ]$ (step $\Delta\lambda = 0.05^\circ$, 121 columns), derived from the official GKÚ SR geodetic model (`sk_gku_Slovakia_ETRS89h_to_Baltic1957.tif`).
   - **Bilinear Interpolation**:
     For coordinates $(\varphi, \lambda)$ with cell indices $i = \lfloor (\varphi - 47.5) / 0.05 \rfloor$, $j = \lfloor (\lambda - 16.7) / 0.05 \rfloor$:
     $$u = \frac{\varphi - \varphi_i}{0.05}, \quad v = \frac{\lambda - \lambda_j}{0.05}$$
     $$\zeta(\varphi, \lambda) = (1-u)(1-v)\zeta_{i,j} + u(1-v)\zeta_{i+1,j} + (1-u)v\zeta_{i,j+1} + uv\zeta_{i+1,j+1}$$
   - **Precision**: Mean interpolation error $< 1.5\ \text{cm}$ compared to the national full-resolution GeoTIFF grid, with zero network requests and zero latency.
   - **Surface Elevation Application (`dmrDownloader.ts`)**:
     When `heightSystem === 'bpv'` (default):
     $$\forall i, j: \quad z'_{i,j} = z_{i,j} - \zeta_{\text{ref}}$$
     $$\text{bounds.minZ}' = \text{bounds.minZ} - \zeta_{\text{ref}}, \quad \text{bounds.maxZ}' = \text{bounds.maxZ} - \zeta_{\text{ref}}$$

2. **Cave Survey CRS Frame Detection (`caveCoordinateSystem.ts`)**:
   - **Heuristic Coordinate Range Classification**:
     - **S-JTSK (EPSG:5514 / EPSG:8352)**: Stations in Therion `.lox` files reside in Křovák projection ($X < -150\,000\ \text{m}$, $Y < -900\,000\ \text{m}$).
     - **Meridian Convergence $\gamma$**:
       Křovák oblique conformal conic projection has a convergence angle $\gamma$ between grid north and geographic true north:
       $$\gamma \approx \Delta\lambda \cdot \sin(\varphi_0) \approx -2.8^\circ \text{ to } -3.5^\circ$$
       Affine transformation in `dmrDownloader.ts` via `proj4` seamlessly incorporates this rotation angle:
       $$\mathbf{p}_{\text{JTSK}} = \mathbf{T} \cdot \mathbf{p}_{\text{UTM}}$$
     - **GPS UTM 34N/35N**: $X \in [100\,000, 900\,000]$, $Y \in [4\,700\,000, 5\,600\,000]$. DMR 5.0 maps 1:1 onto the metric UTM frame.
     - **WGS-84 (degrees)**: Identified by latitude $\varphi \in [47^\circ, 50^\circ]$, $\lambda \in [16^\circ, 23^\circ]$ and dynamically reprojected to UTM 34N.
     - **Local Relative Survey** (e.g., centered around $[0, 0, Z]$): If an entrance or fixed station possesses GPS metadata, the downloaded DMR 5.0 surface is anchored at $\mathbf{t} = (E_{\text{entrance}}, N_{\text{entrance}})$, aligning the unreferenced cave survey with regional terrain relief.

---

### UI Architecture: Unified Single-Row Contours & Bottom Texture Placement (v2.5.9)

1. **Unified Single-Row Contour Controls (`SurfaceSection.tsx`)**:
   - **Compact Inline Layout**: The `Contours (10m)` item in `primary` integrates the label, a ColorPicker for base contours (`opts.contourColor`, default green `#00ff00`), a ColorPicker for major index contours (`opts.contourColor10`, default red `#ff0000`), and the toggle switch (`opts.showContours`).
   - **Deduplication**: Redundant rows labeled `t('terrain.contours')` were removed from `details`, leaving only the dedicated contour elevation label toggle (`opts.showContourLabels`).
   - **Texture Placement**: `Texture (JPG/PNG)` (`terrain.texture`) and its projection sub-options are positioned as the terminating items in both primary toggles and details.

2. **`ColorPicker` Style Extension (`controls.tsx`)**:
   - Added optional `style?: React.CSSProperties` typing with default `marginLeft: 8`, allowing inline consumers to override margins (e.g. `style={{ marginLeft: 2 }}`) for dense inline swatches.

---

### UI Architecture: Dedicated Surface Tab, CAD Styling & Section Documentation Registry (v2.5.8)

1. **Separation of Cave (`cave`) and Surface (`surface`) Sidebar Tabs**:
   - **Navigation Categories (`reveal.ts`)**: Expanded `NavCategory` union type to `'project' | 'view' | 'cave' | 'surface' | 'analysis' | 'system'`.
   - **Backward Compatibility**: `revealInSidebar` automatically normalizes legacy `'layers'` requests to `'cave'`. In `NavigationSidebar`, the cave section evaluates `sections.cave ?? sections.layers`, ensuring 100% backward compatibility with existing tests and deep links.
   - **Toolbar Integration (`ViewerToolbar.tsx`)**: Centerline, splays, walls, and stations reveal the `'cave'` category. Surface toggle, surface image menu, and DMR 5.0 WCS downloads reveal the `'surface'` category.

2. **Section Documentation Registry (`sectionDocRegistry.ts`) & Info Dialog (`SectionInfoModal.tsx`)**:
   - **Centralized Dictionary**: Each sidebar section has bilingual metadata defined in `sectionDocRegistry.ts`:
     ```typescript
     export interface SectionDoc {
       title: string;
       badge?: string;
       desc: string;
       bullets: string[];
       helpTab?: 'basics' | 'nav' | 'splays' | 'measuring' | 'clipping' | 'lidar' | 'terrain' | 'share';
     }
     ```
   - **Contextual Info Icon (`SidebarAccordion.tsx`)**: The component automatically mounts a `.cad-info-btn` with the `ℹ️` icon whenever `infoTopic` and `lang` are provided.
   - **Accessibility & Modal Interface**: Clicking opens `SectionInfoModal` with an amber title header, CAD badge, key feature bullets, and a direct button to open the corresponding chapter in the global `HelpModal`.

3. **Geolocated Language Detection & Language Bar (`i18n/index.ts`, `ViewerToolbar.tsx`)**:
   - `getBrowserLanguage()` resolves user language in priority order:
     1. Stored value in `localStorage.getItem('cv-language')`.
     2. Client timezone inspection via `Intl.DateTimeFormat().resolvedOptions().timeZone`: matching `Europe/Bratislava` or `Europe/Prague` returns `'sk'`.
     3. Browser language check `navigator.language`: starting with `sk` or `cs` returns `'sk'`.
     4. Defaults to `'en'` for all other regions.
   - A dedicated `SK | EN | DE | FR` language bar in the top-right toolbar updates language reactively and persists selections to `localStorage`.

4. **Unified Amber CAD Styling**:
   - Section headers styled in amber `#f59e0b` matching `Dmr5DownloadPanel`.
   - Full-width tactile action buttons (`btn-fullwidth`) with high-contrast outlines for reliable touch interaction in fieldwork conditions.

---

### DMR 5.0 Surface Download & Generation (WCS 2.0.1) (2.5.7)

1. **OGC WCS 2.0.1 Protocol & INSPIRE Coverage (`dmrDownloader.ts`)**:
   - **National GKÚ SR Server**: `https://inspirews.skgeodesy.sk/geoserver/el/ows`
   - **Elevation Layer**: `el__EL.GridCoverage` (LiDAR DMR 5.0 Slovakia in 1 m resolution, 100% nationwide coverage).
   - **Coordinate Reference System**: ETRS89 / UTM Zone 34N (`EPSG:3046` / `EPSG:25834`, GRS80 ellipsoid).
   - **Output Format**: `image/tiff;application=geotiff` (32-bit IEEE Float raster).
   - **KVP Subsetting Request**:
     $$\text{subset}=\text{N}(N_{min}, N_{max})\quad\&\quad\text{subset}=\text{E}(E_{min}, E_{max})$$

2. **Bounding Box Calculation (`calculateDmr5Bounds`) & World File Generation (`generateTfwContent`)**:
   - For given cave entrance/center GPS $(\varphi, \lambda)$ and chosen extent $L$ (presets $500, 1000, 2000\ \text{m}$ or custom extent in $500\ \text{m}$ increments):
     $$(E_c, N_c) = \text{proj4}(\text{WGS84}, \text{UTM34}, [\lambda, \varphi])$$
     $$E_{min} = \text{round}(E_c - L/2), \quad E_{max} = E_{min} + L$$
     $$N_{min} = \text{round}(N_c - L/2), \quad N_{max} = N_{min} + L$$
   - The standard 6-line ESRI World File (`.tfw`) defines pixel scale and top-left pixel center:
     $$\text{Line 1}: 1.0, \quad \text{Line 2}: 0.0, \quad \text{Line 3}: 0.0, \quad \text{Line 4}: -1.0$$
     $$\text{Line 5}: E_{min} + 0.5, \quad \text{Line 6}: N_{max} - 0.5$$

3. **Geodetic Alignment with Cave Survey Frame (`createDmr5Surface`)**:
   - **Cave in UTM 34N**: Direct alignment `surface.centerOffset = cave.centerOffset`.
   - **Cave in S-JTSK**: Rigorous surface calibration transform via `proj4(UTM34_DEF, SJTSK_DEF, ...)`.
   - **Cave in Local Survey Coordinates**: When entrance GPS $(\varphi_{ent}, \lambda_{ent}) \rightarrow (E_{ent}, N_{ent})$ and local survey coordinates $(x_{ent}, y_{ent})$ are known:
     $$E_{origin} = E_{ent} - x_{ent}, \quad N_{origin} = N_{ent} - y_{ent}$$
     $$X_{origin, calib} = E_{min} - E_{origin}, \quad Y_{origin, calib} = N_{max} - N_{origin}$$
     The generated surface aligns seamlessly with zero offset relative to the entrance.
   - **Texture & Layer Support**: Generates an immediate `sjtskBbox` on the created surface, enabling instant overlay of ZBGIS Orthophoto, DMR shaded relief, and geological maps.

### Shortest 3D Distance to Surface (Minimum Rock Cover), GPS & ZBGIS LiDAR (2.5.5)

1. **Mathematical formulation and reference point hierarchy (`findReferenceStation`)**:
   - **Priority 1 (Cave Entrance)**: Station flagged with `isEntrance === true` or named with entrance keywords (`vchod`, `vstup`, `entrance`, `eingang`, `trou`, `boca`, `zavrt`). Reference altitude is $Z_{entrance}$. If GPS is present (`gps !== null`), type is `'entrance_gps'`, otherwise `'entrance'`.
   - **Priority 2 (Lowest-numbered station)**: If the cave defines neither entrance nor GPS, surface stations are excluded (names containing `surface`, `povrch`, `teren`, `gps`, `fix`, or connected only to segments of `type === 'surface'`). The remaining underground station with the lowest numeric identifier (e.g. 0, 1, 2... or lowest index `idx`) is selected. Type is `'lowest_station'`.
   - **Denivelation from entrance / reference point**:
     $$\Delta Z_{entrance} = Z_{point} - Z_{ref}$$
     Positive values ($\Delta Z > 0$) indicate locations above entrance level (chimneys, upper galleries); negative values ($\Delta Z < 0$) indicate depths below entrance level.

2. **Depth below surface and orthogonal DTM sampling (`sampleSurfaceElevationAt`)**:
   - In 3D space with cave calibration offset $\mathbf{o}_{cave}$ and surface offset $\mathbf{o}_{surf}$, the horizontal sampling coordinate directly overhead is:
     $$X_{DTM} = X_{cave} + o_{cave, x} - o_{surf, x}$$
     $$Y_{DTM} = Y_{cave} + o_{cave, y} - o_{surf, y}$$
   - Sampling the DTM elevation grid yields raw altitude $Z_{raw} = \text{sampleDtmAt}(X_{DTM}, Y_{DTM})$. Real-world surface altitude is:
     $$Z_{surface} = Z_{raw} + o_{surf, z}$$
   - Vertical depth below surface:
     $$\text{distToSurf} = Z_{surface} - (Z_{point} + o_{cave, z})$$

3. **True shortest 3D distance to surface (`findClosestSurfacePoint`) and GPS (`worldToWgs84`)**:
   - For a cave survey point $\mathbf{Q} = (X_q, Y_q, Z_q)$ and a surface mesh represented by a triangulated DTM grid, find point $\mathbf{P}^* \in \mathcal{S}_{DTM}$ that minimizes 3D Euclidean distance:
     $$d_{3D}^* = \min_{\mathbf{P} \in \mathcal{S}_{DTM}} \|\mathbf{Q} - \mathbf{P}\|$$
   - **Search space bounding**: Because vertical depth $d_{vert} = |Z_{surface} - Z_q|$ is known, the shortest distance satisfies $d_{3D}^* \le d_{vert}$. The horizontal search radius is bounded by $R_{max} = d_{vert}$, corresponding to a compact cell window $[c_{min}, c_{max}] \times [r_{min}, r_{max}]$ via inverse DTM calibration transform.
   - **Exact point-to-triangle projection (Christer Ericson algorithm)**: Each quad cell is split into triangles $(V_{00}, V_{10}, V_{01})$ and $(V_{10}, V_{11}, V_{01})$. Point projection operates without heap allocations using Voronoi feature regions (vertices, edges, interior).
   - **Geodetic conversion to WGS84 (`worldToWgs84`)**:
     UTM or S-JTSK coordinates are converted directly via standard projections. In local cave coordinates with reference station GPS $(\varphi_{ref}, \lambda_{ref})$, metric offsets $(\Delta x, \Delta y)$ are projected onto the WGS84 ellipsoid:
     $$M_{\varphi} = 111132.92 - 559.82 \cos(2\varphi_{ref}) + 1.175 \cos(4\varphi_{ref})$$
     $$N_{\lambda} = 111412.84 \cos(\varphi_{ref}) - 93.5 \cos(3\varphi_{ref})$$
     $$\varphi_{surf} = \varphi_{ref} + \frac{\Delta y}{M_{\varphi}}, \quad \lambda_{surf} = \lambda_{ref} + \frac{\Delta x}{N_{\lambda}}$$
   - **Interactive Map URL formatting**:
     - Google Maps: `https://maps.google.com/?q={lat},{lon}`
     - ZBGIS LiDAR: `https://zbgis.skgeodesy.sk/mapka/sk/teren/identification/point/{lat},{lon}?pos={lat},{lon},18` (activates exact point identification pin/dialog with zoom 18 high-detail DMR 5.0)

4. **3D visualization (`SurfaceDepthVisual`)**:
   - Rendered in centered survey local space within the cave group.
   - Point in cave: $\mathbf{p}_{station} = (pos.x, pos.z, -pos.y)$.
   - Surface point directly above: $\mathbf{p}_{vert} = (pos.x, pos.z + \text{distToSurf}, -pos.y)$.
   - Closest 3D surface point: $\mathbf{p}_{closest} = (closestSurfPos.x, closestSurfPos.z, -closestSurfPos.y)$.
   - **Shortest 3D line**: prominent amber/orange dashed line (`color="#f59e0b"`, `lineWidth={3.8}`) with double target marker and scale label.
   - **Vertical line**: fine cyan dashed line (`color="#38bdf8"`, `lineWidth={1.8}`) with overhead elevation label.
   - **Graceful coincidence**: When $\|\mathbf{p}_{vert} - \mathbf{p}_{closest}\| < 0.25\text{ m}$ (flat terrain overhead), a single consolidated amber line is rendered to eliminate visual overlap and z-fighting.
   - 100% parity across Engine v1 (`CaveViewer3D`) and Engine v2 (`CaveViewerNextGen`).

### Station selection, measurement and quick toolbar (2.4.34)

`StationLabel.pos`, `SelStation.pos` and the optional `StationClick` point use **centered survey XYZ (Z-up)**. Scene placement is `T(p) = (x + cx, z + cz, -y - cy)`, with calibration `c`; `sceneToSurvey` performs its inverse exactly once for v2 hits. Original source coordinates are `p + cave.centerOffset`. A picked surface is inverse-transformed into the cave group's local frame before rendering. Distance/polygon calculations use that same local frame, so markers, lines and readouts agree even across calibrated cave/terrain geometry.

`SurveyPointPicker` projects enabled survey/splay targets on a native captured click, accepts the closest candidate within 10 CSS pixels (frontmost depth breaks screen-distance ties) and consumes the event before mesh handlers. Pointer movement over 5 px marks an orbit gesture, not a pick. No per-frame picking, extra GPU targets or worker protocol changes are introduced. v2 restricts free picks to the point-cloud group, ignores helpers and recovers exact vertices from `Intersection.index` and `matrixWorld`. Mesh/terrain selection occurs on click rather than pointer-down.

`measureDistance` computes `d3 = hypot(dx,dy,dz)`, `dXY = hypot(dx,dy)`, slope `atan2(dz,dXY)` and grid azimuth `atan2(dx,dy) mod 360°`. For ordered planar vertices, `measurePolygon` uses `A = |Σ((pi-p0) × (pi+1-p0))|/2` and closed 3D perimeter; non-planar results are vector/projected areas, not triangulated mesh surface areas. Tectonic orientation still uses the first three vertices. Depth is `DTM(X+caveOffsetXY-surfaceOffsetXY)+surfaceOffsetZ-Z-caveOffsetZ` only when covered by finite DTM samples.

LOX metadata retains `isFixed` (`m_flags & 0x04`) and `qualifiedName` (`station@survey.parent`), resolving survey parents with cycle protection. `ViewerOptions` adds optional `showFixedStations`, `showCenterline` (undefined means visible) and `stationLabelMode: off|short|full|altitude|gps`; legacy name/altitude switches clear the explicit mode. GPS mode is skipped if no station has GPS.

Shared URLs preserve these options as `cline=0`, `fixed=1` and `labels=off|short|full|altitude|gps`; unknown label values are ignored. Both Canvas wrappers isolate their CSS stacking contexts so projected HTML labels cannot cover measurement panels or other application controls.

View presets animate an independent position vector and apply each update to the live R3F camera. Switching projection can replace the camera without discarding the pending plan/elevation animation; replacing a preset or unmounting cancels its tween. Toolbar Plan cycles `top`/`bottom`, Elevation cycles `front` (from south, camera at +Z) → `east` (+X) → `back` (−Z) → `side` (−X); all are `ViewPreset` values from `@shared/types`. `bottom` places the camera at −Y with `up = (0,0,−1)`, so north stays screen-up and east/west are mirrored. On slow software-GL frames GSAP lag smoothing stretches the 0.65 s tween, so E2E polls allow 20 s.

`ViewerToolbar` reuses typed navigation callbacks and existing Lucide SVGs; its image dialog and layer-restore snapshots are local and do not update App/Canvas. Layer actions intentionally update shared options. Surface/wall quick toggles snapshot their representations, hide all and restore on re-enable. Reload reparses retained original bytes through the existing parser worker. `MeasurementOverlay` renders transparent, depth-independent lines in a late render-order group and noninteractive A/B HTML markers. No new runtime dependency.

### Unified navigation (2.4.33)

`src/shared/components/NavigationSidebar/` contains the sidebar shell, native-button accordions, typed bindings and Project/View/Layers/Surface/Analysis/System sections. Surface is a subgroup of Layers, not a sixth navigation category. Cave/surface calibration lives only there; WebM recording/duration lives only in Project → Sharing and available exports.

`App` retains dataset state, `ViewerOptions`, workers and scene-affecting handlers. `NavigationBindings` is the typed UI boundary; sections consume only their required fields. The shell owns active category, desktop collapse and mobile drawer state; each accordion owns its expansion state. These local updates do not render App or its Canvas sibling. Changing a viewer option intentionally updates the renderer; resizing the viewport after collapse can still cause a renderer resize/frame.

Sections stay mounted but hidden when inactive, preserving file input refs and accordion settings. Primary switches stay outside collapsed details; SDF details require its enabled flag, and LiDAR controls retain the PLY guards. At ≤768 px the drawer traps Tab/Shift+Tab, makes scene siblings inert, handles Escape and restores focus. Share/help actions dismiss the drawer before opening external dialogs. The `navigation` translation namespace covers SK/EN/FR/DE. No worker protocols, geometry algorithms or dependencies change.

---

## 📑 Table of Contents
1. [System Architecture & Dual-Engine Architecture](#1-system-architecture--dual-engine-architecture)
2. [Mathematical Formulations & Geodesy](#2-mathematical-formulations--geodesy)
3. [Volumetric Reconstruction & Signed Distance Fields (Splay SDF)](#3-volumetric-reconstruction--signed-distance-fields-splay-sdf)
4. [Structural Geology & Tectonics Formulation (Dip & Strike)](#4-structural-geology--tectonics-formulation-dip--strike)
5. [Camera Projections & Auto Zoom-to-Fit Algorithm](#5-camera-projections--auto-zoom-to-fit-algorithm)
6. [Post-Processing Shaders (Eye-Dome Lighting)](#6-post-processing-shaders-eye-dome-lighting)
7. [Parallel Web Workers & Zero-Copy Transferable Objects](#7-parallel-web-workers--zero-copy-transferable-objects)
8. [URL Serialization Schema & State Hydration](#8-url-serialization-schema--state-hydration)
9. [Stitch CAD Design System & CSS Tokens](#9-stitch-cad-design-system--css-tokens)
10. [Performance Optimization, React Render Decoupling & WebGL Render Loop](#10-performance-optimization-react-render-decoupling--webgl-render-loop)

---

## 1. System Architecture & Dual-Engine Architecture

LochViewer is built upon **React 18**, **Three.js**, and **React-Three-Fiber**, implementing a specialized **Dual-Engine** pipeline:

```
                          ┌─────────────────────────────┐
                          │     Input File / URL        │
                          │ (.lox, .ply, .3d, .plt, STL)│
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │     parser.worker.ts        │
                          │   (Parallel Web Worker)     │
                          └──────────────┬──────────────┘
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
         ┌─────────────────────────────┐   ┌─────────────────────────────┐
         │     ENGINE v1 (Standard)    │   │     ENGINE v2 (NextGen)     │
         │  src/v1/CaveViewer3D.tsx    │   │ src/v2/CaveViewerNextGen.tsx│
         ├─────────────────────────────┤   ├─────────────────────────────┤
         │ • LOX, 3D, PLT, STL meshes  │   │ • Massive PLY Point Clouds  │
         │ • Therion Scraps polygons   │   │ • Octree LOD partitioning   │
         │ • Splay SDF Marching Cubes  │   │ • WebGL EDL & point shaders │
         │ • Three.js Mesh pipeline    │   │ • 60 FPS for > 10M points   │
         └──────────────┬──────────────┘   └──────────────┬──────────────┘
                        │                                 │
                        └────────────────┬────────────────┘
                                         ▼
                          ┌─────────────────────────────┐
                          │   Shared UI & Analysis HUD  │
                          │  (Measurement, Clips, HUD)  │
                          └─────────────────────────────┘
```

### 1.2 Engine Dispatching & LiDAR Dataset Isolation (`isPlyLidarData`)
To prevent crosstalk between Engine v1 and v2, a strict classification utility is enforced:
- `isPlyLidarData(ext, cave)`: Returns `true` exclusively for `.ply` datasets or explicit point clouds (`isLiDAR: true` with 0 survey segments).
- **Survey Parsing (`caveParser.ts`)**: For standard survey files (`.lox`, `.3d`, `.plt`), `pointCount` is strictly 0. Survey stations are never misinterpreted as point cloud points.
- **UI Guarding**: The `LiDAR NEXTGEN` toggle switch, `LiDAR editing` panel, `LiDAR anomaly detector`, and stroke overlay are gated behind `isPlyLidar === true`.
- **Failsafe**: When non-PLY survey files are loaded, the engine state is immediately forced to `v1` even if `?eng=v2` was passed in the URL.

---

## 2. Mathematical Formulations & Geodesy

### 2.1 Floating-Point Jitter Elimination (Centroid Subtraction)
Cartographic coordinate reference systems (e.g., S-JTSK) use large coordinates ($X \approx -500,000\ \text{m}$, $Y \approx -1,200,000\ \text{m}$). Standard GPUs calculate in 32-bit floating point numbers (`float32`), with only 24 bits of mantissa precision (~7 decimal digits). Passing global coordinates directly to WebGL vertex shaders results in visual polygon tearing and vertex jittering.

**Solution**:
The parsing worker computes the model centroid $P_{\text{offset}} = (x_0, y_0, z_0)$ in 64-bit precision (`float64`). Vertices are transformed into local origin space prior to GPU buffer upload:
$$P_{\text{local}} = P_{\text{world}} - P_{\text{offset}}$$
Global coordinates are only reconstructed for display within UI cards and measurement readouts.

### 2.2 Coordinate Transformations: S-JTSK (EPSG:5514) $\leftrightarrow$ WGS-84 (EPSG:4326) $\leftrightarrow$ UTM
Projection transformations utilize `proj4` configured with Křovák's oblique conformal conic projection parameters:
```ts
const S_JTSK = "+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";
```

---

## 3. Volumetric Reconstruction & Signed Distance Fields (Splay SDF)

Modules `splayWall.worker.ts` and `splayMath.ts` evaluate raw laser splay rays into volumetric Signed Distance Fields (SDF), extracting an isosurface via **Marching Cubes**.

### 3.1 3D Segment Distance (Capsule SDF)
For arbitrary point $P \in \mathbb{R}^3$ and splay ray segment from station $A$ to splay endpoint $B$:
$$h = \text{clamp}\left(\frac{(P - A) \cdot (B - A)}{\|B - A\|^2},\ 0,\ 1\right)$$
Distance to the capsule boundary is:
$$d(P, A, B, r) = \|P - (A + h(B - A))\| - r$$
where $r$ is the virtual capsule radius (`splayCapsuleRadius`).

### 3.2 Smooth Minimum Blending (Polynomial Smooth-Min)
Distance fields are accumulated using continuous polynomial smooth minimum blending with factor $k = \text{splaySmoothK}$:
$$h = \max(k - |d_1 - d_2|,\ 0) / k$$
$$\text{smin}(d_1, d_2, k) = \min(d_1, d_2) - \frac{h^2 \cdot k}{4}$$

### 3.3 Bisector Normal Plane
To avoid ray collisions between adjacent survey stations $A$ and $B$, a bisector plane is erected at midpoint $M = \frac{A + B}{2}$ with normal vector $\vec{u} = \frac{B - A}{\|B - A\|}$. Splay points from station $A$ are rejected if $\vec{u} \cdot (P - M) > 0$.

### 3.4 Narrow-Band Bounding-Box Splatting, 1D Half-Space Scanline Clipping & Trilinear Normals (v2.5.12)
Instead of brute-forcing all tetrahedrons and capsules at every grid voxel ($O(V \times (T + C))$), `splayWall.worker.ts` implements **Narrow-Band Bounding-Box Splatting** ($O(V_{\text{active}})$):
1. **Narrow-Band Active Padding**: Each primitive (tetrahedron or capsule) is splatted only within its voxel AABB expanded by:
   $$\text{bandPad} = \max(0, \text{isovalue}) + k + 1.85 \cdot \Delta v$$
   At each voxel with current distance $\text{cur}$, the effective culling threshold is $\text{cullDist} = \min(\text{bandPad},\ \text{cur} + k)$, since $\text{smin}(\text{cur}, d, k) \equiv \text{cur}$ whenever $d \ge \text{cur} + k$.
2. **Precomputed Tetrahedron Half-Spaces & 1D Scanline Clipping (`precomputeTetrahedrons`)**:
   Each of the 4 faces $i \in \{0,1,2,3\}$ stores an outward unit normal $\vec{n}_i$ and plane offset $d_i$. Along each X-scanline at $(y, z)$, the signed plane distance is linear: $s_i(x) = b_i + x \cdot m_i$ where $m_i = n_{ix} \cdot \Delta v$. Prior to entering the inner X-loop, the scanline range $[x_{\text{start}}, x_{\text{end}}]$ is clipped against $b_i + x \cdot m_i \le \text{bandPad}$ for all 4 faces.
3. **$O(1)$ Exact Interior Tetrahedron SDF**:
   When $\max(s_0, s_1, s_2, s_3) \le 0$, the voxel lies inside the convex tetrahedron and its exact signed distance to the boundary is:
   $$\text{SDF}_{\text{in}}(P) = \max(s_0, s_1, s_2, s_3)$$
   computed in $O(1)$ with zero triangle evaluations and zero `Math.sqrt` calls. Exterior points ($\max_i s_i > 0$) evaluate `pointToTriangleDistSqScalar` only on visible faces ($s_i > 0$) using zero-allocation scalar arithmetic.
4. **$O(1)$ Trilinear Sub-Voxel Normals in Surface Nets (`extractSurfaceNets`)**:
   Mesh vertex normals are computed in $O(1)$ from the 8 cell corner SDF values $(c_{000} \dots c_{111})$ at local sub-voxel coordinates $(u, v, w) \in [0, 1]^3$ via trilinear gradient interpolation, eliminating 6 full-scene `evaluateSDF` calls per vertex.

### 3.5 Cut Cross-Section Edge Extraction (BVH Shapecast & ClippingEdges, v2.5.13)
To render real-time red clipping edges along sliced cave walls (`colorClippingEdges = "#ff4444"`), CaveView utilizes `three-mesh-bvh`:
1. **BVH Indexing**:
   Whenever a Splay mesh is generated or retrieved from cache (`createSplayBufferGeometry`), `geo.computeBoundsTree()` constructs an accelerated bounding volume hierarchy.
2. **Triangle-Plane Intersection**:
   For each clipping plane $\pi = (\vec{n}, d)$, `shapecast(intersectsBounds, intersectsTriangle)` visits intersecting leaves. Segments intersecting $\pi$ are interpolated linearly:
   $$t = \frac{|d_i|}{|d_i| + |d_{i+1}|},\quad P = P_i + t(P_{i+1} - P_i)$$
3. **Multi-Plane Visibility Culling**:
   When horizontal and vertical profile clipping are both active, line segment endpoints are checked against all secondary clipping planes ($\pi_j \cdot P_k + d_j \ge -10^{-4}$); discarded segments are pruned before rendering.

### 3.6 Hypsometric Splay SDF Wall Coloring (`splayAltitude`, v2.5.14)
1. **GPU Vertex Buffer Elevation Attribution**:
   During surface generation in `createSplayBufferGeometry`, each vertex $i$ with vertical coordinate $y_i$ (Three.js $Y$ represents survey altitude $Z$) is normalized to $t \in [0, 1]$ and assigned an RGB color:
   $$t = \text{clamp}\left(\frac{y_i - Z_{\min}}{Z_{\max} - Z_{\min}},\ 0,\ 1\right),\quad C_i = \text{elevColor}(t)$$
   stored permanently in `THREE.BufferAttribute(colors, 3)` under the `color` attribute.
2. **Instant 0 ms Shader State Toggling**:
   The `splayAltitude` option toggles `vertexColors: boolean` and `color: Color`. Because vertex colors are pre-allocated directly in GPU memory, switching between elevation coloring and custom solid colors occurs in a single frame without background worker re-execution.

### 3.7 Web Quality, WCAG 2.2 Accessibility & SEO Optimization (v2.5.15)
1. **WCAG 2.2 AA Contrast & Accessibility Tree Conformance**:
   - Explicit `aria-label` attributes added to all file input nodes (`<input type="file">`) across `App.tsx`, `ProjectSection.tsx`, and `SurfaceSection.tsx` with dynamic localization via `t()`.
   - Text color contrast ratios increased to $C = \frac{L_1 + 0.05}{L_2 + 0.05} \ge 4.5:1$ on `.changelog-badge` (6.8:1), `.changelog-group` (7.5:1), and `/privacy.html` footer link (>6.5:1).
2. **Font Transfer Budget & Critical Path Optimization**:
   - Replaced unbounded open variable axes query for Material Symbols (`opsz,wght,FILL,GRAD@...`) with a fixed glyph specification and `&display=swap` (`@24,400,0,0&display=swap`), slashing font weight from **3,912 KiB down to 323 KiB (92% reduction)**.
   - Removed client-side `http-equiv="Cache-Control"` meta tags from HTML head, allowing standard HTTP caching on CDN and web server layers.
3. **Crawlability & AI Assistant Interoperability**:
   - Added static `robots.txt` and `sitemap.xml` in `public/`, eliminating SPA routing fallback and providing 100% SEO indexability.
   - Published standardized `public/llms.txt` for AI agentic discoverability.

---

## 4. Structural Geology & Tectonics Formulation (Dip & Strike)

The module `src/shared/utils/tectonics.ts` computes planar orientation from 3 chosen points $P_1, P_2, P_3 \in \mathbb{R}^3$:

### 4.1 Surface Normal Vector
$$\vec{v}_1 = P_2 - P_1,\quad \vec{v}_2 = P_3 - P_1$$
$$\vec{N} = \vec{v}_1 \times \vec{v}_2 = (N_x, N_y, N_z)$$
Unit normal:
$$\vec{n} = \frac{\vec{N}}{\|\vec{N}\|}$$
Oriented upward such that $n_z \ge 0$. If $n_z < 0$, invert $\vec{n} \leftarrow -\vec{n}$.

### 4.2 True Dip Angle ($\theta$)
$$\theta = \arccos(|n_z|) \times \frac{180^\circ}{\pi}$$

### 4.3 Dip Direction ($\alpha$)
$$\alpha = \left(\text{atan2}(n_x,\ n_y) \times \frac{180^\circ}{\pi} + 360^\circ\right) \bmod 360^\circ$$

### 4.4 Strike Direction ($\beta$)
$$\beta = (\alpha + 90^\circ) \bmod 360^\circ$$

---

## 5. Camera Projections & Auto Zoom-to-Fit Algorithm

Implemented in `ProjectionController.tsx`, `calculateFitParams` computes optimal camera distance or frustum size to fill ~85% of the viewport:

### 5.1 Perspective Camera
For bounding sphere with radius $R$ and vertical field of view $\text{FOV}$:
$$d_{\text{target}} = \frac{R}{\sin(\text{FOV} / 2)} \times 1.15$$

### 5.2 Orthographic Camera
Calculated against canvas dimensions $W, H$:
$$\text{zoom}_{\text{ortho}} = \frac{\min(W, H)}{2 \cdot R \cdot 1.15}$$

---

## 6. Post-Processing Shaders (Eye-Dome Lighting)

### 6.1 Eye-Dome Lighting (EDL) Formulation
EDL computes depth disparity $F(u, v)$ over 4 cross neighbors at offset distance $d$:
$$F(u, v) = \sum_{i=1}^4 \max\left(0,\ \ln(z(u, v)) - \ln(z(u + \delta x_i,\ v + \delta y_i))\right)$$
Shaded output intensity:
$$I = I_0 \cdot \exp(-F(u, v) \cdot k_{\text{exp}})$$
where $k_{\text{exp}}$ represents the user-controlled plasticity exponent.

---

## 7. Parallel Web Workers & Zero-Copy Transferable Objects

* `parser.worker.ts`: Binary format decoders for `.lox`, `.ply`, `.stl`.
* `pointcloud.worker.ts`: Octree spatial tree building and streaming LOD queues.
* `splayWall.worker.ts`: Volumetric SDF marching cubes calculation.
* `lidarPlanMap.worker.ts`: High-resolution 2D plan map rasterization.

Memory transfers bypass JSON serialization via `ArrayBuffer` transfer lists:
```ts
self.postMessage({
  type: 'SPLAY_WALL_READY',
  positions: positionsArray.buffer,
  normals: normalsArray.buffer,
  colors: colorsArray.buffer
}, [positionsArray.buffer, normalsArray.buffer, colorsArray.buffer]);
```

---

## 8. URL Serialization Schema & State Hydration

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `model` | `string` | URL to 3D survey or LiDAR dataset. |
| `embed` | `boolean` (`1`/`0`) | Enables clean iframe embed mode. |
| `proj` | `orthographic` / `perspective` | Camera projection mode. |
| `theme` | `precision` / `dark` / `light` | Visual theme and material coloring. |
| `sdf` | `boolean` (`1`/`0`) | Enables Splay SDF 3D walls. |
| `smin` | `number` | SDF smooth minimum blend radius. |
| `srad` | `number` | Splay capsule thickness radius. |
| `scraps` | `boolean` (`1`/`0`) | Toggles Therion scrap wall meshes. |
| `terrain` | `none` / `shaded` / `satellite` | Surface terrain rendering mode. |
| `alt` | `abs` / `rel` | Elevation reference system. |
| `clip` | `number` | Z-clipping cutting plane elevation. |

---

## 9. Stitch CAD Design System & CSS Tokens

Introduced in v2.4.22 and refined through v2.4.25, the **Precision Speleology & 3D Geospatial Engine** design system is synthesized from Google Stitch specification (`DESIGN.md`):

* **CSS Custom Properties (`:root` and `.theme-light`):**
  * Canvas: `--cv-bg: #0b0f17` (Deep Abyss dark) / `--cv-bg: #f7f3eb` (Fieldwork Sand light).
  * Containers & Cards: `--cv-surface-card: #1c2028`, `--cv-surface-high: #262a33`, `--cv-surface-low: #141820` (in `.theme-light`: lower elevation `#f2ece2`, higher `#e8ded0`).
  * Primary Accent: `--cv-primary: #00d2ff` (Electric Cyan) / `--cv-primary: #0284c7` (Fieldwork Blue).
  * Secondary Accent: `--cv-secondary: #10b981` (Subterranean Emerald) / `#059669`.
  * Typography: `--cv-font-sans: 'Inter'` for UI controls, `--cv-font-mono: 'JetBrains Mono'` with `font-variant-numeric: tabular-nums` for all telemetry, coordinates, and metrics to prevent camera jitter.
* **Three.js sRGB Color Space & Background Gradients (v2.4.24 - v2.4.25):**
  * The `precision` theme uses a technical vertical blue gradient: deep night blue (`#103258`) at the top transitioning to a luminous technical blue (`#1d5b9b`) at the bottom.
  * The `light` theme implements a natural vertical sand gradient: light ivory sand at the top (`#f7f3eb`) to warm darker limestone sand at the bottom (`#d5c4ad`).
* **Freemap Orthophoto Endpoint & Placeholder Rejection (v2.4.26):**
  * Replaced obsolete `tiles.freemap.sk/o/{z}/{x}/{y}.jpg` endpoint (which returns a 1843-byte PNG "no map data" placeholder) with the official production service `https://ortofoto.tiles.freemap.sk/{z}/{x}/{y}.jpg`.
  * Updated proxy routing in `public/map-proxy.php` and `vite.config.ts` to forward to `ortofoto.tiles.freemap.sk`.
  * `XyzTileDownloader.ts` actively rejects 1843-byte placeholder tiles, immediately triggering proxy fallback instead of stitching placeholder text over the 3D surface.
  * Incremented tile cache key version in `tileCache.ts` to `KEY_VERSION = 'v2'`, automatically invalidating any previously cached placeholder images in client browsers.
* **Sidebar Toggle & Flexbox Layout Optimization (v2.4.25):**
  * The `.canvas-wrap` container explicitly defines `min-width: 0`, enabling the CSS Flexbox layout to cleanly shrink the 3D canvas when `.sidebar-container` is re-opened, eliminating off-screen sidebar clipping.
  * Added floating `.sidebar-reopen-tab` button for instantaneous one-click panel restoration directly from the 3D scene.
  * Mobile drawer headers are scoped strictly to `@media (max-width: 768px)` via `.mobile-drawer-header`, preventing layout leakage into desktop views.
* **LiDAR Controls Exclusivity for PLY Formats (v2.4.24):**
  * Engine v2 (`LiDAR NEXTGEN`) and LiDAR editing overlays are selectively rendered only when real point cloud data is detected (`isPointcloud && isPlyFormat`).
  * The survey parser (`caveParser.ts` in `buildResult`) leaves `pointCount = 0` for standard line/polygon datasets (`.lox`, `.3d`, `.plt`), preventing false-positive LiDAR engine activation.
* **Sidebar Layout & Card Token Hierarchy:**
  * **`.sidebar-pinned-header`**: Stationary container (`position: sticky; top: 0; z-index: 50; flex-shrink: 0`) preserving dataset metrics (`.sidebar-stat-card`) and tab navigation (`.sidebar-tab-bar`) at the top, immune to sidebar scrolling.
  * **`.cad-card`**: High-contrast modular cards for tool sections (clipping, survey, splay walls, terrain, tectonics).
  * **`.cad-subcard`**: Adaptive sub-panels utilizing `var(--cv-surface-low)` in place of hardcoded dark backgrounds (`#0f172a`, `bg-slate-800`).
  * **`.cad-slider`, `.cad-tool-btn`, `.btn-mini`, `.cad-select`**: Unified interactive primitives supporting light and dark themes.
* **Component Styling:**
  * Ultra-compact CAD switches (`.switch`) with electric outer glows (`box-shadow: 0 0 8px rgba(0,210,255,0.35)`).
  * Scope-isolated theme switching dynamically bound via `.viewer-shell.theme-{currentTheme}`.

---

## 10. Performance Optimization, React Render Decoupling & WebGL Render Loop

Implemented in **v2.4.27** to guarantee sub-16ms latency, rock-solid 60 FPS interactions, and zero CPU/GPU overhead when idle:

### 1. Persistent Surface & Wall Transparency During Motion:
- In `CaveViewer3D` (`TerrainMesh`), `Scraps`, and `SplayCaveWalls`, eliminated forced opacity resets to `1.0` during camera motion (`isMoving` / `!isFullyIdle`). Surface and wall opacity stays stable and continuous without flashing to opaque.
- Decoupled `terrainSubsample` in `TerrainTile` from `props.isMoving`, avoiding synchronous geometry rebuilds and BVH tree regenerations on the main thread when camera rotation starts or stops.
- Extracted `props.opacity` from `contourMat` shader `useMemo` dependencies to eliminate runtime GLSL shader recompilations; dynamically set `depthWrite={props.opacity === 1}`.

### 2. Elimination of 10Hz Re-render Cascades in `App.tsx`:
- `CameraMonitor` in both `CaveViewer3D` and `CaveViewerNextGen` throttles updates to `setCameraData`: dispatches only when horizontal azimuth shifts by $\ge 1^\circ$, contour distance bucket changes, or translation exceeds $0.25\ \text{m}^2$ (with 150 ms throttle).
- Halted the continuous 60 FPS 2D particle `requestAnimationFrame` loop on `bg-canvas` when in 3D viewer mode (`appState === 'viewer'`).

### 3. Prop Reference Stabilization (React.memo):
- Wrapped callbacks (`handleProcessingEnd`, `handleTextureReady`, `handleSurfaceOffsetChange`) in `useCallback` and `manualConnection` in `useMemo`, allowing `React.memo` on `<CaveViewer3D>` and `<CaveViewerNextGen>` to fully eliminate redundant 3D scene re-renders during sidebar and slider interaction.

### 4. Geometry Consolidation in `Scraps.tsx` (50% CPU & VRAM Savings):
- Unified duplicate geometry construction (`currentSolid` and `currentAlt`) into a single `BufferGeometry` with vertex colors. Materials without `vertexColors` automatically bypass color attributes, cutting `mergeVertices`, Taubin smoothing, normal computation, and BVH trees in half.

### 5. Zero-Copy Web Worker Transferables & VRAM Lifecycle Management:
- Extended `parser.worker.ts` transferables array to include `dtm.data.buffer` and `bitmapData.buffer`, enabling zero-copy transfer of digital elevation models and raster maps.
- Removed redundant `buf.slice(0)` buffer allocations during file ingestion in `App.tsx`.
- Explicitly hooked `dispose()` calls on geometries, BVH trees (`disposeBoundsTree`), and textures in `CaveLegs`, `PointCloud`, `OrganicShell`, `TerrainMesh`, and `Scraps` to guarantee zero GPU VRAM leaks on model or mode switches.

### 6. 180ms Immediate On-Demand Idle Transition:
- Shortened camera idle timeout (`idleTimeoutRef`) from 1500 ms to 180 ms, bringing `frameloop="demand"` into passive 0% CPU/GPU state immediately after camera motion ceases.

---

## 11. Shaded Surface Opacity, Dual-Axis Contour Edge Intersections & Triangle Mesh Axonometry (v2.4.28)

### 1. Shaded Surface & Height Network Opacity:
- Added dedicated `surfaceOpacity` slider in `src/App.tsx` active during `showSurfaceMesh` or `showSurfaceNetwork`.
- Bound to `TerrainTile` in `CaveViewer3D.tsx` with `transparent={props.opacity < 1}`, `opacity={props.opacity}`, and `depthWrite={props.opacity === 1}` with polygon offset discipline.

### 2. Dual-Axis Edge Intersections for Contour Altitude Labels (`ContourLabels`):
- Refactored `ContourLabels` in `CaveViewer3D.tsx` to detect contour crossings across both horizontal edges $(r, c) \leftrightarrow (r, c+\Delta c)$ and vertical edges $(r, c) \leftrightarrow (r+\Delta r, c)$ on a refined $36 \times 36$ sampling grid.
- Enforced spatial distance thresholding $d_{\min} = \max(30\ \text{m}, \frac{\text{maxDim}}{14})$, ensuring each major contour interval maintains at least one clear, readable elevation label in the active view field without cluttering.

### 3. Conditional Visibility for Splay SDF Walls:
- In `src/App.tsx`, the *Splay SDF Walls (2D/3D)* card is conditioned on `{cave && splayCount > 0 && (...)}`, hiding the card for models without radial splay rays.

### 4. Unified Splay Ray and Point Visibility:
- `ViewerOptions.showSplay` controls both the splay line segments in `CaveLegs` and the splay endpoint geometry in `Stations`.
- `showStations` controls only regular traverse stations, so hiding that layer does not detach splay dots from the splay rays toggle.

### 5. Triangle Mesh & Technical Axonometry Mode (`Scraps.tsx`):
- Integrated `options.accurateScraps` across `CaveViewer3D.tsx`, `CaveViewerNextGen.tsx`, and `Scraps.tsx`:
  - Scraps mesh mounts when `(o.showScraps || o.accurateScraps || o.scrapsWireframe) && cave.scraps?.length > 0`, allowing standalone usage.
  - Enables `flatShading={options.accurateScraps || !smooth}` for crisp faceted triangle shading.
  - Renders wireframe in `renderOrder={10}` with `options.colorScrapsWire` and `depthWrite={!showSolid && !showAltitude}` for authentic speleological axonometry.
- v2.5.0: `LayersSection.tsx` shows the *Triangle mesh* switch only when `isPlyLidar`. For other models `wireOn = scrapsWireframe || (!isPlyLidar && accurateScraps)` and toggling sets `{ scrapsWireframe: !wireOn, accurateScraps: false }` (legacy URLs with `acc=1` stay readable). `traverseAltitude` / `scrapsAltitude` toggles live in the accordion `primary` slot; the duplicate *Scale (Caver)* card was removed — `placedCaver` is set from `StationDetailCard`.

---
## 12. Memory and Network Optimizations (v2.4.30)

- Floor-map point matching uses a `Map<string, StationLabel>` and preserves the first station for duplicate names, matching the previous `Array.find()` behavior. Matching is O(P + S) instead of O(P × S).
- `PointCloudLOD` aborts its fetch when unmounted or when its URL changes. The direct-render path allocates and attaches a normal buffer only when valid source normals exist, and changes to the `cave.pointNormals` reference invalidate memoized geometry.
- Splay geometry uses a 256 MiB LRU cache, sized by the combined `byteLength` of position, normal, and index buffers. Reads and writes mark entries most-recently-used; least-recently-used entries are evicted to stay within budget, and a single oversized geometry is not cached.
- Each XYZ tile candidate has a 15-second timeout. On timeout, an `AbortController` cancels that request and the downloader advances to its fallback; timers are cleared in all outcomes.

## 13. Deferred Mapbox Terrain Loading (v2.4.31)

- `CaveViewerNextGen` imports `MapboxTerrain` with `React.lazy()` and `React.Suspense`; the module is requested only when GPS coordinates, the terrain toggle, and a Mapbox token are all present.
- `three-geo` is isolated in a `vendor-mapbox-terrain` chunk behind that dynamic import and is no longer forced into Vite `optimizeDeps`, avoiding dev-server prebundling and keeping terrain-only modules off the initial production route.
- Removed the unused direct `pdfjs-dist` dependency from the package manifest and lockfile.

## 14. Accessible Switches and Document Language (v2.4.32)

- `.switch` controls are `<button type="button" role="switch">` elements with `aria-checked` and localized `aria-label` values. Native button activation provides Enter and Space support without a custom `onKeyDown`.
- An `App.tsx` effect keeps `document.documentElement.lang` synchronized with the selected `lang` state for assistive technologies.
- `index.html` defines the application title, description, Open Graph metadata, and local SVG favicon.

## 15. Direct Vertical Section and Toolbar → Sidebar Reveal (v2.5.1)

- `App.tsx` keeps `profilePicking`. `startProfilePick()` enables `showProfileClipping`, clears `activeProfilePoints` and reuses `measurementMode = 'distance'` (same snapping and A/B overlay). An effect promotes the first two `selectedStations` to `activeProfilePoints`, then leaves measurement mode. `setProfileClipping(on)` re-enables an existing line or starts picking when none exists. The clip plane stays $\mathbf{n} = \widehat{(p_2 - p_1) \times \hat{y}}$, $d = -\mathbf{n}\cdot p_1 - \text{offset}$ in both engines.
- `NavigationSidebar/reveal.ts` dispatches `window` event `cv-nav-reveal` with `{ category, target }`. `ViewerToolbar` tools pass `reveal={[category, target]}`; `NavigationSidebar` switches its local category, expands on desktop (mobile drawer stays closed), and flashes `[data-nav-target]` (closest `.toggle-row`) with `.nav-reveal`. `SidebarAccordion` exposes `navTarget`.
- Only `.nav-panel-content` is scrolled (`scrollBy`), never `scrollIntoView`: scrolling ancestors resized the R3F canvas and the v2 refit moved the orbit target during view tweens.

---
*LochViewer Developer Team — Documentation is automatically maintained with every codebase change.*
