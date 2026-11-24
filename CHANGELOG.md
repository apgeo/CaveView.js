# Changelog

## [2.5.15] - 2026-10-27
### Webová kvalita, prístupnosť WCAG 2.2 a SEO optimalizácia / Web Quality, WCAG 2.2 Accessibility & SEO Optimization
- **100% prístupnosť (WCAG 2.2 AA)**: Všetky prvky pre výber súborov (`<input type="file">` v dropzone aj bočných paneloch) boli doplnené o explicitný atribút `aria-label`, čím sa zabezpečila plná podpora pre asistenčné čítačky obrazovky. Upravené kontrastné pomery pre odznaky verzií (`.changelog-badge`, kontrast 6.8:1), kategórie zmien (`.changelog-group`, kontrast 7.5:1) a odkaz na zásady ochrany osobných údajov (`/privacy.html`, kontrast >6.5:1) tak, aby spoľahlivo prevyšovali prahovú hodnotu WCAG AA 4.5:1. / Reached 100% WCAG 2.2 AA accessibility score: added explicit `aria-label` attributes to all file upload inputs (`<input type="file">`), and increased color contrast ratios for changelog badges (`.changelog-badge`, 6.8:1), changelog category headers (`.changelog-group`, 7.5:1), and privacy footer links (`/privacy.html`, >6.5:1) well above the 4.5:1 threshold.
- **100% SEO a platný `robots.txt` a `sitemap.xml`**: Vytvorený statický súbor `public/robots.txt` a `public/sitemap.xml`. Odstránilo sa 32 syntaktických chýb spôsobených predchádzajúcim SPA fallbackom servera na `index.html`. Do hlavičky `index.html` bol doplnený kánonický odkaz `<link rel="canonical" href="https://loch.sss.sk/" />`. / Achieved 100% SEO score: added static `public/robots.txt` and `public/sitemap.xml`, eliminating 32 syntax errors from SPA routing fallback, and added `<link rel="canonical" href="https://loch.sss.sk/" />` to `<head>`.
- **Optimalizácia sieťového prenosu fontov (>90% úspora dát)**: Úprava načítania Google Fontu Material Symbols z plného variabilného spektra na fixnú veľkosť s `&display=swap`. Veľkosť binárneho fontu klesla z **3,9 MB na 323 KB (úspora >90 %)** a odstránila penalizáciu blokovania renderovania. Z hlavičky HTML boli odstránené zastarané meta značky zakazujúce lokálne prehliadačové cachovanie. / Reduced font payload by >90% (from 3.9 MB down to 323 KB) by switching from unbounded variable axis Google Font queries to standard glyph set with `&display=swap`, eliminating render-blocking penalties. Removed obsolete cache-disabling meta tags from HTML head.
- **Podpora pre Agentic Browsing (`llms.txt`)**: Do `public/llms.txt` bola pridaná štandardizovaná dokumentácia a špecifikácia schopností prehliadača LochViewer pre asistenčné AI systémy. / Added standardized `public/llms.txt` specification for AI agents and assistant tools.

## [2.5.14] - 2026-10-27
### Voľba farby podľa výšky pre Splay SDF model stien (predvolene zapnutá a zobrazená) / Default visible color by height for Splay SDF 3D walls
- **Predvolene zobrazený ovládací prvok Farba podľa výšky (`splayAltitude`)**: V bočnom paneli v sekcii `Splay SDF steny (2D/3D)` je priamo pod hlavičkou ako primárny riadok zobrazený prepínač `Farba podľa výšky`. Možnosť je predvolene zapnutá (`splayAltitude: true`), takže používateľ okamžite vidí plnofarebný hypsometrický gradient bez nutnosti otvárať podrobnosti. / Added default visible `Color by height` primary toggle directly under the Splay SDF walls accordion header, enabled by default (`splayAltitude: true`) to immediately show hypsometric altitude gradient coloring without expanding details.
- **Okamžité prepnutie a výber monochromatickej farby (`ColorPicker`)**: Pri vypnutí farby podľa výšky sa vedľa prepínača okamžite zobrazí výber farby (`ColorPicker`), ktorý umožňuje nastaviť vlastnú jednoliatu farbu stien (`colorScraps`). Prepnutie režimu farbenia je vďaka vopred vypočítaným vertex farbám v `createSplayBufferGeometry` okamžité (0 ms) bez nutnosti znovuvýpočtu siete workerom. / When color by height is disabled, a `ColorPicker` appears inline to customize the uniform wall color (`colorScraps`). Toggling between height gradient and solid color executes instantly (0 ms) via shader vertex color switching without re-triggering worker isosurface reconstruction.
- **Prepojenie s výškovou legendou (Legend HUD)**: Ak je aktívny Splay SDF model s farbením podľa výšky, na obrazovke sa automaticky aktivuje a zobrazuje výšková legenda s farebnou škálou a reálnymi nadmorskými výškami modelu. / Linked Splay SDF altitude mode to the HUD Elevation Legend, displaying min/max heights and the gradient bar when SDF walls are visible.
- **Trvalé ukladanie do URL (`salt=0`)**: Stav voľby `splayAltitude` sa synchronizuje v URL parametri (`salt=0` pri vypnutí), čo umožňuje presné zdieľanie a vkladanie cez iframe. / Preserved `splayAltitude` in shareable URLs via `salt=0` query parameter.

## [2.5.13] - 2026-10-27
### Zobrazenie červenej hrany rezu pre Splay SDF 3D model stien / Red clipping cut edge visualization for Splay SDF 3D walls
- **Integrácia `ClippingEdges` do `SplayCaveWalls`**: Pridané vykresľovanie červenej línie rezu (`colorClippingEdges`, predvolene `#ff4444`) pri horizontálnom aj vertikálnom (profilovom) rezaní Splay SDF 3D modelu. Hrana rezu presne lícuje s rezanou rovinou na základe BVH priestorového stromu (`three-mesh-bvh`). / Integrated `ClippingEdges` into `SplayCaveWalls` to render the active cut cross-section outline in red (`colorClippingEdges`, default `#ff4444`) during horizontal and profile clipping.
- **Predvýpočet BVH stromu (`computeBoundsTree`) pre Splay BufferGeometry**: Pri vytvorení alebo načítaní geometrie z vyrovnávacej pamäte (`createSplayBufferGeometry`) sa automaticky inicializuje BVH bounds strom pre bleskové orezávanie a shapecast prienikov bez zásekov. / Precomputed BVH bounding volume hierarchy (`computeBoundsTree`) in `createSplayBufferGeometry` for instant raycasting and real-time clipping plane edge extraction.
- **Viacrovinový culling v `ClippingEdges`**: Ak je súčasne aktívny horizontálny aj profilový rez, úsečky hrany rezu ležiace v odrezanej polrovine druhého rezu sú automaticky odfiltrované, čím sa eliminuje plávanie nežiaducich čiar v prázdnom priestore. / Added multi-plane visibility culling in `ClippingEdges` so edge segments clipped by secondary planes are cleanly discarded.
- **Zosúladenie orezávania v Engine v2 (`CaveViewerNextGen`)**: Parameter `clippingPlanes` pre `SplayCaveWalls` v Engine v2 bol zjednotený na `caveClippingPlanes`, aby rešpektoval prepínač `Vylúčiť jaskyňu z rezu` (`excludeModelFromClipping`). / Standardized `clippingPlanes` for `SplayCaveWalls` in Engine v2 to `caveClippingPlanes`, properly respecting `excludeModelFromClipping`.

## [2.5.12] - 2026-10-26
### ~75× zrýchlenie generovania Splay SDF 3D modelu stien / ~75x Splay SDF 3D Cave Wall Generation Speedup
- **Narrow-Band Bounding-Box Splatting (`populateSdfGridNarrowBand`)**: Pôvodný hrubý priechod $O(V \times (T + C))$ cez všetky voxely 3D mriežky (vrátane $>98\ \%$ prázdnej horniny) bol nahradený priamym vpisovaním (splattingom) predpočítaných štvorstenov a kapsúl iba do úzkeho pásma ($\text{bandPad} = \max(0, \text{isovalue}) + k + 1,85 \cdot \Delta v$) okolo povrchu jaskyne. Výpočtová zložitosť klesla na $O(V_{\text{active}})$ a čas generovania 25-staničnej jaskyne (840 840 voxelov) sa skrátil z **>31 000 ms na ~409 ms (~75× zrýchlenie)** pri 100 % identickej výslednej 3D sieti. / Replaced the brute-force $O(V \times (T + C))$ full-grid evaluation loop with Narrow-Band Bounding-Box Splatting (`populateSdfGridNarrowBand`), evaluating primitives only within their narrow-band voxel AABBs ($\text{bandPad} = \max(0, \text{isovalue}) + k + 1.85 \cdot \Delta v$) and reducing runtime on a 25-station cave from **>31,000 ms to ~409 ms (~75x speedup)** with bit-exact mesh topology.
- **1D Half-Space Scanline Clipping a $O(1)$ vnútorná SDF štvorstena (`precomputeTetrahedrons`, `sdfPrecomputedTetrahedron`)**: Každý štvorsten má predpočítané 4 vonkajšie polpriestorové roviny $(\vec{n}_i, d_i)$. Pred vstupom do vnútornej slučky v osi $X$ sa interval $[x_{\text{start}}, x_{\text{end}}]$ analyticky oreže voči všetkým 4 polpriestorom, čím sa preskočí ~65 % rohov AABB boxu. Pre voxely vo vnútri konvexného štvorstena ($\max_i s_i \le 0$) sa presná hodnota SDF vráti v $O(1)$ ako $\max(s_0, s_1, s_2, s_3)$ bez jediného výpočtu vzdialenosti k trojuholníku a bez volania `Math.sqrt`. / Precomputed outward half-space plane equations for each tetrahedron, enabling 1D scanline interval clipping along the X-axis and $O(1)$ exact interior SDF evaluation ($\max_i s_i \le 0$) without triangle distance checks or `Math.sqrt`.
- **Trilineárne sub-voxelové normály v Surface Nets (`extractSurfaceNets`)**: Pôvodné 6-násobné volanie globálnej funkcie `evaluateSDF` pre každý vrchol siete (centrálne diferencie cez všetky štvorsteny a kapsuly) bolo nahradené $O(1)$ analytickým trilineárnym gradientom priamo z 8 rohov aktívnej bunky SDF mriežky a priamou indexáciou aktívnych buniek (`activeCellCoords`). / Eliminated 6 full-scene `evaluateSDF` calls per mesh vertex by computing analytical trilinear SDF gradients directly from the 8 cell corners in $O(1)$, paired with active-cell coordinate indexing.
- **Zero-Allocation skalárna geometria v `splayMath.ts`**: Všetky horúce geometrické funkcie (`pointToTriangleDistSqScalar`, `pointToSegmentDistSq`, `isPointInsideTetrahedron`) boli prepísané na čistú skalárnu aritmetiku v registroch CPU bez alokácie dočasných objektov `{ x, y, z }` na halde, čím sa úplne eliminoval tlak na Garbage Collector (GC). / Refactored hot-path geometry routines in `splayMath.ts` to zero-allocation scalar register arithmetic, eliminating millions of short-lived heap objects and GC pauses.

