# Technical Documentation / Technická dokumentácia

LochViewer is a modern, web-based 3D speleological data viewer.
LochViewer je moderný webový 3D prehliadač speleologických dát.

---

## 🇸🇰 Slovenská verzia

### 🛠 Technológie
- **React & TypeScript**: Hlavný framework a typová bezpečnosť.
- **Vite**: Moderný nástroj na zostavenie aplikácie (build tool).
- **Three.js & React-Three-Fiber (R3F)**: 3D renderovanie pomocou WebGL.
- **React-Three-Drei**: Pomocné nástroje pre R3F (ovládanie kamery, HTML v 3D).
- **Three-Mesh-BVH**: Zrýchlenie kolízií a výpočtov (napr. meranie hĺbky nadložia).
- **Proj4js & coords.ts**: Transformácie súradnícových systémov (UTM, S-JTSK na WGS84). Všetka geodetická logika je centralizovaná v `src/utils/coords.ts`.
- **XYZ Tile Streaming**: Integrácia sťahovania ortofotomáp v reálnom čase.


### 🏗 Architektúra (v2.4+)
Aplikácia využíva duálnu architektúru motorov (Dual-Engine) s čistým oddelením modulov:
- **`src/v1/` (Standard Engine):** Optimalizovaný pre klasické speleologické dáta (.lox, .3d) a rekonštrukciu povrchov (Surface Nets a Splay Wall Mesh s bisektorovou rovinou).
- **`src/v2/` (NextGen Engine):** Špeciálne navrhnutý pre masívne LiDAR mračná bodov. Využíva hierarchické **Octree LOD** indexovanie a streamovanie dát.
- **`src/shared/`:** Centralizované úložisko pre zdieľané typy, UI komponenty (`MeasurementPanel`, `FloatingClippingSlider`, `CompassRose`), shader materiály a geodetickú logiku.
- **Web Workers:** Binárne spracovanie, parser a generovanie LiDAR máp prebiehajú na pozadí, čo zabezpečuje plynulý 60 FPS chod UI.
- **Post-Processing & Rendering:** **Eye-Dome Lighting (EDL)** pre realistickú hĺbku, `three-geo` pre dynamické 3D Mapbox povrchy a optimalizovaný on-demand rendering pri nečinnosti (Zero Idle Load).
- **Meračský subsystém:** Plávajúci dokovateľný panel pre 2-bodové (vzdialenosť, prevýšenie, sklon, azimut) a 3+-bodové merania (polygón, plocha, obvod, spádnica, dip/strike).

### 📂 Podporované formáty
- **.lox (Therion)**: Najlepšia podpora vrátane stien jaskyne, splayov, textúr a terénu.
- **.3d (Survex)**: Podpora pre polygonové ťahy (v3 až v8).
- **.plt (Compass)**: Základná podpora pre dáta z Compassu.
- **.ply (LiDAR)**: Pokročilá rekonštrukcia povrchu, Octree LOD a korektné čítanie binárnych PLY typov.
- **.stl (3D Mesh)**: Binárne aj ASCII STL súbory načítané ako jaskynné steny/scraps.
- **.tif / .tiff (GeoTIFF)**: Samostatné terénne vrstvy s podporou world súborov a reprojekcie.

---

## 🇺🇸 English Version

### 🛠 Technologies
- **React & TypeScript**: Core framework and type safety.
- **Vite**: Modern build tool and development server.
- **Three.js & React-Three-Fiber (R3F)**: WebGL-based 3D rendering.
- **React-Three-Drei**: Helper utilities for R3F (camera controls, HTML in 3D).
- **Three-Mesh-BVH**: Acceleration for collisions and calculations (e.g., depth measurement).
- **Proj4js & coords.ts**: Coordinate system transformations (UTM, S-JTSK to WGS84). Geodetic logic is centralized in `src/utils/coords.ts`.
- **XYZ Tile Streaming**: Real-time integration of orthophoto and terrain tiles.


### 🏗 Architecture (v2.4+)
The application uses a Dual-Engine architecture with clean module separation:
- **`src/v1/` (Standard Engine):** Optimized for classic survey data (.lox, .3d) and surface reconstruction (Surface Nets and splay walls with bisector normal plane filtering).
- **`src/v2/` (NextGen Engine):** Specifically designed for massive LiDAR point clouds. Utilizes hierarchical **Octree LOD** indexing and data streaming.
- **`src/shared/`:** Centralized repository for shared types, UI components (`MeasurementPanel`, `FloatingClippingSlider`, `CompassRose`), shader materials, and geodetic logic.
- **Web Workers:** Binary processing, parsing, and LiDAR plan map generation are offloaded to background threads, ensuring 60 FPS UI performance.
- **Post-Processing & Rendering:** **Eye-Dome Lighting (EDL)** for realistic point cloud depth, `three-geo` integration for dynamic 3D Mapbox surfaces, and on-demand rendering for zero CPU/GPU overhead when idle in the foreground.
- **Measurement Subsystem:** Dockable floating panel supporting 2-point distance/gradient/azimuth and 3+-point planar/polygon area and tectonic calculations.

### 📂 Supported Formats
- **.lox (Therion)**: Full support including cave walls, splays, textures, and DTM terrain.
- **.3d (Survex)**: Support for centerlines (v3 through v8).
- **.plt (Compass)**: Basic support for Compass plot data.
- **.ply (LiDAR)**: Advanced reconstruction, Octree LOD, and binary PLY scalar type handling.
- **.stl (3D Mesh)**: Binary and ASCII STL files loaded as cave wall/scrap geometry.
- **.tif / .tiff (GeoTIFF)**: Standalone terrain layers with world-file and reprojection support.
