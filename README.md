# LochViewer - Speleological Viewer (v2.3.0)

[🇸🇰 Slovenská verzia nižšie / Slovak version below](#slovenská-verzia)

A modern web application for 3D visualization and analysis of cave systems, built with React, Three.js, and React-Three-Fiber.

## 🚀 Version 2.3: Orthographic Projections, Structural Geology & High-Performance Rendering
Version 2.3 introduces complete orthographic projection and technical view presets, 3-point tectonic measurements, precise map texture calibration, plastic cave wall shading, and multi-threaded LiDAR plan map generation.

### 📐 Camera Projections & Technical View Presets
- **Perspective ↔ Orthographic Toggle**: Instant switch between natural 3D depth and technical axonometric projection without distance distortion (in topbar and via `O` key).
- **1-Click View Presets**:
  - 📐 **Plan View (`1`)**: Vertical top-down view aligned with Grid North for exact cave surveying.
  - ↔️ **Longitudinal Profile (`2`)**: True-scale front profile (South → North).
  - ↕️ **Cross Section (`3`)**: True-scale side profile (West → East).
  - 🧊 **3D Isometric View (`4`)**: Spatial axonometry with preserved camera target.
- **Full Dual-Engine Parity**: Available across both Engine v1 (LOX/3D/PLT/STL) and Engine v2 (NextGen LiDAR Point Clouds).

### ⛏️ Structural Geology & Tectonics (3-Point Measurements)
- **Planar Measurement**: Pick 3 points on cave walls, bedding planes, or surface terrain to calculate dip angle, dip direction, strike intersection line, plane area, and surface normal.
- **3D Plane Visualization**: Interactive 3D visual rendering of the fitted plane and dip slope line directly in the cave model.

### 🗺️ Surface Textures & Official GKÚ ZBGIS WMS
- **Official GKÚ WMS Service**: Direct integration with the Slovak Geodetic and Cartographic Institute for official orthophotos and DMR hillshade.
- **S-JTSK/UTM texture alignment**: Downloaded map textures are calibrated in the terrain's native coordinate system, including UTM-calibrated LOX surfaces.
- **Reusable calibration files**: Generated S-JTSK calibration text files can be loaded back with custom JPG/PNG textures.

### 🪨 Cave Walls & STL
- **Material presets**: Limestone, dolomite, grey limestone, and technical render presets improve cave wall readability.
- **Plastic wall shading**: Cavity shading, rim light, procedural relief, and improved lights make LOX/STL walls read as solid surfaces.
- **STL floor/ceiling/section modes**: STL models support the same floor, ceiling, and section filtering workflow as PLY mesh models.

### ⚡ Large Terrain Performance
- **Initial terrain LOD**: Large LOX DTM surfaces first render at lower density, then switch to full detail after the initial idle delay.
- **Cleaner default view**: The rotation gizmo is disabled by default and can still be enabled from the settings sidebar.

## 🚀 Version 2.2: NextGen Engine
The **NextGen (v2)** engine represents a major leap in performance and visual quality, specifically designed for massive LiDAR data and real-world geographic context.

### 🎛️ Integrated Sidebar UI (Master Switch)
- **Engine Master Switch**: Version 2.2 includes a unified sidebar where you can toggle between **Standard (v1)** and **NextGen (v2)** directly in the "Cave Walls" section using the **LIDAR NEXTGEN** switch.
- **Context-Aware Settings**: When NextGen is active, the sidebar dynamically switches to advanced LiDAR controls (Point Size, Brightness, Plasticity, Custom Colors). When off, it restores classic mesh tools (Organic Smoothing, 3D Render, Wireframe).

### ☁️ LiDAR Octree LOD & Streaming
- **Extreme Performance**: Handles models with millions of points (e.g., "Erna" with 6.2M pts) smoothly at 60 FPS.
- **Spatial Octree Indexing**: Dynamically loads and renders only the parts of the cave currently visible to the camera.
- **Web Worker Streaming**: File processing and indexing are offloaded to background threads, ensuring a lag-free UI.

### 🎨 Advanced Visuals
- **Eye-Dome Lighting (EDL)**: Custom post-processing shader that adds depth and structural clarity to point clouds and meshes alike.
- **Plasticity & Intensity**: New real-time controls to tune the "depth" of shadows and surface details, achieving a "genial" shading look for any model.
- **Custom Colors**: Integrated Color Picker for LiDAR models allowing users to set a natural cave look (browns, ochres) while keeping perfect shading.
- **Interactive Shading**: Adjust **Brightness** and **Point Size** (fine steps of 0.05) in real-time.
- **Normal-Based Shading**: Utilizes LiDAR normals for realistic "headlight" lighting from the viewer's perspective.
- **Enhanced Clipping**: Automatic high-visibility highlights on the edges of cross-sections.

### 🗺️ Geographic Context (Mapbox)
- **3D Terrain Integration**: Automatically fetches and renders 3D satellite terrain from Mapbox using `three-geo` based on cave GPS coordinates.
- **Hybrid X-Ray Mode**: View the cave model precisely positioned under a semi-transparent 3D surface.

### ✈️ Pro Navigation
- **Street View Flight**: Smoothly glide towards any point in the jaskyňa with a double-click.
- **Navigation History (Undo)**: Seamlessly return to previous positions using a dedicated Undo button or **Ctrl+Z**.

---

## 🔒 Security & Audit
LochViewer prioritizes user security and data protection. An independent security audit (May 2026) confirmed:
- **Zero known vulnerabilities** in npm dependencies (`npm audit` clean).
- **Secure OAuth2 implementation** for Google Drive uploads (tokens are kept in-memory, never stored locally).
- **Safe file parsing** isolated in Web Workers to prevent main-thread DoS.
- **Client configuration**: Vite `VITE_` values are public in the browser bundle. Protect Google and Mapbox keys with provider-side restrictions such as allowed referrers, scopes, and quotas.
- Detailed audit report: [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)

## 🚀 Latest Features

### 🛠 Stability & Security Hardening
- **Safer embeds**: Generated iframe snippets escape URL/title attributes and clamp embed dimensions.
- **Resource cleanup**: Blob URLs and Three.js GPU resources are released when models, textures, floor maps, terrain, or recordings are replaced.
- **PLY correctness**: Binary PLY parsing now respects declared scalar types such as `double`, `ushort`, `uchar`, and `float` for coordinates, colors, intensity, and classifications.
- **Coordinate consistency**: S-JTSK reprojection uses one shared definition across terrain, GPS, TIFF, and XYZ workflows.

### ☁️ Cloud Sharing (Google Drive) & Security
- **Direct Upload**: Users can seamlessly upload models directly to their own Google Drive from the application.
- **Auto-Permissions**: The app automatically sets the file to public and generates a CORS-friendly URL for iframe embedding.
- **Privacy-First**: Files are hosted on the user's account, giving them full control over their data without consuming the developer's server storage.
- **Protected Credentials**: Secure environment variable setup for Google Cloud API keys.

### 👤 Improved Caver Avatar (Scale)
- **Custom Lighting**: The caver character features an integrated `pointLight` and a glowing headlamp, making it clearly visible even in the darkest parts of the cave.
- **Clipping Support**: The caver is fully integrated into the clipping plane system.
- **Dynamic Calibration**: The caver moves synchronously with the cave during X, Y, Z calibration.

### 📐 Position Calibration & Manual GPS
- **Interactive Model Shift**: Manually shift the cave model (traverse, stations, walls) relative to a fixed surface in X, Y, and Z axes.
- **Fine-tuning (0.5m)**: Calibration works in 0.5-meter steps for maximum precision when fitting the cave under the terrain.
- **Manual GPS Entry**: New UI for manual assignment of WGS84 coordinates to any survey station.
- **Altitude Fetching**: Integrated ZBGIS API to automatically retrieve ground elevation based on assigned GPS coordinates.

### 🌎 World-Class Surfaces & XYZ Scraping
- **XYZ Tile Integration**: Seamlessly fetch Orthophoto and Digital Terrain Models (DMR5) using a pyramid tile system (XYZ).
- **Standalone Surface Layers**: Import external terrain data from GeoTIFF (.tif/.tiff) files as additional layers.
- **World File Support (.tfw)**: Automatic georeferencing using sidecar .tfw files for perfect spatial alignment.
- **Automatic CRS Reprojection**: Intelligently transforms S-JTSK Krovak terrain coordinate matrices into the cave model's GPS/UTM coordinate system.
- **Tiled Rendering**: Optimized rendering pipeline handling high-resolution terrain via XYZ streaming.


### ☁️ LiDAR & Point Cloud Support (.ply)
- **High-Performance Parser**: Native binary PLY parser supporting millions of vertices with RGB color data.
- **Surface Reconstruction**: Convert raw point clouds into high-fidelity 3D shells.
  - **Organic (Silk)**: New "Silk/Fabric" membrane effect using high-tension Laplacian smoothing.
  - **Triangle Mesh (Accurate)**: Precision reconstruction using Taubin non-shrinking algorithm.
  - **Surface Nets**: Professional dual-contouring topology for seamless cave meshes.
  - **Bulge / Dilation Control**: Interactive slider to adjust model volume (dilation/erosion) for a better fit or visual clarity.
- **Pure Wireframe Mode**: Interactive triangular net visualization that hides raw points for a clean, structural view.
- **Analytical Coloring**: Support for elevation gradients (Color by height) on both solid surfaces and wireframes.
- **Customization**: Dedicated color picker for cave walls and LiDAR meshes in the sidebar.
- **Smart Ceiling Fix**: Optimized PLY processing that prevents automatic classification from cutting off cave ceilings, ensuring full vertical fidelity.

### 📏 Measurement Mode & Interaction Control
- **Strict Gating**: New toggle to switch between "Navigation" and "Measurement" modes.
- **Safety First**: In Navigation mode, the 3D model ignores LiDAR points and meshes, making it impossible to accidentally click on dense clouds.
- **Polygon Priority**: Only survey stations (LOX/PLT) are interactive when measurement is off, ensuring fast and precise cave traverse analysis.
- **Full Analysis**: Activating Measurement Mode restores full interaction with all layers (LiDAR, Terrain, Organic Shell).

### ✂️ Advanced Spatial Analysis (Clipping & Profiles)
- **Highlighted Intersection Edges**: Real-time rendering of intersection lines between clipping planes and 3D models (cave walls, terrain, organic LiDAR).
- **Custom Analysis Colors**: Independent color pickers for cave and terrain clipping highlights to improve visual distinction in complex cross-sections.
- **Vertical Cross-Sections**: Define precise vertical profiles by selecting two points on any model (legacy survey or LiDAR).

### 🎡 Adaptive Rotation Gizmo
- **Smart Orientation**: A professional visual aid for 3D rotation that appears dynamically during interaction.
- **Model-Relative Scaling**: The gizmo automatically adjusts its size and line thickness to match the dimensions of the specific cave model, ensuring perfect visibility across all scales.
- **Minimalist Aesthetic**: Ultra-thin rings and axis indicators provide a premium look without cluttering the viewport.
- **Interactive Feedback**: Tied to the movement state, it serves as a subtle guide during navigation and disappears when the model is stable.

### 🔗 Embedding & Sharing
- **Google Maps Style Embed**: Embed 3D models into any webpage using `<iframe>`.
- **URL State Persistence**: All sidebar settings (themes, colors, clipping planes, terrain) are automatically saved to the URL.
- **Embedding from a page that holds the file**: a host page can hand the viewer a model's bytes with `postMessage` instead of an address — for files behind a sign-in, or whose address carries a token that must not end up in a URL, a server log or a Referer. The viewer answers only the window that framed or opened it, and only the origin that sent the file.

```js
const frame = document.querySelector('iframe#viewer')   // src: https://…/?embed=true
window.addEventListener('message', async (e) => {
  if (e.source !== frame.contentWindow) return
  if (e.data?.type === 'lochviewer:ready') {
    const data = await (await fetch('/my/cave.3d', { credentials: 'include' })).arrayBuffer()
    frame.contentWindow.postMessage({ type: 'lochviewer:open', name: 'cave.3d', data }, '*', [data])
  }
  // then: 'lochviewer:loaded' { name, stations, segments }, 'lochviewer:error' { message },
  //       'lochviewer:station' { name, x, y, z } when a named station is clicked
})
```

The same works for a window opened with `window.open` (without `noopener`). The name's extension chooses the parser. See `src/shared/embed/embedMessages.ts`.

## 🛠 Installation and Running

1. **Clone the repository**:
    ```bash
    git clone https://github.com/dankez/CaveView.js.git
    cd CaveView-modernized
    ```
2. **Install dependencies**: `npm install`
3. **Environment Setup**: Copy `.env.example` to `.env` and fill in your Google Cloud credentials.
4. **Development mode**: `npm run dev`
5. **Production Build**: `npm run build`

## 📂 Supported Formats
* `.lox` (Therion / Loch data - including textures and DTM)
* `.3d` (Survex data)
* `.plt` (Compass data)
* `.ply` (Binary LiDAR Point Clouds)
* `.stl` (3D Mesh models - binary and ASCII)
* `.tif / .tiff` (GeoTIFF Terrain Models)

---
<a name="slovenská-verzia"></a>
# LochViewer - Speleologický Prehliadač (v2.3.0)

Moderná webová aplikácia pre 3D vizualizáciu a analýzu jaskynných systémov, postavená na technológiách React, Three.js a React-Three-Fiber.

## 🚀 Verzia 2.3: Ortogonálne zobrazenie, Štruktúrna geológia a Výkonný rendering
Verzia 2.3 prináša kompletné ortogonálne (axonometrické) zobrazenie s rýchlymi technickými pohľadmi, 3-bodové tektonické merania, oficiálny GKÚ ZBGIS WMS servis, plastické tieňovanie stien a generovanie 2D máp z LiDAR modelov.

### 📐 Projekcia kamery a Technické pohľady
- **Prepínač Perspektíva ↔ Ortogonálne zobrazenie**: Okamžitý prechod medzi prirodzenou 3D perspektívou a technickou axonometriou bez skreslenia vzdialeností (v hornej lište a cez kláves `O`).
- **Rýchle pohľady na 1 klik**:
  - 📐 **Pôdorys (`1`)**: Kolmý pohľad zhora zarovnaný so severom pre presné speleologické mapovanie.
  - ↔️ **Pozdĺžny profil (`2`)**: Čelný pohľad (Juh → Sever) v reálnej mierke.
  - ↕️ **Priečny profil / Bokorys (`3`)**: Bočný profil (Západ → Východ).
  - 🧊 **3D Izometria (`4`)**: Axonometrický priestorový pohľad.
- **Plná podpora oboch motorov**: Funkčné v Engine v1 (LOX/3D/PLT/STL) aj v Engine v2 (NextGen LiDAR Point Clouds).

### ⛏️ Štruktúrna geológia a Tektonika (3-bodové meranie)
- **Meranie roviny**: Výber 3 bodov na stene jaskyne, pukline alebo v teréne pre automatický výpočet sklonu po spádnici (*dip*), azimutu spádnice (*dip direction*), smeru vrstvy (*strike*), plochy a normály roviny.
- **3D vizualizácia roviny**: Vykreslenie preloženej 3D roviny a spádnice priamo v modeli.

### 🗺️ Textúry povrchu a Oficiálny GKÚ ZBGIS WMS
- **Oficiálny GKÚ WMS servis**: Priama integrácia s portálom Geodetického a kartografického ústavu SR pre ortofotomapy a DMR tieňovanie.
- **S-JTSK/UTM zarovnanie textúr**: Stiahnuté mapové textúry sa kalibrujú v natívnom súradnicovom systéme povrchu, vrátane UTM LOX modelov.
- **Opätovne použiteľná kalibrácia**: Vygenerované S-JTSK kalibračné TXT súbory sa dajú načítať späť pri custom JPG/PNG textúrach.

### 🪨 Steny jaskyne a STL
- **Material presets**: Vápenec, dolomit, sivý vápenec a technický render zlepšujú čitateľnosť stien.
- **Plastické tieňovanie stien**: Cavity shading, rim light, procedurálny reliéf a lepšie svetlá robia LOX/STL steny pevnejšie čitateľné.
- **STL floor/ceiling/section režimy**: STL modely podporujú rovnaké filtrovanie podlahy, stropu a rezu ako PLY mesh modely.

### ⚡ Výkon veľkých povrchov
- **Initial terrain LOD**: Veľké LOX DTM povrchy sa najprv zobrazia v nižšej hustote a po krátkom idle prepne aplikácia plný detail.
- **Čistejší default pohľad**: Rotačné gizmo je predvolene vypnuté a dá sa zapnúť v sidebare.

## 🚀 Verzia 2.2: NextGen Engine
Engine **NextGen (v2)** predstavuje zásadný skok vo výkone a vizuálnej kvalite, navrhnutý špeciálne pre masívne LiDAR dáta a reálny geografický kontext.

### 🎛️ Integrované UI v sidebare (Master Switch)
- **Hlavný vypínač motora**: Verzia 2.2 prináša zjednotené ovládanie. V sekcii "Steny jaskyne" nájdete prepínač **LIDAR NEXTGEN**, ktorý okamžite prepne celú scénu do moderného režimu.
- **Kontextové nastavenia**: Ak je NextGen aktívny, sidebar zobrazí len LiDAR funkcie (Veľkosť bodov, Jas, Plasticita, Vlastná farba). Po vypnutí sa vrátia klasické nástroje (Organické vyhladzovanie, 3D Render, Drôtený model).

### ☁️ LiDAR Octree LOD a Streaming
- **Extrémny výkon**: Plynule zvláda modely s miliónmi bodov (napr. „Erna“ s 6.2M bodmi) pri 60 FPS.
- **Priestorové Octree indexovanie**: Dynamicky načítava a renderuje iba tie časti jaskyne, ktoré sú aktuálne v zornom poli kamery.
- **Web Worker Streaming**: Spracovanie súborov prebieha na pozadí, vďaka čomu rozhranie zostáva bleskovo rýchle aj pri načítavaní gigabajtových dát.

### 🎨 Pokročilý vizuál
- **Eye-Dome Lighting (EDL)**: Špeciálny shader, ktorý dodáva mračnu bodov aj stenám jaskyne hĺbku a jasné kontúry.
- **Ladenie plasticity**: Nový posuvník pre dynamickú kontrolu hĺbky tieňov a sýtosti detailov povrchu pre dosiahnutie "geniálneho" tieňovania.
- **Vlastné farby**: Možnosť manuálneho výberu farby mračna bodov cez Color Picker pri zachovaní plnej plasticity.
- **Interaktívne ladenie**: Upravte si **Jas** a **Veľkosť bodov** (jemný krok 0.05) v reálnom čase.
- **Tieňovanie podľa normál**: Využíva LiDARové normály pre realistické nasvietenie štýlom „čelovka“.
- **Zvýraznené rezy**: Automatické vysvietenie hrán pri použití orezávacích rovín pre lepšiu analýzu profilov.

### 🗺️ Geografický kontext (Mapbox)
- **Integrácia 3D terénu**: Automaticky sťahuje a renderuje 3D satelitný terén z Mapboxu (pomocou `three-geo`) na základe GPS polohy jaskyne.
- **Hybridný X-Ray mód**: Sledujte jaskynný model presne osadený pod polopriesvitným 3D povrchom kopca.

### ✈️ Profesionálna navigácia
- **Street View let**: Plynulý presun k akémukoľvek bodu v jaskyni pomocou dvojkliku.
- **História pohybu (Undo)**: Možnosť vrátiť sa na predchádzajúcu pozíciu tlačidlom Späť alebo skratkou **Ctrl+Z**.

---

## 🔒 Bezpečnosť a Audit
LochViewer kladie veľký dôraz na bezpečnosť používateľov a ochranu dát. Nezávislý bezpečnostný audit (Máj 2026) potvrdil:
- **Nulový počet známych zraniteľností** v npm závislostiach (čistý `npm audit`).
- **Bezpečná implementácia OAuth2** pre nahrávanie na Google Drive (tokeny zostávajú len v pamäti, nikdy sa neukladajú na disk).
- **Bezpečné spracovanie súborov** izolované vo Web Workeroch, čo chráni hlavné vlákno pred DoS útokmi.
- **Klientská konfigurácia**: Hodnoty `VITE_` sú verejné v browser bundle. Google a Mapbox kľúče chráňte obmedzeniami u poskytovateľa, napríklad povolenými referrermi, scope a kvótami.
- Podrobná správa z auditu: [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)

## 🚀 Najnovšie funkcie

### 🛠 Stabilizácia a bezpečnostné spevnenie
- **Bezpečnejší embed**: Generovaný iframe kód escapuje URL/title atribúty a orezáva rozmery embedu do rozumného rozsahu.
- **Uvoľňovanie zdrojov**: Blob URL a Three.js GPU zdroje sa uvoľňujú pri výmene modelov, textúr, podlahových máp, terénu a nahrávok.
- **Korektnejší PLY parser**: Binárny PLY parser rešpektuje deklarované typy ako `double`, `ushort`, `uchar` a `float` pri súradniciach, farbách, intenzite aj klasifikácii.
- **Konzistentné súradnice**: S-JTSK reprojekcia používa jednu spoločnú definíciu pre terrain, GPS, TIFF a XYZ workflow.

### ☁️ Zdieľanie cez Cloud (Google Drive) a Bezpečnosť
- **Priamy Upload**: Používatelia môžu plynule nahrať modely na svoj vlastný Google Disk priamo z aplikácie.
- **Automatické práva**: Aplikácia automaticky nastaví súbor ako verejný a vygeneruje URL adresu kompatibilnú s CORS pre vkladanie do iframov.
- **Dôraz na súkromie**: Súbory sú hostované na účte používateľa, čo mu dáva plnú kontrolu nad dátami bez toho, aby zaberali úložisko vývojára.
- **Ochrana prístupov**: API kľúče a OAuth identifikátory sú bezpečne chránené pomocou environmentálnych premenných.

### 👤 Vylepšený jaskyniar (Scale)
- **Vlastné osvetlenie**: Postava jaskyniara má teraz integrovaný `pointLight` a svietiacu čelovku. Je jasne viditeľná aj v najtmavších častiach jaskyne.
- **Podpora pre rezy (Clipping)**: Jaskyniar je plne integrovaný do systému orezávania. Pri použití rezov (profilov) sa postava správne oreže spolu s okolím.
- **Dynamická kalibrácia**: Jaskyniar sa pohybuje synchrónne s jaskyňou pri nastavovaní X, Y, Z kalibrácie.

### 📐 Kalibrácia polohy a manuálne GPS
- **Interaktívny posun modelu**: Možnosť manuálne posúvať jaskynný model (polygonový ťah, stanice, steny) voči fixnému povrchu v osiach X, Y a Z.
- **Jemné doladenie (0.5m)**: Kalibrácia prebieha v krokoch po 0.5 metra pre maximálnu presnosť pri pasovaní jaskyne pod terén.
- **Manuálne GPS**: Nové rozhranie pre priradenie WGS84 súradníc ktorejkoľvek meracej stanici.
- **Sťahovanie výšok**: Integrácia API ZBGIS pre automatické získanie nadmorskej výšky terénu podľa GPS polohy.

### 🌎 Špičkové povrchy a XYZ Scraping
- **Integrácia XYZ dlaždíc**: Plynulé sťahovanie ortofotomáp a DMR5 modelov pomocou pyramídového systému (XYZ).
- **Samostatné vrstvy povrchu**: Importujte externé topografické dáta z GeoTIFF (.tif/.tiff) súborov ako dodatočné vrstvy.
- **Podpora World súborov (.tfw)**: Automatické georeferencovanie pomocou sprievodných .tfw súborov.
- **Automatická reprojekcia (CRS)**: Aplikácia inteligentne prepočítava S-JTSK (Krovak) súradnice terénu do GPS/UTM súradníc jaskyne.
- **Dlaždicové renderovanie**: Optimalizovaná vykresľovacia pipeline využívajúca XYZ streaming pre prácu s modelmi vo vysokom rozlíšení.


### ☁️ Podpora LiDAR a mračien bodov (.ply)
- **Vysokovýkonný parser**: Natívny binárny PLY parser s podporou miliónov bodov vrátane RGB farieb.
- **Rekonštrukcia povrchu**: Premeňte surové mračno bodov na 3D model jediným kliknutím.
  - **Organický (Silk)**: Nový efekt „napnutej látky“ (hodvábu) pomocou Laplacian vyhladzovania.
  - **Trojuholník / Mesh**: Presná rekonštrukcia (Taubin algorithm) pre technickú analýzu.
  - **Surface Nets**: Profesionálna dual-contouring topológia pre plynulé modely.
  - **Vypuklosť (Bulge/Dilation)**: Interaktívny posuvník pre dodatočnú dilatáciu modelu, umožňujúci "nafúknutie" alebo zúženie rekonštruovanej jaskyne.
- **Čistý drôtený model**: Interaktívna trojuholníková sieť, ktorá skryje surové body pre lepšiu prehľadnosť geometrie.
- **Analytické vyfarbenie**: Podpora výškových gradientov (Farebné podľa výšky) pre plné modely aj drôtenú sieť.
- **Personalizácia**: Vlastný výber farieb pre LiDAR modely pomocou Color Pickera v sidebare.
- **Fixácia orezania stropov**: Optimalizovaný PLY processing, ktorý eliminuje chybu horizontálneho odrezávania horných častí jaskyne pri generovaní modelov.

### 📏 Režim merania a kontrola interakcie
- **Striktné bránenie (Gating)**: Nový prepínač medzi režimom navigácie a merania.
- **Zameranie na polygon**: Ak nie je meranie aktívne, 3D model ignoruje LiDAR a terén. To zabraňuje náhodnému klikaniu na milióny bodov pri prezeraní jaskynného ťahu.
- **Priorita jaskyne**: V základnom stave sú interaktívne IBA body polygonového ťahu (LOX/PLT), čo zaručuje bleskovú analýzu merania bez rušenia mračnom bodov.
- **Plná analýza**: Zapnutím merania sa aktivuje raycasting pre všetky vrstvy (LiDAR, terén, organický model).

### ✂️ Pokročilá priestorová analýza (Rezy a profily)
- **Zvýraznené hrany rezu**: Renderovanie priesečníkov medzi orezávacími rovinami a 3D modelmi (steny jaskyne, terén, organický LiDAR) v reálnom čase.
- **Vlastné farby analýzy**: Nezávislé výbery farieb pre zvýraznenie rezov jaskyne a terénu pre lepšiu prehľadnosť v zložitých profiloch.
- **Vertikálne rezy**: Definujte presné vertikálne profily výberom dvoch bodov na ľubovoľnom modeli (klasické meranie alebo LiDAR).

### 🎡 Adaptívny Rotačný Gizmo
- **Inteligentná orientácia**: Profesionálna vizuálna pomôcka pre 3D rotáciu, ktorá sa dynamicky zobrazuje počas interakcie s modelom.
- **Relatívna mierka**: Gizmo automaticky prispôsobuje svoju veľkosť a hrúbku čiar rozmerom konkrétnej jaskyne, čo zaručuje perfektnú viditeľnosť pri malých dómoch aj veľkých systémoch.
- **Minimalistická estetika**: Ultra-tenké prstence a indikátory osí poskytujú prémiový vzhľad bez vizuálneho šumu.
- **Interaktívna odozva**: Nástroj je prepojený so stavom pohybu – slúži ako jemný sprievodca počas navigácie a po zastavení zmizne, aby neprekrýval model.

### 🔗 Zdieľanie a Embedovanie
- **Google Maps Style Embed**: Možnosť vkladať 3D modely do ľubovoľných webových stránok pomocou `<iframe>`.
- **URL State Persistence**: Všetky nastavenia sidebaru sa automaticky ukladajú do URL. Keď niekomu pošlete odkaz, uvidí presne to isté.
- **Vloženie zo stránky, ktorá má súbor**: hostiteľská stránka môže viewer-u poslať samotný súbor cez `postMessage` namiesto adresy (napr. súbor za prihlásením). Popis správ je v anglickej časti vyššie.

## 🛠 Inštalácia a spustenie

1. **Klonovanie repozitára**:
    ```bash
    git clone https://github.com/dankez/CaveView.js.git
    cd CaveView-modernized
    ```
2. **Inštalácia závislostí**: `npm install`
3. **Nastavenie prostredia**: Skopírujte `.env.example` na `.env` a doplňte svoje údaje pre Google Cloud.
4. **Vývojový režim**: `npm run dev`
5. **Produkčný Build**: `npm run build`

## 📂 Podporované formáty
* `.lox` (Therion / Loch data - vrátane textúr a DTM)
* `.3d` (Survex data)
* `.plt` (Compass data)
* `.ply` (Binárne LiDAR mračná bodov)
* `.stl` (3D Mesh modely - binárne aj ASCII)
* `.tif / .tiff` (GeoTIFF terénne modely)

---
## 📄 Documentation / Dokumentácia
Detailed guides and technical specifications are available in the [docs/](docs/) directory:
- [GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md): Google Cloud & API configuration guide.
- [TECHNICAL_DOCS.md](docs/TECHNICAL_DOCS.md): Project architecture and library overview.
- [ALGORITHMS.md](ALGORITHMS.md): Detailed mathematical formulas and 3D reconstruction logic (Taubin, Silk, Surface Nets).
- [SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md): Security posture and audit results.

© 2026 LochViewer Project. Vyvinuté pre profesionálne speleologické prezentácie a výskum.