## [2.5.11] - 2026-10-26
### Optimalizácia výkonu vrstevníc na 60 FPS počas pohybu kamery / Contour 60 FPS Performance Optimization during Camera Motion
- **Okamžitá odozva a stabilných 60+ FPS pri pohybe**: Pri rotácii, približovaní a posune kamery sa dočasne potláča vykresľovanie HTML kót vrstevníc (`isMoving`), čím sa eliminuje prepočítavanie stoviek DOM elementov, layout reflow a frame dropy. Po uvoľnení ovládania (180 ms idle stabilizácia) sa kóty vrstevníc okamžite a plynulo zobrazia na správnych pozíciách. / Instant responsiveness and rock-solid 60+ FPS during camera orbit, pan, and zoom by deferring DOM contour label projection during active movement (`isMoving`). Labels reappear cleanly after camera motion settles (180 ms idle threshold).
- **Zdieľaný `MeshBasicMaterial` s hardvérovým cullingom pre čiary vrstevníc**: Pôvodný ťažký `MeshStandardMaterial` (s PBR osvetlením, normálami a výpočtami svetelných zdrojov na 500 000 trojuholníkoch) nahradený ultra-ľahkým `MeshBasicMaterial` inštanciovaným jediný raz na úrovni `TerrainMesh` a zdieľaným naprieč všetkými dlaždicami terénu. Zapnutý hardware face culling (`side: THREE.FrontSide`) a zníženie počtu materiálov a kompilácií shaderov z $N$ na 1. / Replaced heavy per-tile `MeshStandardMaterial` (full PBR lighting computation across 500,000 triangles) with a single, shared `MeshBasicMaterial` at `TerrainMesh` level with hardware front-face culling (`side: THREE.FrontSide`), eliminating redundant shader compilations and lighting passes.
- **Odstránenie `backdropFilter` a per-label `useFrame` v kótach vrstevníc**: Zrušený náročný GPU backdrop Gaussian blur filter a per-element `useFrame` v `ContourLabelItem`. Škálovanie podľa vzdialenosti kamery zabezpečuje priamo Drei `distanceFactor={85}` s optimalizovaným GPU renderingom (`willChange: transform`), čo odľahčuje záťaž hlavného vlákna a grafického čipu. / Removed expensive GPU backdrop blur filter and per-label `useFrame` distance scaling loop in `ContourLabelItem`, utilizing Drei's native `distanceFactor={85}` and GPU hardware-composited styling (`willChange: transform`).
- **Inteligentné obmedzenie hustoty kót (max 36 štítkov)**: Optimalizované filtrovanie rozmiestnenia kót na vrstevniciach zaručuje rovnomerné pokrytie terénu bez zahltenia pamäte a DOM stromu aj na strmých LiDAR DTM reliéfoch. / Balanced contour label budget (max 36 labels globally, max 3 per elevation level) maintaining high readability without DOM bloat.

## [2.5.10] - 2026-10-26
### Automatická Bpv korekcia výšky terénu (Slovenský kvázigeoid) a detekcia zamerania vchodu / Automatic Bpv sea-level height correction & cave CRS detection
- **Automatická Bpv korekcia nadmorskej výšky (Slovenský kvázigeoid DVRM05 / DMQSK2014-E)**: DMR 5.0 raster stiahnutý z WCS INSPIRE služby GKÚ SR je poskytovaný v elipsoidických výškach ETRS89 (elipsoid GRS80), ktoré sú na Slovensku o cca $+35\text{ až }+46\ \text{m}$ (priemerne $+41,6\ \text{m}$) vyššie než reálna nadmorská výška Balt po vyrovnaní (Bpv). V module `slovakiaQuasigeoid.ts` je integrovaná vysokopresná interpolácia národného kvázigeoidu, ktorá automaticky prevedie výšky terénu na nadmorskú výšku ($H_{\text{Bpv}} = h_{\text{ETRS89}} - \zeta$), takže terén dokonale lícuje s podzemnými stanicami jaskyne. / GKÚ SR INSPIRE WCS elevation service returns ETRS89 ellipsoidal heights (GRS80 ellipsoid) which are $+35$ to $+46\ \text{m}$ (average $+41.6\ \text{m}$) higher than Baltic sea-level normal heights (Bpv). Integrated high-precision Slovak quasigeoid interpolation (`slovakiaQuasigeoid.ts`) to automatically reduce DMR 5.0 surface heights ($H_{\text{Bpv}} = h - \zeta$) to exact sea-level elevations matching cave survey stations.
- **Možnosť voľby výškového systému v paneli DMR 5.0**: Predvolenou voľbou je `Bpv (nadmorská výška)` s možnosťou prepnúť na `ETRS89 (elipsoid)` pre prípady, kedy používateľ potrebuje surové nezmenené satelitné dáta GKÚ. Pri sťahovaní a exporte súborov je výškový systém uvedený aj v názve súboru a telemetrii. / Added vertical datum selector in DMR 5.0 panel: defaults to `Bpv (sea level)` with optional toggle to `ETRS89 (ellipsoid)` for uncorrected raw LiDAR data.
- **Automatická detekcia spôsobu zamerania vchodu (`caveCoordinateSystem.ts`)**: Systém automaticky analyzuje načítaný model (`.lox`, `.3d`, `.plt`) a z príznakov staníc (`isEntrance`, `isFixed`) a hodnôt súradníc spoľahlivo identifikuje:
  1. **S-JTSK (Křovák)**: Automaticky prepočíta DMR 5.0 kalibráciu do S-JTSK vrátane meridiánovej konvergencie $\gamma$ (rotácia o cca $-2,9^\circ$ až $-8^\circ$).
  2. **GPS (ETRS89-TM34 / UTM)**: Priame 1:1 zosúladenie s DMR 5.0 bez rotácie.
  3. **Lokálny meračský systém (nezameraný vchod)**: Ukotvenie terénu na primárny vchod jaskyne podľa zadaného GPS so zachovaním orientácie na geografický sever. / Automatic cave coordinate frame and entrance survey detection (`caveCoordinateSystem.ts`): reliably identifies S-JTSK (Krovak with meridian convergence adjustment), GPS (UTM 34N), or local relative survey frames.
- **Informačný stavový odznak v paneli DMR 5.0**: Zobrazuje detekovaný súradnicový systém modelu a informácie o primárnom vchode (názov stanice, nadmorská výška). / Informational status badge in DMR 5.0 panel displaying detected coordinate system and entrance details.

## [2.5.9] - 2026-10-26
### Zjednotený riadok vrstevníc a umiestnenie textúry terénu / Unified single-row contour controls & bottom terrain texture placement
- **Zjednotený jednoriadkový ovládací prvok vrstevníc**: Pôvodné tri riadky s rovnakým označením „Vrstevnice“ boli konsolidované do jediného prehľadného riadku obsahujúceho označenie `Vrstevnice (10m)`, výber farby pre tenké základné vrstevnice (`contourColor`), výber farby pre hrubé hlavné vrstevnice (`contourColor10`) a prepínač zapnutia/vypnutia. Odstránené boli nadbytočné duplicitné položky vrstevníc z podrobností terénu. / Consolidated the three separate "Contours" controls into a single streamlined row containing the label `Contours (10m)`, base contour line color swatch (`contourColor`), major index contour color swatch (`contourColor10`), and toggle switch. Removed redundant duplicate contour rows from the expanded terrain details.
- **Presunutie textúry (JPG/PNG) na koniec nastavení terénu**: Ovládací prvok `Textúra (JPG/PNG)` bol v primárnom zozname povrchov aj v rozšírených podrobnostiach presunutý na poslednú pozíciu za tieňovaný model, drôtený model, výškovú sieť a vrstevnice. / Repositioned `Texture (JPG/PNG)` as the final item in the terrain controls across both primary toggles and detailed texture projection settings.
- **Rozšírenie komponentu ColorPicker o voliteľný atribút `style`**: Pridaná podpora pre odovzdanie inline štýlu `style?: React.CSSProperties` do komponentu `ColorPicker` pre flexibilné prispôsobenie vonkajších okrajov (margin) v kompaktných inline riadkoch. / Added optional `style?: React.CSSProperties` prop to `ColorPicker` for flexible inline layout spacing.

## [2.5.8] - 2026-10-26
### Samostatná záložka Povrch, jednotný CAD štýl, info dialógy a jazykový panel / Dedicated Surface tab, unified CAD style, info modals & language bar
- **Oddelenie sekcií Jaskyňa a Povrch**: Pôvodná kombinovaná karta `Vrstvy & dáta` bola rozdelená na dve špecializované kategórie v bočnom paneli: **Jaskyňa & model** (`cave` - polygón, splaye, steny, SDF rekonštrukcia, stanice, LiDAR) a **Povrch & terén** (`surface` - DTM tieňovaný reliéf, výšková sieť, vrstevnice s kótami, sťahovanie DMR 5.0 WCS, WMS mapy ZBGIS, kalibrácia). / Separated cave survey operations from surface/terrain layers into two dedicated sidebar tabs: **Cave & Model** (`cave`) and **Surface & Terrain** (`surface`).
- **Jednotný jantárovo-zlatý CAD štýl sekcií**: Vzhľad všetkých sekcií a accordionov bol zjednotený do prémiového CAD štýlu s jantárovo-zlatými nadpismi (`#f59e0b`), výraznými plnošírkovými tlačidlami a prehľadnými dotykovými ovládacími prvkami. / Unified section styling matching the DMR 5.0 panel with amber/yellow headers (`#f59e0b`), prominent full-width action buttons, and tactile CAD controls.
- **Kontextové informačné tlačidlá (ℹ️) s dokumentačným oknom**: Pri každom paneli sa nachádza tlačidlo `ℹ️`, ktoré po kliknutí otvorí dialógové okno s podrobným vysvetlením funkcie danej sekcie, zoznamom kľúčových možností a priamym odkazom do príslušnej kapitoly používateľskej príručky. / Contextual info icon (`ℹ️`) on every sidebar accordion revealing a dedicated documentation popup with key feature descriptions and deep links to the user manual.
- **Jazykový panel v hornej lište s automatickou geodetekciou**: V pravom rohu hornej lišty je integrovaný prepínač jazyka (`SK | EN | DE | FR`). Systém automaticky deteguje používateľov zo Slovenska a Česka (podľa časového pásma a jazyka) a predvolí slovenčinu, pre ostatné krajiny nastaví angličtinu. Voľba sa ukladá do `localStorage`. / Top-toolbar Language Bar (`SK | EN | DE | FR`) with automatic geolocation detection (Slovakia/Czechia default to Slovak, others to English) and persistent state in `localStorage`.


