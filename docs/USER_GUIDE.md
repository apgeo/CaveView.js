# 📖 LochViewer - Complete User Guide (v2.5.11)

*Web-based 3D platform for speleological visualization, survey measurement, and spatial analysis of cave systems & LiDAR point clouds.*  
*Design System: Stitch CAD Precision Glassmorphism & Fieldwork High-Contrast (including gentle sand vertical gradient in light mode).*  
*Official Portal: [loch.sss.sk](https://loch.sss.sk)*

---

## 📑 Table of Contents
1. [Supported Formats & Data Loading](#1-supported-formats--data-loading)
2. [User Interface (Top Bar, Tool Controls & Visual Themes)](#2-user-interface-top-bar-tool-controls--visual-themes)
3. [Spatial Navigation & Technical View Presets](#3-spatial-navigation--technical-view-presets)
4. [3D Cave Wall Reconstruction from Laser Splays (Splay SDF)](#4-3d-cave-wall-reconstruction-from-laser-splays-splay-sdf)
5. [Survey Measurement, Polygon Area & Structural Geology (Tectonics)](#5-survey-measurement-polygon-area--structural-geology-tectonics)
6. [Spatial Slicing & Profile Analysis (Z-Clipping)](#6-spatial-slicing--profile-analysis-z-clipping)
7. [LiDAR Point Cloud Processing (Engine v2 NextGen)](#7-lidar-point-cloud-processing-engine-v2-nextgen)
8. [Surface Terrain, Official GKÚ ZBGIS WMS & 3D Calibration](#8-surface-terrain-official-gkú-zbgis-wms--3d-calibration)
9. [Sharing Models & Iframe Embedding](#9-sharing-models--iframe-embedding)
10. [In-App Interactive Guide (Help Modal)](#10-in-app-interactive-guide-help-modal)
11. [Keyboard Shortcuts & Navigation Gestures](#11-keyboard-shortcuts--navigation-gestures)

---

## 1. Supported Formats & Data Loading

LochViewer executes 100% inside your web browser using WebGL and parallel Web Workers. Your data is processed locally without being uploaded to third-party servers, guaranteeing maximum privacy and performance.

![LochViewer Welcome Screen](images/01_welcome_screen.png)

### Supported File Formats:
* **`.lox` (Therion / Loch)**: Core cave survey standard containing 3D centerline traverses, stations, laser splays, hand-drawn scrap walls, DTM terrain surfaces, and georeferenced texture maps.
* **`.3d` (Survex)**: Universal format from Survex software containing underground and surface polygon traverses.
* **`.plt` (Compass)**: Compass cave survey format containing station shots and polygon loops.
* **`.ply` (LiDAR Point Cloud)**: Binary and ASCII point clouds supporting millions of vertices, RGB true colors, intensity reflectance, and classification attributes.
* **`.stl` (3D Mesh)**: High-resolution triangulated meshes generated via 3D scanning or photogrammetry.
* **`.tif / .tiff` (GeoTIFF) + `.tfw`**: Digital Elevation Models (DMR) and orthophotos georeferenced in S-JTSK Křovák or UTM projection.

### Ways to Load Models:
1. **Drag & Drop**: Simply drag and drop any supported file directly into the browser window.
2. **Open File Button**: Click **"Select 3D file"** on the welcome screen.
3. **URL Parameter**: Directly load public cloud or server models using `?model=https://...` (e.g., Google Drive or custom server).

---

## 2. User Interface (Top Bar & Tool Controls)

Once a model is loaded, the sidebar organizes all tools and settings into six dedicated categories with a unified amber CAD design (`#f59e0b`), full-width tactile action buttons, and contextual info icons (**ℹ️**) on every section. A compact top toolbar provides direct access to frequent actions; hover an icon for its name. Cyan highlights indicate enabled modes. A dedicated **Language Bar (SK | EN | DE | FR)** in the top-right corner automatically selects Slovak for visitors from Slovakia/Czechia and defaults to English for other locations. On small screens, scroll the icon strip horizontally.

The quick actions, from left to right, are: **Open model, Reload original model, Export PNG, Automatic rotation, Orthographic/perspective, Plan, Elevation, Fit, Entrances, Fixed stations, All stations, Station labels, Centerline, Splays, Walls, Surface, Add image to surface, Measurement, Vertical section (scissors) and Fullscreen**. Reload reparses the retained original file, discarding model edits; it does not refresh the page or reread a changed disk file. Fixed stations are available only when the format supplies that metadata (LOX fixed flag); they are not inferred from GPS or entrances. Repeated **Plan** clicks toggle the view from above ↔ from below (north stays up; the view from below is mirrored). Repeated **Elevation** clicks orbit the model around four sides: from south → east → north → west. The current side is shown in the button tooltip.

**Station labels** cycles through **number → full name → elevation → GPS → off**; GPS is skipped when unavailable. Full survey names such as `1@survey` are retained from LOX. Walls and Surface hide their constituent representations and restore them when re-enabled. The image button opens a small menu for a local image, its calibration file or ZBGIS orthophoto; detailed terrain calibration and DMR 5.0 WCS LiDAR downloads are housed in the dedicated **Surface & Terrain** category.

Every quick action (except file and fullscreen actions) also switches the sidebar to the matching category, expands it and briefly highlights the related control — e.g. Walls → *Cave & Model → Walls*, Surface → *Surface & Terrain*, Measurement → *Tools & analysis*.

**Vertical section (scissors)**: click the scissors icon in the top toolbar or enable *Tools & analysis → Vertical Profile (Line)*, then click 2 points in the model (stations, splay endpoints or terrain). The model is cut by a vertical plane through that line; offset and flip are visible right below the switch. *Create profile (line)* picks a new line and clicking the scissors again turns the section off.

| Category | Controls |
| :--- | :--- |
| **Files & projects** | Open/close models, demos; **Sharing and available exports** contains sharing/iframe, PNG, generated texture/calibration and WebM recording with duration settings. |
| **View & camera** | Perspective/orthographic projection, technical presets (1-4), Fit, altitude reference (REL/ASL) and automatic rotation. |
| **Cave & Model** | Underground cave body: survey network (centerline, splay rays, reference grid, bounding box), splay SDF reconstruction, 3D walls (materials, opacity, cross-sections), stations and LiDAR point clouds. |
| **Surface & Terrain** | Overhead environment: DTM shaded relief, height grid, labeled contours, DMR 5.0 WCS direct download (GKÚ LiDAR SR), WMS orthophoto & elevation layers, custom textures, and 3D cave-surface calibration. |
| **Tools & analysis** | Distance/polygon measurement, horizontal/profile cuts, tectonics (3 points), 2D cross-section/volume and LiDAR analysis (chimneys, windows, 2D plan map). |
| **Settings & help** | Themes, legend, language settings, fullscreen and interactive user manual. |

Every accordion panel includes an **ℹ️ (Info)** button. Clicking it opens a modal dialog with technical guidance, key parameter summaries, and direct links to the relevant manual chapter. All sidebar action buttons use a full-width tactile layout for comfortable touch operation on field tablets and desktop workstations.

Layer switches remain accessible without opening their **Details** accordions. Opacity, color, SDF and LiDAR parameters are disclosed inside the relevant accordion and gated by layer/data availability. Collapse the sidebar to its icon rail; select any category to reopen it. On mobile, the menu button opens an overlay drawer: Tab/Shift+Tab stay inside, Escape or the close button dismisses it and restores focus. Enter/Space activate switches and accordion buttons. Categories are translated into SK/EN/FR/DE.

![Main 3D Viewport & Clean Topbar](images/02_main_viewer_3d.png)

The following tools remain available in the categories above; frequent actions also have top-toolbar shortcuts:

| Icon | Tool Name | Description |
| :--- | :--- | :--- |
| 📷 | **Export Image (PNG)** | Captures a high-resolution screenshot with the active compass rose, scale bar, and elevation legend. |
| 🧊 / 📐 | **Camera Projection (O)** | Toggles between **Perspective** (natural 3D depth) and **Orthographic** (true-scale axonometry without distance distortion). |
| ⛶ | **Fit to Screen** | Smoothly centers and zooms the viewport to encompass the entire cave system. |
| 📈 | **Centerline** | Toggles survey traverse line network and station nodes. |
| 🪨 | **Cave Walls** | Toggles 3D cave wall meshes (Therion scraps, Splay SDF model, STL mesh). |
| 🏔️ | **Surface Terrain** | Toggles overhead surface elevation model, hillshade, or aerial orthophoto. |
| 🔲 | **Bounding Box** | Toggles the 3D bounding box showing spatial dimensions ($X, Y, Z$) and total cave vertical relief. |
| ✂️ | **Horizontal Z-Slice** | Opens the floating vertical clipping slider to slice through horizontal cave levels. |
| ⚡ | **Laser Splays & Points** | Toggles laser survey rays and their endpoint dots together. |
| 📏 / 📐 | **Measurement Tool** | 3-State cycling button: **Disabled** ➡️ **Distance (2 points)** ➡️ **Area / Polygon (3+ points)**. |
| 🎨 | **Color Palette** | Switches between elevation hypsometry, monochrome rock material, and gradients. |
| 📊 | **Altitude Mode (ABS / REL)** | Switches between absolute altitude above sea level ($m\ \text{a.s.l.}$) and relative elevation from the entrance ($+120\ \text{m},\ -35\ \text{m}$). |
| ❓ | **User Guide / Help** | Opens this comprehensive interactive user guide inside the application. |
| 🔗 | **Share** | Generates persistent shareable URLs and embeddable `<iframe>` HTML snippets. |
| ✖ | **Close Model** | Releases GPU/CPU memory and returns to the initial welcome screen. |

### Visual Themes & Design Styling:
In **Settings & help → Appearance and legend** or via the URL parameter `?theme=`, three calibrated themes can be toggled:
* **Precision CAD (`precision`)**: Default technical dark mode featuring a calibrated vertical blue gradient (deep night blue `#103258` at the top transitioning to a luminous technical blue `#1d5b9b` at the bottom) with high-contrast electric cyan (`#00d2ff`) / emerald (`#10b981`) accents synthesized from Google Stitch CAD specifications. Provides superior spatial depth and exceptional contrast for survey centerlines.
* **Light Sand (`light`)**: Natural high-contrast outdoor mode featuring an eye-friendly vertical sandy gradient – light ivory sand at the top (`#f7f3eb`) transitioning smoothly into darker warm limestone sand at the bottom (`#d5c4ad`). Sidebar cards, metrics, and sliders harmonize with this warm sand tone, providing superb legibility and zero glare during daytime fieldwork.
* **Classic Speleo (`classic`)**: Traditional nocturnal deep blue theme with indigo background gradient.
* **Sidebar Hiding & Reopening:** Collapse to the icon rail on desktop and select a category to reopen it. On mobile, use the menu button at the right edge of the viewport.

---

## 3. Spatial Navigation & Technical View Presets

![Orthographic Plan View & Compass](images/03_orthographic_plan_view.png)

### Mouse Controls:
* **Left Click + Drag**: Orbit / rotate around the center of interest.
* **Right Click + Drag (or Shift + Left Click)**: Pan the camera.
* **Scroll Wheel**: Smooth zoom in / out.
* **Double Click on Station or Wall**: Street-view smooth flight transition directly to the target location.

### Speleo Compass Rose:
Anchored in the top-left corner of the viewport, the compass rose continuously indicates Grid North via a red arrow and displays the live azimuth heading badge (e.g., `045° NE`). Clicking the compass rose immediately snaps the camera to a North-aligned top-down view.

### 1-Click Technical View Presets (Keys 1 – 4):
* **Key `1` — Plan View (Pôdorys)**: Vertical top-down orthographic plan ($X-Y$), aligned with North for cartographic accuracy.
* **Key `2` — Longitudinal Profile (Pozdĺžny profil)**: True-scale front profile view (South $\to$ North, $X-Z$) with zero perspective distortion.
* **Key `3` — Cross Section (Priečny rez / Bokorys)**: True-scale side profile (West $\to$ East, $Y-Z$).
* **Key `4` — 3D Isometric View (Axonometria)**: Spatial axonometric perspective tilted at $45^\circ$.

---

## 4. 3D Cave Wall Reconstruction from Laser Splays (Splay SDF)

Surveys created with modern laser distometers (DistoX, CaveTRom, BRIC) contain hundreds or thousands of radial splay shots. LochViewer features an automated **Signed Distance Field (SDF) & Marching Cubes** engine running on background Web Workers that reconstructs watertight 3D cave passage walls.

![Splay SDF 3D Cave Walls](images/04_splay_sdf_walls.png)

### How to Use Splay SDF Walls & Triangle Mesh (Axonometry):
1. Open the sidebar (**Cave** tab $\to$ dedicated **Splay SDF Walls (2D/3D)** card) and toggle **Splay SDF Walls (2D/3D)**. This card appears conditionally only when the model contains radial survey splays (`splayCount > 0`). For models without splays, the card is hidden.
2. **Angular / Sharpness**: Dedicated CAD slider ranging from sharp facets (`0.02` - precise technical passage boundaries) to smooth rounded contours (`0.25` - organic erosion walls).
3. **Wireframe / Triangle mesh (Axonometry mode)**: For LOX/3D/PLT models the *Cave Walls* card offers a single *Wireframe* switch that draws the triangulation of the walls — standalone as a wire model or combined with solid walls as a CAD axonometric model. The separate *Triangle mesh* switch appears only for LiDAR PLY clouds, where it changes the surface reconstruction.
4. **Color by height** is shown directly (without opening details) in both the *Survey* and *Cave Walls* cards. Caver scale figures are placed from the station detail card (the separate sidebar card was removed).
4. The progress indicator will display reconstruction status in real time.
5. **Session Cache**: Once calculated, the mesh remains stored in memory for instant toggling.

---

## 5. Survey Measurement, Polygon Area & Structural Geology (Tectonics)

Click a station outside measurement mode to open a comprehensive point inspection card:
* **Identification & Coordinates**: Station name, original $X$ and $Y$ coordinates, source elevation $Z$, and GPS (WGS84 lat/lon with manual editing and model georeferencing).
* **Denivelation from Entrance / Reference Point**: Relative elevation difference from the entrance ($\pm$ value). If the cave defines an entrance with GPS or elevation, it compares against it; if neither entrance nor GPS exists, it references the lowest-numbered underground survey station (typically 0, 1, 2...). Positive values indicate ascents (chimneys, upper levels), negative values indicate descents.
* **Closest Surface (3D Min. Distance / Minimum Rock Cover)**: The true spatial 3D shortest distance ($\min d_{3D}$) from the station to the DTM terrain surface. In undulating or hillside terrain (e.g. steep valley slopes), this distance is often substantially shorter than the vertical overhead distance and determines the critical minimum thickness of the rock ceiling. The station card provides exact WGS84 GPS coordinates for this surface point with direct links to **Google Maps** and Slovakia's **ZBGIS Terrain (LiDAR)** portal. Rendered in the 3D scene as a **bold amber/orange dashed line** with a surface target ring and scaled distance badge.
* **Vertical Depth (Straight Up)**: Vertical elevation difference between the terrain surface directly overhead and the station ($Z_{surface} - Z_{point}$). Rendered in the 3D scene as a finer **cyan dashed line** with a surface target and surface altitude label. When DTM terrain is missing or outside coverage, values are marked as unavailable rather than estimated. Unreferenced LiDAR height is the file's $Z$, not a guaranteed sea-level elevation.
* **Map Integration (Google Maps & ZBGIS LiDAR)**: Both underground survey stations and closest surface points include one-click links to Google Maps and ZBGIS Terrain (activating the exact point identification pin at `https://zbgis.skgeodesy.sk/mapka/sk/teren/identification/point/{lat},{lon}?pos={lat},{lon},18` with national DMR 5.0 LiDAR elevation relief at zoom level 18).

Select the ruler in the top toolbar or **Tools & analysis → Measurement** to open the **Measurement Panel**. Survey stations and enabled splay endpoints snap within 10 screen pixels in both engines; dragging rotates without adding points. Cave meshes/terrain and LiDAR points can also be picked.

![Measurement Panel in Action](images/05_measurement_panel.png)

### 1. Distance Measurement (2 Points):
* Click station or splay endpoint $P_1$ and $P_2$.
* **Outputs**: 3D spatial distance ($m$), horizontal distance ($m$), elevation difference ($\Delta H$), azimuth ($^\circ$), and inclination / slope ($^\circ$).
* **A/B markers** and the highlighted line remain attached to the picked geometry. The next click replaces B; **Swap A/B** reverses direction, **Remove last point** undoes a pick, **New measurement** clears the selection and **Escape** exits. Starting measurement stops automatic rotation.

### 2. Polygon & Passage Area (3+ Points):
* Successively pick perimeter points ($P_1, P_2, P_3 \dots$).
* Pick boundary points in order without crossings. **Outputs**: planar vector area ($m^2$) using every selected vertex, and total 3D perimeter ($m$). For non-planar boundaries the area is projected, not the surface area of a reconstructed mesh; geological orientation uses the first three points.

### 3. Structural Geology & Tectonic Measurement (3-Point Plane):
* Pick 3 points on a fault plane, bedding joint, or passage wall.
* **Calculated Geological Parameters**:
  * **Dip ($\theta$)**: True dip angle from horizontal ($0^\circ$ flat, $90^\circ$ vertical).
  * **Dip Direction ($\alpha$)**: Azimuth direction of steepest down-slope ($0^\circ - 360^\circ$).
  * **Strike ($\beta$)**: Strike direction perpendicular to dip ($\alpha \pm 90^\circ$).
  * **Plane Normal**: Unit normal vector $\vec{n} = (n_x, n_y, n_z)$.
  * Displays a semi-transparent 3D planar disc and dip vector directly inside the cave.

---

## 6. Spatial Slicing & Profile Analysis (Z-Clipping)

![Floating Z-Clipping Slider](images/07_z_clipping_slider.png)

* Enable **Tools & analysis → Horizontal Section (Z)** to open the **Floating Z-Slice Slider**.
* Drag the handle to dynamically slice through upper levels of multi-story cave systems.
* Displays the active cutting elevation in meters above sea level or relative to the entrance.
* Intersection edges between slicing planes and cave geometry are highlighted with bright outlines.

---

## 7. LiDAR Point Cloud Processing (Engine v2 NextGen)

For massive LiDAR scans (`.ply` format), LochViewer automatically activates **Engine v2 NextGen**:

![LiDAR Point Cloud & EDL Shading](images/08_lidar_pointcloud_edl.png)

* **Exclusive to PLY Datasets**: The **LIDAR NEXTGEN** engine switch, **LiDAR editing** panel, and point-cloud anomaly detectors are displayed strictly when viewing `.ply` point cloud models. Standard speleological survey formats (`.lox`, `.3d`, `.plt`, `.stl`) keep these controls hidden to prevent visual clutter and workflow confusion.
* **Octree LOD**: Streams only visible nodes dynamically, sustaining 60 FPS on multi-million point models.
* **Eye-Dome Lighting (EDL)**: Screen-space depth silhouette shader highlighting speleothems, fissures, and passage topography without heavy mesh overhead.
* **LiDAR Brush Editor**:
  * **Erase Brush**: Circle brush to eliminate surface vegetation, scan noise, or stray reflections.
  * **Keep Brush**: Isolates selected chambers and removes all unselected points.
* **2D Plan Map Generator**: Renders high-resolution orthophoto rasters directly from point cloud density, exportable as PNG.

---

## 8. Surface Terrain, Official GKÚ ZBGIS WMS & 3D Calibration

* **Official GKÚ SR WMS**: Streams official aerial orthophotos, high-resolution DMR 5.0 hillshading, and topographic maps from the Slovak Geodetic Institute.
* **Mapbox 3D Terrain**: Automatically renders regional 3D topography based on GPS coordinates. Its heavy renderer is downloaded only when Mapbox terrain is enabled, keeping the initial cave-view load lean.
* **3D Position Calibration**: Fine-tune the cave position relative to surface terrain in $X, Y, Z$ axes (0.5m increments) and export calibration files.
* **Persistent Transparency & Sub-16ms Latency (v2.4.27)**: Set surface and cave wall opacity levels remain active during camera navigation and rotation without flipping to opaque. The optimized on-demand WebGL render loop (`frameloop="demand"`) settles after 180 ms for instant zero-CPU/GPU idle consumption and rock-solid 60 FPS interaction.
* **Surface Opacity for Shaded & Network Models (v2.4.28)**: Dedicated *Surface opacity* slider (5% – 100%) in the *Terrain* tab directly controls translucency for both *Shaded model* and *Network model (heights)* without requiring bitmap textures.
* **Balanced Contour Altitude Labels (v2.4.28)**: *Show altitudes* detects dual-axis edge crossings on a finer grid combined with spatial distance filtering, ensuring thick index contour lines display at least one legible elevation label in any active camera view.
* **DMR 5.0 WCS Elevation Download (v2.5.7)**: When a cave lacks an embedded surface in its `.lox` file, users can directly download the official Slovak DMR 5.0 digital terrain model (1-meter LiDAR grid) from the national INSPIRE OGC WCS 2.0.1 service (`inspirews.skgeodesy.sk`). Coordinates are auto-detected from entrance GPS or stations with quick presets ($500\ \text{m}$, $1\ \text{km}$, $2\ \text{km}$) or custom extents in $500\ \text{m}$ increments ($\pm 500\ \text{m}$ buttons, $500 - 5000\ \text{m}$ slider, or direct numeric input up to $10\ \text{km}$) and one-click export of georeferenced `.tif` and `.tfw` files.
* **Unified Single-Row Contours & Bottom Texture Placement (v2.5.9)**: The **Contours (10m)** control integrates color swatches for base lines, major lines, and the on/off toggle into a single row, clearing duplicate color rows from the details panel. **Texture (JPG/PNG)** is positioned as the final item in the terrain controls after all geometric surface modes.
* **Automatic Bpv Height Correction via Slovak Quasigeoid (v2.5.10)**: The official Slovak INSPIRE WCS provides elevation data referenced to the GRS80 ellipsoid (ETRS89-TM34). In Slovakia, ellipsoidal heights exceed true sea-level heights (Baltic 1957 / Bpv) by $+41$ to $+45\ \text{m}$. Version 2.5.10 embeds the high-precision national quasigeoid grid (DMQSK2014-E / DVRM05) with zero network latency and $\approx 1\ \text{cm}$ interpolation accuracy. **Bpv (sea level)** is enabled by default ($H = h - \zeta$), with a segmented switch to raw **ETRS89** ellipsoidal heights if needed.
* **Automatic Cave Coordinate Reference System (CRS) Detection & True North Alignment (v2.5.10)**: On loading `.lox`/`.3d` files, CaveView analyzes station and entrance coordinates (`caveCoordinateSystem.ts`):
  - **S-JTSK (Křovák)**: coordinates $X < -150\,000$, $Y < -900\,000$. An affine transformation with meridian convergence compensation ($\gamma \approx -2.8^\circ$ to $-3.5^\circ$) aligns geographic grid north with cave north.
  - **GPS UTM (34N/35N)**: $X \in [100\,000, 900\,000]$, $Y \in [4\,700\,000, 5\,600\,000]$. Projected directly in the UTM metric frame.
  - **WGS-84 (degrees)**: Automatic re-projection to UTM metric coordinates.
  - **Local relative surveys** (e.g., $[0, 0, Z]$): Surface terrain is automatically anchored and centered on the entrance GPS coordinates.
  An informative badge in the DMR 5.0 download panel displays the detected CRS frame.
* **Contour 60 FPS Performance Optimization during Motion (v2.5.11)**:
  - **Deferred DOM Labels during Camera Navigation**: HTML elevation markers are temporarily hidden during continuous camera orbit/pan/zoom (`isMoving`), eliminating hundreds of DOM projections, layout reflows, and frame drops. Labels reappear seamlessly after motion settles (180 ms threshold).
  - **Shared Lightweight `MeshBasicMaterial`**: Contour lines replace the heavy double-sided `MeshStandardMaterial` (which executed full PBR lighting calculations on 500,000 triangles) with a single, shared `MeshBasicMaterial` featuring hardware front-face culling (`FrontSide`) across all terrain tiles.
  - **Balanced Label Budget**: Capped at a maximum of 36 globally distributed labels, preventing DOM overhead and memory pressure on complex terrains.
* **Ultra-Fast Splay SDF 3D Wall Generation (~75x Speedup, v2.5.12)**:
  - **Narrow-Band Bounding-Box Splatting**: Splay SDF wall reconstruction evaluates the volumetric distance field exclusively within the active narrow band around cave passages rather than brute-forcing empty rock across the entire 3D bounding box.
  - **1D Half-Space Scanline Clipping & Trilinear Normals**: Combined with precomputed outward half-space planes, $O(1)$ interior tetrahedron SDF, zero-allocation scalar math, and $O(1)$ trilinear Surface Nets normals, 3D cave wall generation completes in ~0.4 s instead of >31 s.
* **Red Cut Edge Visualization for Splay SDF Walls (v2.5.13)**:
  - Horizontal Z-clipping and vertical profile cuts now display an exact, high-visibility red cross-section outline (`colorClippingEdges`) along Splay SDF 3D walls, identical to traditional scrap walls.
  - Driven by the precomputed BVH spatial index (`three-mesh-bvh`), intersection curves are evaluated in real time with zero frame drops during slider interaction.
* **Color by Height for Splay SDF Walls (Default Visible, v2.5.14)**:
  - The Splay SDF walls panel features a prominently visible **Color by height** (`splayAltitude`) toggle directly under the header, enabled by default (`true`).
  - Splay walls immediately render with a smooth hypsometric elevation gradient accompanied by the HUD elevation legend.
  - Toggling off color by height displays an inline color picker to select a custom solid wall color with instant 0 ms shader switching.
* **Web Quality, WCAG 2.2 Accessibility & Fast Asset Loading (v2.5.15)**:
  - **100% WCAG 2.2 AA Accessibility**: Full screen-reader support via explicit `aria-label` attributes across all file inputs and dropzones; enhanced contrast ratios ($\ge 4.5:1$) for badges, categories, and footer links.
  - **>90% Font Network Payload Reduction**: Refactored Google Fonts icon query to fixed glyph sets with `&display=swap`, slashing initial font transfers from 3.9 MB down to 323 KB and eliminating render-blocking stalls.
  - **Comprehensive Crawlability & Agentic Discovery**: Standardized `robots.txt`, XML sitemap, and `llms.txt` discoverability specification.

---

## 9. Sharing Models & Iframe Embedding

All view settings, camera angles, active layers, clipping heights, and SDF parameters are continuously encoded in the URL.

![Share & Iframe Embed Modal](images/10_share_dialog.png)

### Iframe Embedding Code:
```html
<iframe 
  src="https://loch.sss.sk/?model=https://...&embed=true&theme=precision&sdf=1" 
  width="100%" 
  height="600" 
  style="border:0; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.4);" 
  allowfullscreen 
  loading="lazy" 
  title="LochViewer 3D">
</iframe>
```

---

## 10. In-App Interactive Guide (Help Modal)

Select **Settings & help → Help** or use the welcome-screen guide button to open the interactive user guide:

![In-App Interactive Help Modal](images/11_help_modal.png)

---

## 11. Keyboard Shortcuts & Navigation Gestures

| Key / Gesture | Action |
| :--- | :--- |
| **`1`** | Plan View (Top-down orthogonal view) |
| **`2`** | Longitudinal Profile (Front orthogonal view) |
| **`3`** | Cross Section (Side orthogonal view) |
| **`4`** | 3D Isometric View (Axonometry) |
| **`O`** | Toggle Perspective $\leftrightarrow$ Orthographic Camera |
| **`F`** | Fit View to Screen |
| **`C`** | Toggle Centerline Traverses |
| **`W`** | Toggle Cave Walls |
| **`T`** | Toggle Surface Terrain |
| **`S`** | Toggle Laser Splays |
| **`M`** | Cycle Measurement Modes (Off $\to$ Distance $\to$ Polygon) |
| **`Z`** | Toggle Horizontal Z-Slice Slider |
| **`Ctrl + Z`** | Step Back in Navigation History (Undo Flight) |
| **`Tab`, `Enter`, `Space`** | Navigate switches with Tab; activate the focused switch with Enter or Space |
| **Double Click** | Smooth Flight Transition to Target Point |
| **Click Compass** | Reset Camera Yaw to Grid North ($0^\circ$) |

## 12. Reliable Loading and Memory Management

Floor-map points are matched to survey stations efficiently, including for large surveys. Point-cloud downloads are cancelled automatically when the model is replaced. Generated Splay walls remain cached for quick toggling, with a 256 MiB memory limit and older geometry released as needed. Map tile requests move to another available source after 15 seconds.

---
*Created for the Slovak Speleological Society (SSS) and the global speleological community.*