## [2.5.7] - 2026-10-26
### Vlastná veľkosť výseku terénu DMR 5.0 s krokom po 500 m / Custom DMR 5.0 terrain extent with 500 m stepping
- **Vlastný rozsah výseku terénu**: Pridaná podpora pre nastavenie ľubovoľnej veľkosti územia pri sťahovaní DMR 5.0 cez WCS (od 500 m až po 10 km). / Added custom territory extent selection when downloading DMR 5.0 elevation terrain via WCS (from 500 m up to 10 km).
- **Jemné krokovanie po 500 m**: Rozhranie obsahuje tlačidlá rýchleho posunu `-500 m` a `+500 m`, plynulý posuvník s krokom 500 m a priamy číselný vstup pre presné zadanie rozmerov v metroch. / Integrated `±500 m` stepper buttons, 500 m range slider, and direct numeric input in meters.
- **Predvoľby a živá telemetria**: Rýchle tlačidlá (500 m, 1 km, 2 km, Vlastný) so zobrazením rozmerov v km/m, celkovej plochy v hektároch a pixelových rozmerov rastra. / Presets (500 m, 1 km, 2 km, Custom) with live telemetry showing dimensions and area in hectares.

## [2.5.6] - 2026-10-26
### Sťahovanie a generovanie terénu DMR 5.0 z WCS služby GKÚ SR / DMR 5.0 WCS terrain download and 3D surface generation
- **Priame sťahovanie DMR 5.0 cez OGC WCS 2.0.1**: Možnosť priamo z aplikácie stiahnuť certifikovaný digitálny model reliéfu DMR 5.0 (LiDAR SR v rozlíšení 1 × 1 m, INSPIRE vrstva `el__EL.GridCoverage`) zo štátnej služby GKÚ SR (`inspirews.skgeodesy.sk`). / Direct in-app download of Slovakia's certified DMR 5.0 DTM (1m resolution LiDAR raster) via national OGC WCS 2.0.1 service.
- **Automatické vytvorenie 3D povrchu**: Získaný GeoTIFF raster sa v prehliadači okamžite prevedie na plnohodnotný 3D povrch jaskyne s tieňovaným reliéfom, vrstevnicami a hypsometrickým farbením. Podporuje okamžitú aplikáciu ortofotomapy ZBGIS alebo geologickej mapy. / Instant generation of 3D terrain surface from downloaded elevation GeoTIFF with shaded relief, contour lines, elevation coloring, and full support for ZBGIS orthophoto texture draping.
- **Export `.tif` a `.tfw` súborov**: Používateľ si môže stiahnutý DMR 5.0 raster uložiť do počítača spolu s vygenerovaným ESRI World súborom (`.tfw`) pre použitie v GIS nástrojoch (QGIS, ArcGIS) alebo archiváciu. / Direct export/download of georeferenced `.tif` and `.tfw` (ESRI World File) pairs to local disk for GIS workflows.
- **Inteligentný odhad súradníc a voľba rozsahu**: Aplikácia automaticky predvyplní GPS súradnice vchodu alebo centra jaskyne s možnosťou manuálnej úpravy a voľby výseku (300 m, 500 m, 1 km, 2 km). / Automated coordinate guessing from cave entrance/center with extent selection presets (300 m, 500 m, 1 km, 2 km).
- **Integrácia do rozhrania**: Nástroj je prístupný v bočnom paneli (karta Povrch & Terén), v hornej lište (menu povrchov) aj v sekcii Projekt / Export. / Accessible via Surface & Terrain sidebar accordion, quick toolbar surface menu, and Project export section.

## [2.5.5] - 2026-10-26
### Presná bodová identifikácia v portáli ZBGIS Terén / Exact point identification pin in ZBGIS Terrain portal
- **Presná identifikácia bodu na ZBGIS**: Aktualizovaný formát odkazu na štátny portál ZBGIS Terén (`https://zbgis.skgeodesy.sk/mapka/sk/teren/identification/point/{lat},{lon}?pos={lat},{lon},18`), ktorý pri otvorení priamo umiestni identifikačný terč a otvorí informačný dialóg s presnou nadmorskou výškou a údajmi DMR 5.0 pre zadané súradnice (aplikované pre jaskynné stanice aj najbližšie body povrchu). / Exact point identification URL in ZBGIS: updated link structure to activate the identify pin and elevation popup dialog directly at the target coordinates while centering the map at zoom 18 for both underground survey stations and closest surface points.

## [2.5.4] - 2026-10-26
### GPS súradnice najbližšieho bodu povrchu a prepojenie na ZBGIS LiDAR / Closest surface GPS coordinates & ZBGIS LiDAR integration
- **GPS súradnice najbližšieho bodu povrchu**: V detaile stanice sa pri minimálnej 3D vzdialenosti k povrchu zobrazujú presné geodetické WGS84 GPS súradnice najbližšieho bodu terénu (`lat`, `lon`), odvodené z DTM alebo referenčného vchodu. / Station inspection card now displays exact geodetic WGS84 GPS coordinates (`lat`, `lon`) for the closest 3D surface point.
- **Priame prepojenie na ZBGIS LiDAR a Google Maps**: Kliknutím na GPS súradnice povrchu alebo tlačidlá je možné bod okamžite otvoriť v Google Maps (`maps.google.com`) alebo v štátnom portáli ZBGIS Terén LiDAR (`zbgis.skgeodesy.sk/mapka/sk/teren?pos=lat,lon,18`). / Instant one-click links to Google Maps and Slovakia ZBGIS LiDAR terrain portal at zoom level 18.
- **ZBGIS LiDAR linka pre stanicu v jaskyni**: K existujúcemu Google Maps odkazu pre podzemnú stanicu pribudol priamy link na ZBGIS Terén (LiDAR). / Added direct ZBGIS Terrain (LiDAR) map link alongside Google Maps for survey stations.
- **Čistejší dizajn karty stanice**: Sekcia minimálnej hrúbky masívu má vlastný štýlový jantárový kontajner s oddelenými textami, ktorý zabraňuje zlievaniu hodnôt a popiskov. / Enhanced station inspection card styling with dedicated amber surface metric container.
- **Duálne zobrazenie metrík v infografike bodu**: V karte stanice sa teraz prehľadne zobrazujú obe hodnoty – najkratšia priestorová vzdialenosť k terénu („Najbližší povrch (3D min.) / minimálna hrúbka masívu“) aj vertikálna hĺbka („Vertikálna hĺbka (kolmo)“) spolu s horizontálnym odklonom a nadmorskou výškou povrchu. / Dual metrics in station infography: displays both the true shortest 3D distance to terrain ("Closest surface (3D min.) / minimum rock cover") and the vertical depth ("Vertical depth (straight up)") alongside horizontal offset and terrain elevation.
- **Výrazná 3D vizualizácia najkratšej spojnice**: V 3D scéne (Engine v1 aj v2) sa vykresľuje výrazná jantárovo-oranžová čiarkovaná spojnica (`#f59e0b`, hrubšia línia) k najbližšiemu bodu DTM s vlastným terčom a kótou mierky. Zvislá čiara kolmo hore ostáva v jemnej svetlomodrej farbe (`#38bdf8`), pričom pri rovnom teréne nad bodom sa línie elegantne zjednotia bez vizuálneho šumu. / Bold amber-orange dashed connection (`#f59e0b`, thicker line) to the nearest 3D DTM surface point with distinct target and scale badge, complemented by the fine cyan vertical line (`#38bdf8`) with automatic consolidation on flat terrain.
- **Vysokovýkonný Ericsonov algoritmus**: Výpočet najbližšieho 3D bodu na triangulovanej DTM mriežke využíva ohraničenie vyhľadávacieho priestoru vertikálnou vzdialenosťou a bezalokačnú Voronoi projekciu na trojuholníky s časom výpočtu pod 1 ms. / High-performance Ericson triangle projection algorithm bounded by vertical depth with sub-millisecond execution time and zero heap allocations.
- **Oddelenie metrík v detaile bodu**: Karta stanice teraz jasne rozlišuje „Deniveláciu od vchodu“ (± hodnota od primárneho vchodu s GPS/výškou alebo najnižšie očíslovaného nepovrchového bodu 0, 1...) a „Hĺbku pod povrchom“ (kolmý rozdiel výšky terénu DTM a bodu). / Separated metrics in station detail: clearly distinguishes “Denivelation from entrance” (± value from primary entrance with GPS or lowest non-surface survey station 0, 1...) and “Depth below surface” (vertical difference between DTM terrain and cave point).
- **3D zvislá čiarkovaná čiara**: Pri výbere stanice sa v 3D scéne (Engine v1 aj v2) vykreslí zvislá čiarkovaná línia s terčom na povrchu a kótou hĺbky/nadmorskej výšky povrchu v mierke. / Interactive 3D vertical dashed line in both Engine v1 & v2 from selected cave station straight up to the DTM surface with surface target and altitude badge in scale.
- **Robustné hľadanie referenčného bodu**: Algoritmus automaticky deteguje vchod jaskyne (podľa príznakov formátu alebo kľúčových slov), a ak jaskyňa nemá vchod ani GPS, referenčnú výšku odvodí z bodu s najnižším číslom (mimo povrchových staníc). / Robust reference station detection prioritizing entrances with GPS/altitude, falling back to lowest-numbered underground survey stations (filtering out surface/GPS points).

## [2.5.1] - 2026-10-22
### Priamy vertikálny rez a prepojenie lišty s bočným panelom / Direct vertical section and toolbar → sidebar reveal
- Prepínač „Vertikálny profil (línia)“ aj nová ikona nožníc v hornej lište spustia výber 2 bodov v modeli a hneď odrežú model; posun a otočenie sú viditeľné bez rozbaľovania. / The Vertical Profile switch and new toolbar scissors pick 2 model points and cut immediately; offset and flip are visible without expanding details.
- Rýchle ikony prepnú bočný panel na príslušnú kategóriu a zvýraznia nastavenie (Meranie → Nástroje & analýza). / Quick actions reveal and highlight the matching sidebar control (Measurement → Tools & analysis).
- Posun panelu nemení veľkosť 3D plátna (odstránená nestabilita animácie pohľadov v2). / Sidebar scrolling no longer resizes the 3D canvas (fixed v2 view-tween drift).

## [2.5.0] - 2026-10-22
### LochViewer 2.5 — nová navigácia, meranie a čistejší bočný panel / new navigation, measurement and leaner sidebar
- Súhrn 2.4.x: zjednotený bočný panel (Súbor, Pohľad, Vrstvy, Nástroje, Nastavenia), rýchla horná lišta v štýle LOCH, cyklické pohľady, profesionálne meranie a karty bodov (GPS, výška, hĺbka pod DTM), optimalizácie výkonu, lazy-loading a prístupnosť. / 2.4.x summary: unified sidebar, LOCH-style quick toolbar, cycling views, professional measurement and point cards, performance, lazy-loading and accessibility.
- Pri LOX zlúčené prepínače Drôtený model a Trojuholník. mesh; Triangle mesh ostáva iba pre LiDAR PLY. / LOX Wireframe and Triangle mesh merged; Triangle mesh kept only for LiDAR PLY.
- „Farebné podľa výšky“ je viditeľné hneď pri polygóne aj stenách. / “Color by height” is always visible for survey and walls.
- Odstránená duplicitná karta „Mierka (Jaskyniar)“; postava sa pridáva z karty bodu. / Removed duplicate “Scale (Caver)” card; the figure is placed from the point card.

## [2.4.35] - 2026-10-22
### Cyklické pohľady a export PNG / Cycling views and PNG export
- Pôdorys v hornej lište prepína zhora ↔ zdola, Nárys obieha juh → východ → sever → západ; aktuálna strana v popise tlačidla (SK/EN/FR/DE). / Plan toggles above ↔ below, Elevation cycles south → east → north → west with the side shown in the tooltip.
- Opravený Export PNG (Render to file): hľadal R3F obal `div` namiesto `<canvas>`, čo rozbíjalo aj nahrávanie a LiDAR štetec. / Fixed PNG export resolving the R3F wrapper div instead of its canvas (also affected recording and LiDAR brush).
- Unit a E2E test cyklu pohľadov pre LOX aj PLY. / Unit and E2E coverage for view cycling on LOX and PLY.

## [2.4.34] - 2026-10-22
### Výber bodov, meranie a rýchla lišta / Point inspection, measurement and quick toolbar
- Opravená zámena meračských XYZ a Three.js súradníc, ktorá posúvala meranie mimo modelu a blokovala karty staníc. Spoločný 10 px výber staníc/splayov v oboch enginoch; ťahanie nepridáva body. / Fixed survey/scene coordinate confusion and restored station inspection with shared screen-space snapping.
- Karta ukazuje úplné meno, pôvodné X/Y/Z, dostupné GPS a hĺbku voči DTM; v2 vyberá skutočné vrcholy, nie pomocnú geometriu. / Point cards expose source coordinates, available GPS and DTM depth; v2 ignores helper geometry.
- Ukotvené A/B, zvýraznená spojnica, výmena koncov, odobratie bodu, nové meranie a Escape. Plocha zahŕňa všetky vrcholy polygónu. / Anchored A/B measurement, undo/swap/reset/Escape and all-vertex polygon area.
- Horná lišta s 19 SVG ikonami, cyklom číslo/úplné meno/výška/GPS/vypnuté, LOX pevnými stanicami a menu obrazov povrchu; zdieľané options so sidebarom, lokálny dialóg. / Quick toolbar with cycling labels, LOX fixed stations, surface-image menu and shared layer state.
- Kompletné skrývanie/obnova povrchu a stien, samostatný prepínač celého polygonálneho ťahu. / Complete surface/wall visibility and an independent whole-centerline switch.
- SK/EN príručky a pomocník, názvy nových ovládačov SK/EN/FR/DE, regresné a skutočné klikacie E2E testy. / Bilingual guides/help, four-language controls and regression/canvas E2E coverage.

## [2.4.33] - 2026-10-22
### Zjednotená navigácia / Unified navigation
- Päť kategórií a modulárny `NavigationSidebar` nahrádzajú roztrieštené horné ovládanie a záložky Jaskyňa/Terén/Analýza. / Five categories replace scattered toolbar controls and legacy tabs.
- Lokálny stav kategórií, accordionov a zbalenia nevyvoláva render App/Canvas; hlavné prepínače zostávajú dostupné, detaily rešpektujú aktívne vrstvy a dostupnosť dát. / Local navigation state isolates scene renders; contextual details retain primary switches.
- Mobilný drawer s Escape, uzamknutím a obnovou fokusu; kategórie SK/EN/FR/DE. / Accessible mobile drawer with keyboard focus management and translated categories.
- Kalibrácia je iba pod Vrstvy → Povrch; WebM vrátane nastavení iba pod Súbor → Zdieľanie a dostupné exporty. / Calibration is grouped under Surface; WebM recording/settings under sharing and exports.

## [2.4.32] - 2026-10-22
### Prístupné prepínače, synchronizácia jazyka a SEO metadáta
- Všetky prepínače v aplikácii sú natívne tlačidlá s rolou `switch`, pomenovaním pre čítačky obrazovky a klávesnicovou aktiváciou Enter/Space.
- Jazyk rozhrania sa synchronizuje s atribútom `lang` elementu `<html>`.
- Doplnený vlastný LochViewer favicon, presný titulok, meta description a Open Graph metadáta.

## [2.4.31] - 2026-10-22
### Lazy loading terénu a odstránenie nepoužívanej závislosti
- Mapbox 3D terén a závislosť `three-geo` sa načítajú až po zapnutí Mapbox terénu; odstránená je aj ich vynútená optimalizácia pri štarte vývojového servera.
- Odstránená nepoužívaná závislosť `pdfjs-dist`.

## [2.4.30] - 2026-10-22
### Optimalizácia staníc, mračien bodov, Splay cache a načítania dlaždíc
- Mapovanie bodov podkladových máp na stanice používa mapu s časovou zložitosťou O(P + S) a zachováva prvú stanicu pri duplicitnom názve.
- Načítanie mračna bodov sa ruší pri odmontovaní komponentu alebo zmene URL; pole normál sa alokuje iba pri platných zdrojových normálach.
- Splay geometrie sa ukladajú do LRU cache s limitom 256 MiB podľa veľkosti dátových bufferov.
- Požiadavky na XYZ dlaždice majú 15-sekundový timeout a pri zlyhaní pokračujú na záložný zdroj.

## [2.4.29] - 2026-10-22
### Zjednotené zobrazenie splay lúčov a bodov
- Prepínač *Splay* teraz súčasne skrýva alebo zobrazuje splay lúče aj ich koncové bodky v modeloch `.lox` a ďalších meračských formátoch. Ostatné stanice zostávajú nezávislé.

## [2.4.28] - 2026-10-16
### Priehľadnosť tieňovaného povrchu, hustejšie výšky vrstevníc, skrytie splayov a oprava trojuholníkovej siete (Axonometria)
- **Priehľadnosť povrchu pre tieňovaný model a výškovú sieť:** V záložke *Terén* bol doplnený posuvník *Priehľadnosť povrchu* (5 % – 100 %) pre režimy *Tieňovaný povrch* (`showSurfaceMesh`) aj *Výšková sieť* (`showSurfaceNetwork`). Umožňuje plynulé nastavenie priehľadnosti terénu bez nutnosti zapínania textúry, pričom priehľadnosť ostáva stabilná aj počas pohybu kamery.
- **Hustejšie a lepšie rozmiestnené výškové kóty vrstevníc:** Algoritmus generovania výškových štítkov (`ContourLabels`) v `CaveViewer3D` bol vylepšený o 2D obojsmernú detekciu hrán (horizontálne aj vertikálne pretnutia výškových intervalov na jemnejšom rastri) a priestorové filtrovanie vzdialeností. Tým sa zabezpečilo, že každá hlavná (hrubá) vrstevnica má v zornom poli používateľa vždy minimálne jednu dobre čitateľnú hodnotu nadmorskej výšky bez zhlukovania.
- **Podmienené zobrazenie Splay SDF stien:** Karta *Splay SDF steny (2D/3D)* v bočnom paneli sa teraz zobrazuje výhradne vtedy, keď načítaný model skutočne obsahuje splay lúče (`splayCount > 0`). Pre modely bez pomocných splay zámerov je táto karta automaticky skrytá, čo sprehľadňuje rozhranie.
- **Oprava Trojuholníkovej siete (Triangle mesh / Axonometria):** Režim *Trojuholník. mesh* (`accurateScraps`) bol plne integrovaný do vykresľovacieho potrubia stien jaskyne (`Scraps.tsx`, `CaveViewer3D.tsx` a `CaveViewerNextGen.tsx`). Režim teraz funguje spoľahlivo aj samostatne (bez nutnosti mať vopred zapnuté plné steny) a zobrazuje precíznu trianguláciu stien jaskyne s plochým tieňovaním faziet a kontrastnými drôtenými hranami v klasickom technickom axonometrickom štýle.

## [2.4.27] - 2026-10-16
### Výkonnostná optimalizácia WebGL jadra, fix priehľadnosti povrchov a nulové vyťaženie CPU v kľude
- **Fix straty priehľadnosti povrchov a stien pri pohybe kamery:** Odstránené nútené prepínanie priehľadnosti na nepriehľadnú hodnotu (`1.0`) pri rotácii a manipulácii s kamerou v komponentoch `CaveViewer3D` (`TerrainMesh`), `Scraps` a `SplayCaveWalls`. Povrch terénu aj steny jaskyne ostávajú plynulo a stabilne priesvitné podľa nastaveného posuvníka bez preblikávania a bez zakrytia jaskynných chodieb.
- **Odstránenie synchrónneho re-buildingu terénu a BVH stromu:** `TerrainTile` už neprepína úroveň prevzorkovania (`terrainSubsample`) pri každom štarte a zastavení pohybu kamery, čo eliminovalo trhanie a zamŕzanie hlavného vlákna. `props.opacity` bolo odstránené zo závislostí `useMemo` pre shaderové materiály, čím sa predišlo rekompiláciám WebGL shaderov za behu; `depthWrite` je správne viazané na `opacity === 1`.
- **Zastavenie 10Hz re-render kaskády `App.tsx`:** `CameraMonitor` v oboch motoroch (`CaveViewer3D` aj `CaveViewerNextGen`) bol optimalizovaný s inteligentným filtrom – stav `cameraData` v hlavnom komponente `App.tsx` sa aktualizuje len pri skutočnej zmene azimutu (o viac ako 1°), prechode kategórie vrstevníc alebo pri väčšom posune. Tým sa zabránilo 10 neustálym re-renderom celého DOM stromu rozhrania za sekundu počas rotácie modelu.
- **Vypnutie skrytého pozadového plátna (`bg-canvas`):** Nekonečný 60 FPS animačný cyklus `requestAnimationFrame` s časticami sa automaticky pozastavuje, ak aplikácia nie je na úvodnej (welcome) alebo chybovej obrazovke.
- **Stabilizácia referencií props pre 3D prehliadače:** Všetky pomocné handlery (`handleProcessingEnd`, `handleTextureReady`, `handleSurfaceOffsetChange`) a objekt manuálneho prepojenia staníc (`manualConnectionMemo`) boli obalené do `useCallback` a `useMemo`. Tým sa naplno aktivovala optimalizácia `React.memo` na `<CaveViewer3D>` a `<CaveViewerNextGen>` pri práci s bočným panelom, posuvníkmi a kartami.
- **50 % úspora CPU a VRAM v `Scraps.tsx`:** Odstránené duplicitné generovanie geometrie (`currentSolid` a `currentAlt`). Využíva sa jediná `BufferGeometry` s atribútom `color`; materiály bez farebného režimu atribút automaticky ignorujú. Zredukované volania `mergeVertices`, Taubin smoothing a stavba BVH stromu na polovicu.
- **Zero-copy Web Worker I/O & odstránenie alokácií:** V `parser.worker.ts` boli výškové polia terénu DTM a rastrové textúry pridané do zoznamu `Transferable` objektov `postMessage()`. V `App.tsx` boli odstránené redundantné kópie `buf.slice(0)`.
- **Prevencia únikov GPU pamäte (VRAM disposal):** Do komponentov `CaveLegs`, `PointCloud`, `OrganicShell`, `TerrainMesh` a `Scraps` boli implementované čistiace háky `useEffect`, ktoré pri zmene parametrov a demontáži komponentov explicitne volajú `dispose()` na Three.js geometriách, boundsTree stromoch a textúrach.
- **Blesková odozva po zastavení kamery (180 ms):** `idleTimeoutRef` bol skrátený z 1500 ms na 180 ms, vďaka čomu sa on-demand renderovanie (`frameloop="demand"`) a stabilizácia aktivujú okamžite po zastavení používateľa s nulovým vyťažením CPU a GPU.
- **Optimalizácia bundle splittingu:** Nápoveda `HelpModal` bola konvertovaná na `React.lazy` s dynamickým načítaním pri otvorení, a import `three` v `App.tsx` bol zúžený na čisté typové deklarácie.

## [2.4.26] - 2026-09-13
### Oprava mapového zdroja Freemap (ortofotomapa) a detekcia placeholder dlaždíc
- **Aktualizácia endpointu Freemap ortofoto:** Nahradený zastaraný serverový endpoint `tiles.freemap.sk/o/{z}/{x}/{y}.jpg` (ktorý pre väčšinu moderných súradníc vracal iba 1843-bajtový PNG obrázok s textom *"no map data"*) za oficiálny aktívny server `https://ortofoto.tiles.freemap.sk/{z}/{x}/{y}.jpg`.
- **Aktualizácia PHP a Vite proxy:** Proxy koncovky v `public/map-proxy.php` a `vite.config.ts` boli presmerované priamo na `https://ortofoto.tiles.freemap.sk`.
- **Detekcia a odmietnutie placeholderov v `XyzTileDownloader.ts`:** Pridané bezpečnostné pravidlo, ktoré okamžite deteguje a odmieta prázdne/placeholder dlaždice (veľkosť 1843 bajtov / text "no map data"), takže downloader v prípade narazenia na chybnú dlaždicu neznehodnotí 3D povrch textom, ale okamžite prepne na funkčného náhradného kandidáta cez proxy.
- **Automatická invalidácia starej cache (`tileCache.ts`):** Verzia kľúčov IndexedDB posunutá na `v2` (`KEY_VERSION = 'v2'`), čím sa klientom automaticky vyčistili staré nesprávne nacachované dlaždice s textom "no map data" bez potreby manuálneho resetu prehliadača.
- **Podpora URL parametra `tsrc`:** Stav zvoleného mapového podkladu (`wms-orto`, `wms-orto-freemap`, `wms-shadow`, `wms-geology`) sa teraz korektne ukladá do URL ako `tsrc` a generuje v share odkazoch.

## [2.4.25] - 2026-09-13
### Exkluzivita LiDAR NextGen, oprava prepínania bočného panelu a modrý gradient (Precision)
- **Oprava opätovného otvárania bočného panelu (Fix layoutu):** Vyriešený problém, pri ktorom sa po skrytí bočného panelu tlačidlom "Panel" panel pri druhom kliknutí nezobrazil. Príčinou bol flexboxový mechanizmus, kde `canvas-wrap` bez `min-width: 0` odmietal ustúpiť flexibilnému zmenšeniu po inicializácii plnej šírky WebGL plátna, čím vytlačil panel mimo pravý okraj obrazovky. Pridané `min-width: 0` do `.canvas-wrap` a plne synchronizovaný stav otvorenia na desktopových, tabletových aj mobilných zariadeniach.
- **Rýchle znovuotvorenie panela (`sidebar-reopen-tab`):** Po zbalení bočného panelu sa v pravom hornom rohu viewportu zobrazuje decentná plávajúca záložka `[dock_to_left] Panel`, umožňujúca okamžité znovuotvorenie bočného panelu kliknutím priamo v mieste, kde sa panel pôvodne nachádzal.
- **Modrý technický gradient pre tému `precision`:** Pozadie predvolenej CAD témy `precision` bolo zosvetlené a pretransformované na elegantný modrý vertikálny gradient (zhora tmavšia nočná modrá `#103258`, zdola svetlejšia technická modrá `#1d5b9b`), čím sa nahradilo pôvodné takmer čierne pozadie a dosiahol sa špičkový kontrast meračských vektorov a staníc.
- **Izolácia prepínača LiDAR NEXTGEN:** Prepínač motora `LiDAR NEXTGEN` (Engine v2) a panel nástrojov `LiDAR editácia` sa teraz zobrazujú výhradne pre skutočné LiDAR dáta vo formáte PLY. Pre bežné meračské a polygónové modely (`.lox`, `.3d`, `.plt`, `.stl`) je tento prepínač vo všetkých zobrazeniach skrytý.
- **Oprava parseru survey staníc (`caveParser.ts`):** `buildResult` už nekonvertuje meračské stanice na fiktívny počet LiDAR bodov (`pointCount`). Meračské súbory majú korektne `pointCount = 0`, čím sa zabránilo falošnej detekcii LiDARu.
- **Adaptívna hlavička datasetu v bočnom paneli:** Pri načítaní súboru PLY sa namiesto prázdnych počtov meračských segmentov/staníc zobrazuje formát PLY a reálny počet bodov mračna (`Body / Points`). Pre bežné polygónové formáty ostáva zobrazenie segmentov, staníc a stien.
- **Ochrana renderovacích stromov & URL stavu:** `CaveViewerNextGen` a prekryvná vrstva editácie LiDARu sa nikdy neinštancujú pre bežné meračské súbory; aj pri načítaní URL s parametrom `?eng=v2` sa pre non-PLY modely bezpečne vynúti Engine v1.
- **Jemný pieskový gradient pre svetlú tému (`light`):** Pozadie 3D viewportu v svetlej téme prešlo kalibráciou na prirodzený pieskový vertikálny gradient – jemná svetlá piesková / slonovinová hore (`#f7f3eb`) prechádzajúca do teplejšej tmavej pieskovej / vápencovej dole (`#d5c4ad`). Celé CAD rozhranie v `.theme-light` (subkarty, posuvníky, metriky) bolo farebne zosúladené s teplým pieskovým tónom.
- **Three.js sRGB Color Space oprava textúry pozadia:** Pre dynamické canvas textúry gradientu pozadia (`bgTexture`) v oboch motoroch (`CaveViewer3D` a `CaveViewerNextGen`) bol explicitne nastavený `tex.colorSpace = THREE.SRGBColorSpace`. Tým sa odstránila nechcená gamma desaturácia Three.js, ktorá prevádzala teplé pieskové farby na ploché sivé odtiene.

## [2.4.23] - 2026-09-13
### Fix bočného panelu, zjednotenie CAD motívu a viditeľnosť Splay SDF
- **Fix rolovania a ukotvenie hlavičky (`sidebar-pinned-header`):** Karta datasetu a navigačné záložky (`Jaskyňa`, `Terén`, `Analýza`) sú trvalo ukotvené na vrchu bočného panelu a neodchádzajú pri rolovaní ovládačov.
- **Viditeľnosť parametra Hranatosť / Ostré steny:** Karta *Splay SDF Rekonštrukcia stien* bola vyčlenená ako samostatná plnohodnotná karta nezávislá od počtu scraps/mračien bodov. Parameter hranatosti je teraz vždy zreteľne dostupný a čitateľný.
- **Odstránenie nesúrodých tmavých blokov:** Všetky staré inline štýly s tmavými podkladmi (`#0f172a`, `bg-slate-800`, `rgba(30,41,59,...)`, `rgba(15,23,42,...)`) boli plne prevedené na jednotné CAD tokeny (`.cad-card`, `.cad-subcard`, `.sidebar-stat-card`, `.cad-slider`, `.cad-tool-btn`, `.btn-mini`). Tým je dosiahnutý bezchybný kontrast a konzistencia v tmavej aj svetlej téme bez trhaných čiernych obdĺžnikov.

## [2.4.22] - 2026-09-13
### Integrácia Stitch CAD dizajnového systému (Sekcia 1)
- **CAD dizajnový systém & tokeny (z Google Stitch `DESIGN.md`):** Zavedené CSS premenné pre instrument-tier farby: hlboká základňa (`--cv-bg: #0b0f17`), kontajnery (`#0f131c` až `#262a33`), elektrizujúca tyrkysová pre primárne prvky (`#00d2ff`) a smaragdová pre verifikáciu (`#10b981`).
- **Typografia:** Do hlavičky pridané Google fonty **Inter**, **JetBrains Mono** a **Material Symbols Outlined**. Zapnuté tabuľkové číslice (`tabular-nums`) pre všetky vedecké a geodetické dáta (odstránené trhanie textu pri pohybe kamery).
- **Moderné UI ovládacie prvky:** Redizajnované CAD prepínače (`.switch`), štíhle slidery (`input[type=range]`), hlavičky sekcií (`.s-label`) a informačné riadky (`.info-row`).
- **Kalibrované témy:** Predvolená téma `precision` aktualizovaná na Stitch CAD Deep Abyss, téma `light` kalibrovaná na vysokokontrastný Fieldwork režim.
- **Dynamická podpora tém:** Kontajner `.viewer-shell` dynamicky aplikuje triedu aktívnej témy (`theme-precision`, `theme-light`, `theme-classic`).

### Odstránenie Ambient Occlusion (SSAO) a vyčistenie interných označení
- **Funkcia Ambient Occlusion (SSAO) úplne odstránená:** Napriek viacerým vylepšeniam efekt nemal reálne využitie a naďalej pôsobil príliš tmavo. Odstránený prepínač v paneli Steny jaskyne (v oboch režimoch motora), voľba `enableSSAO`, URL parameter `ssao`, komponent `SSAOPass.tsx` a súvisiaci shader kód pre LiDAR mračno bodov.
- **Vyčistené interné pracovné označenia z UI textov:** Odstránené zátvorky s internými kódmi ako `(2A)`, `(2C)`, `(3C)` z popiskov "Zlúčenie stien", "Eye-Dome Lighting" a pod. — boli to len pracovné identifikátory bez významu pre používateľa.
- Aktualizovaná vývojárska dokumentácia (SK/EN) — odstránená zmienka o SSAO z názvu sekcie post-processing shaderov.

## [2.4.20] - 2026-08-27
### Skutočná príčina "stmavnutia" pozadia/modelu po zastavení kamery (opravené natrvalo)
- **Skutočný root cause nájdený:** Nešlo o SSAO ani EDL — steny jaskyne mali predvolenú priehľadnosť `scrapsOpacity = 0.75`. Pri zastavení kamery (idle) sa priehľadnosť zapla, čím sa cez model presvitalo tmavé pozadie oblohy a model aj celá scéna pôsobili tmavšie a menej výrazné. Počas pohybu kamery bola priehľadnosť dočasne vynútená na 100 % (kvôli výkonu), takže farba sa po zastavení "preklopila".
- **Zmena predvolenej hodnoty:** `scrapsOpacity` je teraz štandardne **100 % (nepriehľadné)**, takže sa model už nikdy sám od seba nestmaví/nepriesvitní. Kto priehľadnosť chce, môže si ju znížiť cez slider "Priehľadnosť stien" v paneli Steny jaskyne — táto možnosť ostáva plne funkčná.
- Overené automatizovaným testom (Playwright): farba modelu a pozadia je teraz identická počas pohybu aj po 10+ sekundách nečinnosti, s SSAO zapnutým aj vypnutým.

## [2.4.19] - 2026-08-27
### Oprava príliš tmavého Ambient Occlusion (SSAO)
- **Pozadie (obloha) sa už nestmavuje:** SSAO efekt nesprávne stmavoval aj oblohu/pozadie scény, nielen model. Detekcia pozadia bola založená na hrubej (nelineárnej) hĺbke, ktorá pri veľkých vzdialenostiach kamery (terénne scény, `far` až do 10 000 m) stráca presnosť tesne pred hraničnou hodnotou. Detekcia teraz porovnáva už linearizovanú hĺbku voči `cameraFar`, čím spoľahlivo rozpozná pozadie nezávisle od mierky scény.
- **Odstránené plošné stmavovanie terénu/modelu:** Porovnávanie okolitých hĺbok pri výpočte zatienenia používalo pevný rozsah v metroch (0.01 – 5 m), čo pri veľkých vzdialenostiach spôsobovalo, že aj bežné pozvoľné svahy terénu boli mylne vyhodnotené ako "zapadliny" a stmavené. Prepočet je teraz relatívny (pomer k vzdialenosti od kamery), takže funguje správne pri malých (jaskynné steny) aj veľkých (terén) mierkach.
- **Jemnejší predvolený efekt ("zosvetlenie"):** Znížená predvolená intenzita (1.5 → 0.8) a polomer (3.0 → 2.0), zvýšené minimálne stmavenie (dolná hranica z 0.15 na 0.55) — efekt je teraz oveľa jemnejší a menej agresívny, zatiaľ čo stále zvýrazňuje reálne zapadliny a hrany.

## [2.4.18] - 2026-08-27
### Priehľadnosť stien a nezávislý organický model
- **Nový ovládací prvok "Priehľadnosť stien":** Pridaný slider (10 – 100 %) v paneli Steny jaskyne, ktorý ovláda `scrapsOpacity`. Doteraz nebolo možné túto hodnotu v UI meniť, čo spôsobovalo, že sa model po zastavení pohybu kamery (1–2 s) "preklopil" na tmavší, priesvitný vzhľad (kým sa kamera hýbe, steny sa kreslia nepriehľadne kvôli výkonu; po zastavení sa použije skutočná nastavená priehľadnosť).
- **Organický / Vyhladený model funguje nezávisle od "Zobraziť steny":** Rovnaké správanie ako pri Splay SDF stenách — organický LiDAR model (`smoothScraps` / `accurateScraps`) sa teraz vykresľuje bez ohľadu na stav prepínača "Zobraziť steny". Predvolený model (bežné steny) ostáva zapnutý ako default.
- **Preklad SK/EN/FR/DE:** Doplnený chýbajúci kľúč `cave.opacity` do všetkých 4 jazykových súborov.
- **Opravený nesúlad v URL kódovaní:** Predvolená hodnota `scrapsOpacity` v `encodeState` bola nesprávne 0.85 namiesto skutočných 0.75.

## [2.4.17] - 2026-08-27
### Oprava príliš tmavého zobrazenia modelov (regresia z v2.4.15)
- **Svetlejšia technická sivá ako default:** Farebné šablóny (`classic`, `precision`, `light`) používali zastaranú tmavú farbu stien jaskyne (`#94a3b8`), zatiaľ čo predvolený stav aplikácie bol už predtým zosvetlený na `#cbd5e1`. Keďže sa šablóna `precision` aplikuje automaticky pri každom načítaní modelu (cez URL stav), zobrazenie bolo napriek tomu tmavé. Zosvetlené na rovnakú hodnotu `#cbd5e1`, akú má ako default aj **Splay SDF Walls (2D)**.
- **EDL (Eye-Dome Lighting) vypnuté ako default:** Efekt zavedený vo v2.4.15 s predvolenou hodnotou zapnuté výrazne stmavoval celú scénu (terén aj steny jaskyne). Predvolená hodnota zmenená na vypnuté — používateľ si ho môže kedykoľvek zapnúť v paneli Pokročilé nastavenia.

## [2.4.16] - 2026-08-23
### Kompletná dvojúrovňová dokumentácia & In-App Pomocník
- **Interaktívny sprievodca priamo v hornej lište (`HelpModal.tsx`):**
  - Tlačidlo **Návod / Help (`?`)** v hornej lište a na úvodnej obrazovke otvára interaktívny prehľad nástrojov, formátov, navigácie, splay 3D stien, merania, tektoniky, Z-rezov, LiDARu a zdieľania s bilingválnym prepínačom (🇸🇰 SK / 🇬🇧 EN).
- **Používateľská príručka (Tier 1):**
  - Vytvorená kompletná používateľská príručka pripravená na publikovanie na `loch.sss.sk` a GitHub: [`docs/USER_GUIDE_SK.md`](docs/USER_GUIDE_SK.md) a [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md).
- **Vývojárska & Matematická špecifikácia (Tier 2):**
  - Vytvorená hĺbková technická dokumentácia so vzorcami, geodetickými transformáciami (S-JTSK / UTM / WGS84), Splay SDF Marching Cubes algoritmom, bisektorovými rovinami, tektonickým 3-bodovým dip/strike aparátom a EDL shadermi: [`docs/DEVELOPER_GUIDE_SK.md`](docs/DEVELOPER_GUIDE_SK.md) a [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).
- **Automatická synchronizácia dokumentácie:**
  - Vytvorený skill `speleo-docs-sync` a projektové pravidlá v `GEMINI.md` a `AGENTS.md` pre povinnú synchronizáciu oboch úrovní dokumentácie pri budúcich zmenách.

## [2.4.15] - 2026-08-23
### Optimalizácia UI & HUD
- **Optimalizácia pozície smerovej ružice (Compass Rose):**
  - Smerová ružica (azimut & severka) premiestnená do ľavého horného rohu 3D plátna (`top: 18px, left: 18px`), čím sa úplne eliminovalo prekrývanie s výškovým farebným indikátorom (`ColorScaleLegend`) v spodnom rohu.
  - Pôvodná poloha karty detailu stanice (`StationDetailCard`) upravená na `top: 92px`, aby pri kliknutí na bod plynulo nadväzovala pod ružicu bez kolízie.

## [2.4.0] - 2026-08-21
### Nové & Vylepšené
- **Nová zjednodušená horná lišta (Clean Top Bar):**
  - Odstránené nadbytočné textové popisy a duplicitné tlačidlá pohľadov `[1]`, `[2]`, `[3]`, `[4]` (axonometrické a kolmé pohľady sú plynulo riadené cez interaktívnu osovú ružicu / Viewport Gizmo).
  - Všetky nástroje sú usporiadané do čistých, moderných piktogramov v definovanom poradí: Export PNG, Ortogonál/Perspektíva, Zoom to Fit, Centerline, Model stien, Povrchový terén, Bounding Box, Horizontálny rez Z, Splays, Meranie, Farebná schéma, Výškový systém.
- **3-Stavové cyklické tlačidlo merania:**
  - Jediné tlačidlo v lište cyklicky prepína medzi režimami: `Deaktivované` ➡️ `Vzdialenosti (2 body)` ➡️ `Plocha / Polygón (3+ body)` ➡️ `Deaktivované`.
- **Vyhradený presúvateľný merací panel (`MeasurementPanel`):**
  - Okienko merania bolo premiestnené z centra scény na okraj renderovanej plochy s podporou drag & drop presúvania.
  - Podpora pre meranie 3D vzdialenosti, horizontálnej vzdialenosti, $\Delta H$, azimutu a sklonu pri 2 bodoch.
  - Podpora pre výpočet plochy $m^2$, obvodu $m$, sklonu roviny (Dip), smeru sklonu a smerníka pri 3 a viacerých bodoch.
  - Prehľadný zoznam bodov (`P1, P2...`) s tlačidlom ✖ na vymazanie konkrétneho bodu, tlačidlom `[Reštartovať meranie]` a exportom do schránky.
  - Zamedzené nechcenému automatickému resetu pri kliknutí do 3D modelu.
- **Karta detailu stanice na okraji (`StationDetailCard`):**
  - Informačné okienko kliknutej stanice sa ukotvuje na horný ľavý okraj a nezakrýva model v strede obrazovky.
- **Interaktívne snappovanie bodov & splayov:**
  - Rozšírená interaktivita `ClickableStations` umožňujúca pohodlne snappovať nielen hlavné polygonové stanice, ale aj koncové body splayov s vizuálnym azúrovým zvýrazňovačom (`#38bdf8`) a kurzorom `crosshair`.
- **Organická rekonštrukcia stien zo splayov s bisektorovou deliacou rovinou:**
  - Hlavné polygonové zámery ($A \to B$) sú vylúčené z triangulácie stien, aby nevytvárali neprirodzené vnútorné priečky (zostávajú ako referenčný centerline).
  - Implementovaná bisektorová deliaca normálová rovina $M = \frac{A+B}{2}$ medzi susednými stanicami, ktorá eliminuje kolidujúce a prekrývajúce sa kužele vo virtuálnych splayoch.
- **Smerová ružica & Výšková legenda:**
  - Smerová ružica je umiestnená vertikálne nad výškovou legendou (`bottom: 150px`), aby sa navzájom neprekrývali.
  - Výšková legenda (`ColorScaleLegend`) plne podporuje a okamžite reaguje na relatívny výškový systém (`REL`) s formátom `+120 m (rel)` a `-35 m (rel)`.
- **Optimalizovaný Zoom to Fit:**
  - Prepočet `calculateFitParams()` vyplní celú plochu obrazovky (~85% viewportu) pre perspektívne aj ortogonálne zobrazenie.
- **Výkon & Eliminácia render zaťaženia na popredí:**
  - Odstránené 200ms `setInterval` pretekanie v `CameraMonitor`, čím sa zamedzilo zbytočnému vyťažovaniu CPU/GPU pri nečinnosti v aktívnom tabe.

## [2.3.0] - 2026-08-20
### Nové
- **Prepínanie kamery (Perspektíva ↔ Ortografia):** Nové tlačidlo v hornej lište umožňuje okamžité prepnutie medzi perspektívnym 3D pohľadom a ortografickou projekciou pre presné technické axonometrie a rezy.
- **3-záložkový bočný panel:** Prehľadnejšie členenie ovládacích prvkov do 3 hlavných kategórií: `Jaskyňa`, `Terén` a `Analýza`.
- **Tektonické 3-bodové merania:** Samostatný geologický panel pre výpočet sklonu (*dip*), smeru sklonu (*dip direction*), smeru vrstvy (*strike*), plochy a normály roviny z 3 kliknutých bodov s 3D vizualizáciou roviny a spádnice.
- **3D interakcia so stenami jaskyne (LOX scraps):** Zapnutý raycasting a klikanie priamo na trojuholníkovú sieť stien jaskyne pre merania vzdialeností a tektoniky.
- **Oficiálny GKÚ ZBGIS WMS servis:** Prechod na oficiálne WMS mapové služby Geodetického a kartografického ústavu SR s podporou CORS a SSL proxy.
- **LiDAR 2D mapa z modelu:** Generovanie PNG pôdorysu z celého LiDAR modelu s vyčisteným povrchom, hillshade tieňovaním, vrstevnicami a plynulým obrysom.
- **LiDAR tvary bodov & guma:** Prepínač tvaru bodov (štvorec, guľôčka, kosoštvorec, šesťuholník) a grafická editácia/mazanie bodov štetcom priamo v prehliadači s podporou Undo/Reset.
- **Zobrazenie Git commitu na Welcome screene:** Úvodná obrazovka pri verzii zobrazuje presný hash commitu pre jednoduché overenie nasadenej verzie.
- **Mobilné nastavenia:** Plávajúce tlačidlo `Zavrieť nastavenia` na otvorenom mobilnom paneli.
### Nové
- **Welcome screen verzia:** Úvodná obrazovka zobrazuje aktuálnu verziu z `package.json`, takže H1 a verzia na prvej strane sa aktualizujú z jedného zdroja pravdy.

### Opravené
- **Blob URL a GPU cleanup:** Modelové bitmapy, PLY Blob URL, používateľské textúry, podlahové mapy, Mapbox terrain a nahrávky teraz uvoľňujú Blob/Three.js zdroje pri výmene alebo unmount.
- **Bezpečný iframe embed:** Generovaný iframe kód escapuje HTML atribúty a orezáva rozmery na rozumný rozsah.
- **v1 LiDAR filtering:** Skryté klasifikačné triedy sa už nepresúvajú na súradnicu 0,0,0; geometria sa skladá len z viditeľných bodov.
- **v1 duplicitný scale/measurement render:** Jaskyniar a manuálne spojenie sa renderujú len v kalibrovanej skupine.
- **v2 raycasting:** Klik a dvojklik v NextGen engine používajú reálny bounding rect canvasu, takže fungujú aj pri offsete UI.
- **v2 movement state:** `isMoving` sa po zastavení kamery znova vypne, čo stabilizuje progresívne renderovanie a mapové vrstvy.
- **PLY parsery:** v1 aj v2 parser čítajú hodnoty podľa deklarovaných PLY typov (`double`, `ushort`, `uchar`, `float`, atď.) namiesto pevného `float32`/`uint8` predpokladu.
- **v1 PLY decimácia:** Decimácia po naplnení 1M limitu pokračuje cez celý súbor pomocou deterministického replacement samplingu namiesto ukončenia na začiatku dát.
- **S-JTSK definícia:** GPS, TIFF reprojekcia a XYZ terrain používajú jednotnú definíciu súradnicového systému.
- **LOX wall režimy:** Obnovené samostatné render vetvy pre klasické steny jaskyne: solid farba, organic/smoothed, 3D render textúra, wireframe a color-by-height.
- **XYZ/WMS scraping povrchov:** LOX/DTM povrchy teraz dostávajú S-JTSK bbox z kalibrácie rohov mriežky, downloader už nevracia sivý placeholder ako úspech pri nulovom počte stiahnutých dlaždíc a geologická mapa ide cez WMS v EPSG:5514. Pred opravou boli overené limity zdrojov: ZBGIS ortofoto/DMR5 prakticky z15-z19, Freemap DMR5 shading z15-z18, Freemap ortofoto dostupné minimálne z15-z23 na testovacom bode.
- **XYZ/WMS UV kalibrácia pre UTM LOX:** Stiahnuté S-JTSK textúry sa pri UTM kalibrovaných LOX povrchoch prevádzajú späť do natívneho CRS DTM pred UV mapovaním. Vygenerovaný S-JTSK kalibračný TXT sa dá znova načítať pri custom JPG/PNG textúre.
- **STL cave walls:** STL modely sa už neotvárajú v LiDAR NextGen point-cloud režime, takže v bočnom paneli znova funguje farba stien, 3D render, wireframe a farebné podľa výšky.
- **STL/plastickosť stien:** Mesh steny majú procedurálne reliéfne tieňovanie a nový ovládač plasticity, pričom STL modely sa načítajú s plne nepriehľadnou stenou a silnejším relief defaultom.
- **STL selektívne zobrazenie:** STL mesh steny podporujú režimy Všetko, Podlaha, Strop a Rez na rovnakom `relHeight` princípe ako PLY segmentácia.
- **Mobilný welcome screen:** Úvodná obrazovka má kompaktný mobilný layout, viditeľné testovacie modely v prvom viewporte a bez horizontálneho pretekania.
- **Rotačné gizmo:** Rotačné gizmo je predvolene vypnuté, ale zostáva dostupné cez prepínač v nastaveniach.

### Dokumentácia
- README má aktuálnu verziu 2.3.0, opravený odkaz na bezpečnostný audit, doplnený STL formát v anglickej časti a presnejší text o verejnej povahe `VITE_` klientskych kľúčov.

## [2.2.0] - 2026-06-01
### Podpora 3D Mesh formátu STL
- **STL Parser:** Implementovaná podpora pre binárne a ASCII STL súbory. Modely sú načítavané asynchrónne cez background workera pomocou `STLLoader`.
- **Integrácia s Engine v1:** STL modely sú automaticky spracovávané ako "scraps" (steny), čo umožňuje ich tieňovanie a interakciu.
- **Automatické centrovanie:** Parser inteligentne vypočíta geometrický stred STL modelu, aby sa správne zobrazil aj bez georeferenčných dát.
- **Unit Testy:** Pridané testy pre overenie správnosti parsovania STL binárnych dát.

## [2.1.0] - 2026-06-01
### Parting Line Segmentácia & Stabilizácia
- **Mold Parting Line (Nový algoritmus):** Úplne nová logika segmentácie podlahy a stropu. Namiesto hľadania medzier používa geometrický stred (midpoint) vertikálnych stĺpcov. Tým sa eliminujú neprirodzene vysoké steny v úzkych vysokých meandroch.
- **Deliaca čiara [-1.0, 1.0]:** Body sú teraz mapované lineárne od dna (-1) po strop (+1). UI posuvník "Výška rezu" teraz funguje ako dynamický posun tejto deliacej roviny.
- **Typová čistka (TS Strict):** Zjednotená definícia `Vec3` naprieč celým projektom. Odstránené kritické `any` a `as any` z NextGen enginu. Zavedené rozhranie `LiDARWorkerMessage` pre typovo bezpečnú komunikáciu s Workerom.
- **Optimalizácia prenosu dát:** Implementované **Transferable Objects** pri komunikácii s Workerom, čo zrýchľuje načítavanie masívnych modelov bez lagovania UI.
- **Čistá konzola:** Odstránené varovania o duplicite Three.js a chyby CORS/429 pri geolokácii (nahradené natívnou detekciou prehliadača).
- **Unit Testy:** Pridané matematické overenie segmentácie v `src/v2/parsers/__tests__/segmentation.test.ts`.

## [2.0.2] - 2026-05-17
### UI Reorganizácia & Stabilizácia
- **Master Switch UI:** NextGen engine (v2) je teraz integrovaný priamo v sekcii "Steny jaskyne" ako hlavný prepínač. Tým sa zjednotilo ovládanie a vyčistila horná lišta.
- **Kontextové Sidebar Menu:** Sidebar dynamicky zobrazuje len relevantné nastavenia podľa zvoleného motora (LiDAR vs Mesh).
- **Nezávislé vrstvy:** Drôtený model (Wireframe) a vrstevnice na povrchu teraz fungujú nezávisle od ostatných vizuálnych režimov.
- **Vylepšený Organic mód:** Zvýšená agresivita vyhladzovania (Taubin smoothing) pre "blanket look" efekt bez ostrých hrotov.
- **Oprava navigácie:** Fixnutá logika `isMoving`, ktorá predtým blokovala vykresľovanie rúrok (Tubes) po zastavení pohybu.
- **Calibration Fix (v2):** Opravený prepočet súradníc pre meranie staníc v NextGen engine pri aktívnej kalibrácii.

## [2.0.1] - 2026-05-17
### Custom Farby & Analytické Rezy
- **Vlastná farba (Color Picker):** Implementovaná možnosť manuálneho výberu farby mračna bodov v NextGen engine so zachovaním plného tieňovania.
- **Ladenie plasticity:** Pridaný posuvník pre dynamickú kontrolu hĺbky tieňov a sýtosti detailov mračna.
- **Zvýraznenie rezov:** Dynamické farebné zvýraznenie (Clipping Highlight) hrán rezov pre lepšiu orientáciu v rezoch.
- **Synchronizácia s v1:** Plné prepojenie orezávacej logiky s nastaveniami "Vynechať jaskyňu z rezu" a farbou hrany z UI.
- **Precízna hustota:** Jemnejší krok nastavenia veľkosti bodov (0.05) pre dokonalé vyladenie hustoty.
- **Dokumentácia:** Vytvorený podrobný technický rozbor tieňovacej logiky v `docs/v2_SHADING_LOGIC.md`.

## [release-2026-05-16] - 2026-05-16
### NextGen Engine & LiDAR LOD (v2.0.0)
- **NextGen Engine (v2):** Predstavenie úplne nového vykresľovacieho motora optimalizovaného pre masívne LiDAR dáta a plynulý výkon.
- **Octree LOD & Streaming:** Implementácia hierarchického priestorového indexovania, ktoré umožňuje plynulé prezeranie miliárd bodov bez preťaženia RAM/GPU.
- **Eye-Dome Lighting (EDL):** Pridaný pokročilý post-processing shader pre mračná bodov, ktorý dodáva vizuálnu hĺbku a zvýrazňuje detaily stien (vzhľad podobný Potree).
- **Mapbox 3D Terrain:** Integrácia `three-geo` pre automatické načítavanie satelitného 3D terénu nad jaskyňou na základe jej GPS polohy.
- **Street View Navigácia:** Implementovaný plynulý "let" k bodu po dvojkliku s inteligentným odstupom od stien a históriou pohybu (Undo/Ctrl+Z).
- **Architektonický Refaktoring:** Kód rozdelený na `v1` (Standard), `v2` (NextGen) a `shared` moduly. Zjednotené typy a rozhrania pre cross-engine kompatibilitu.
- **Inteligentné Predvoľby:** Automatické nastavenie jasu a veľkosti bodov na základe hustoty nahrávaného modelu.

## [release-2026-05-12-01] - 2026-05-12
### Refaktoring & Optimalizácia (v1.6.0)
- **Koordináty & Moduly:** Presun funkcií `tryUtmToWgs84` a `tryJtskToWgs84` do dedikovaného modulu `src/utils/coords.ts` pre lepšiu znovupoužiteľnosť a čistotu kódu v `App.tsx`.
- **Výkon parsovania:** Optimalizácia parsovania `CaveData` a stabilizácia E2E testov pre veľké modely.
- **Oprava XYZ Scrapingu:** Vyriešený bug v UV mapovaní a stabilizácia sťahovača XYZ dlaždíc pre ortofotomapy.

## [release-2026-05-09-1] - 2026-05-09
### Georeferencovanie & XYZ Scraping (v1.5.0)
- **XYZ Scraping:** Integrácia sťahovania ortofotomáp a DMR5 dát pomocou XYZ dlaždíc pre realistické povrchy.
- **Manuálna GPS kalibrácia:** Pridané rozhranie pre manuálne zadávanie GPS súradníc staníc a sťahovanie nadmorskej výšky zo ZBGIS.
- **Stabilita:** Vyriešené chyby v `CaveViewer3D` týkajúce sa rozsahu premenných `texWidth`/`texHeight`.
- **WMS optimalizácia:** Zrýchlená vizualizácia WMS terénov a úprava hrúbky rotačného gizma.


## [release-2026-05-07-01] - 2026-05-07
### Branding & Signature (v1.4.3)
- **Rebranding:** Premenovanie skratky aplikácie v lište z `CV 3D` na `LV 3D` (LochViewer).
- **Podpis autora:** Pridaný text "by DankeZ" na úvodnú obrazovku pod názov aplikácie a do legendy výškového odstupňovania.
- **Oprava UI:** Odstránené duplicitné zobrazenie verzie na úvodnej obrazovke.

## [release-2026-05-06-02] - 2026-05-06
### Podmienená interakcia & LiDAR Bulge (v1.4.1)
- **Režim merania (Measurement Mode):** Implementovaný striktný gating interakcie. V základnom režime navigácie sú interaktívne IBA polygonové body (LOX/PLT), čím sa eliminuje náhodné klikanie na LiDAR mračná a terén.
- **Vypuklosť / Dilation (Bulge):** Pridaný nový ovládací prvok pre organické modely, umožňujúci interaktívne nafúknutie alebo zúženie rekonštruovaného povrchu (offset vrcholov v smere normál).
- **Fixácia LiDAR stropov:** Opravená kritická chyba v `parser.worker.ts`, kde heuristická klasifikácia odrezávala horné steny jaskýň. PLY súbory bez natívnej klasifikácie sú teraz spracovávané v plnom vertikálnom rozsahu.
- **Optimalizácia interakcie:** Gating bol aplikovaný na `PointCloud`, `OrganicShell`, `TerrainMesh` a `ClickableStations` pre maximálnu presnosť pri práci s polygonovým ťahom.

## [release-2026-05-06-01] - 2026-05-06
### LiDAR Progresívny LOD & Optimalizácia (v1.4.0)
- **Progresívne zjemňovanie (Refinement):** Implementovaný systém plynulého dovykresľovania bodov (stride 16 -> 8 -> 4 -> 2 -> 1) po zastavení pohybu pre maximálny detail.
- **Voxelová mriežka (1M bodov):** Zvýšený limit na 1 000 000 bodov pri zachovaní špičkového výkonu vďaka novej `Uint8Array` mriežke (namiesto pomalého BigInt Setu).
- **Rovnomerná decimácia:** Opravené orezávanie modelu pri načítaní; body sú teraz distribuované rovnomerne po celom povrchu jaskyne pomocou nového voxelového kľúča.
- **Vysoko-rýchlostná rekonštrukcia:** Kompletný refaktoring BFS algoritmu a triangulácie, zrýchľujúci generovanie meshu o 500-800%.

## [release-2026-05-05-1] - 2026-05-05
### LiDAR Výkon & Organická Rekonštrukcia (v1.3.3)
- **Google Maps Loading:** Implementované postupné načítavanie mračien bodov (najprv hrubý obrys, potom detaily) pre okamžitú spätnú väzbu pri veľkých PLY súboroch.
- **Dynamický LOD:** Agresívna decimácia bodov (5% hustota) počas rotácie a pohybu kamery pre maximálnu plynulosť na slabšom hardvéri.
- **Jemná Organickosť:** Prekalibrovaná citlivosť posuvníka "Úroveň organickosti" (krok 0.1), umožňujúca precízne vyhladzovanie od nuly bez skokových zmien.
- **Zjednodušenie UI:** Odstránenie experimentálneho panelu LiDAR Analýza pre čistejšie používateľské prostredie.

## [release-2026-05-03-2] - 2026-05-03
### Optimalizácia & Finalizácia
- **UI Consistency:** Zjednotenie verziových štítkov na v1.3.2 naprieč celou aplikáciou.
- **Responsive Depth:** Pridanie vizuálnej hĺbky (centrálny glow) na úvodnú obrazovku pre prémiový vzhľad na ultra-širokých monitoroch.
- **Mobile Navigation:** Vylepšená stabilita bočného menu pri prechode medzi mobilným a desktopovým zobrazením.

## [release-2026-05-03-1] - 2026-05-03
### Opravy & LiDAR Interakcia
- **PLY Interaction:** Opravené meranie a klikanie na mračná bodov (PLY) zvýšením thresholdu raycastingu na 0.5m.
- **Silk Smoothing:** Vylepšený "Silk" efekt rekonštrukcie povrchu (vyšší Laplacian tension 0.6) pre organické modely.
- **UI Refinement:** Responzívnejšia úvodná obrazovka s širokým rozložením a zobrazením verzie v1.3.1.
- **Sidebar:** Zvýraznené hlavičky sekcií v bočnom paneli pre lepšiu navigáciu.
- **Close Button:** "Zavrieť" je teraz vpravo hore, červené a výrazné.

## [1.3.0] - 2026-05-03
### Pridané
- **Silk/Fabric Reconstruction:** Nový algoritmus pre organické modely simulujúci napätie membrány.
- **Angle-Weighted Normals:** Prémiové tieňovanie povrchu eliminujúce viditeľné hrany na hladkých modeloch.
- **Surface Nets:** Stabilná implementácia dual contouringu pre LiDAR dáta.
### Opravené
- **Triangle Mesh:** Návrat k vysokej presnosti pomocou Taubin vyhladzovania (non-shrinking).
- **UI Cleanup:** Odstránené ikony a "NEW" tagy zo sidebaru pre profesionálnejší vzhľad.

## [1.2.0] - 2026-05-01
- Google Drive integrácia a podpora pre externé hostovanie modelov.
