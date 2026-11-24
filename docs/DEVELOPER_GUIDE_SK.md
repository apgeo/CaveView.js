# 🛠️ LochViewer - Vývojárska a matematická dokumentácia (v2.5.11)

*Kompletná technická špecifikácia, matematický aparát, architektúra a flow diagramy pre vývojárov.*

### Optimalizácia vykresľovania vrstevníc na 60 FPS počas pohybu (v2.5.11)

1. **Architektúra potláčania DOM overlayov počas pohybu (`ContourLabels`)**:
   - **Problém**: Každá výšková kóta vrstevnice bola reprezentovaná samostatnou inštanciou komponentu `<Html>` z knižnice `@react-three/drei`. Pri strmých alebo členitých modeloch terénu (napr. 500 m DMR 5.0) sa generovalo 100 až 400 DOM prvkov. Pri rotácii a pohybe kamery knižnica Drei na každej snímke (16.6 ms) vykonávala inverznú transformáciu kamery, unproject do 2D obrazovky a modifikáciu DOM inline štýlov (`style.transform`), čo spolu s CSS `backdropFilter: blur` a per-label `useFrame` hookom spôsobovalo layout thrashing a pokles snímkovej frekvencie na 15–25 FPS.
   - **Riešenie (`isMoving` brána)**:
     ```typescript
     const ContourLabels = React.memo(({ surface, majorInterval, color, opacity, isMoving }: any) => {
       if (isMoving) return null;
       // ... generovanie bodov
     });
     ```
     Počas pohybu kamery (`isMoving === true`) je vykresľovanie HTML kót okamžite potlačené (0 DOM operácií). Po uvoľnení manipulácie (180 ms idle prah) sa kóty okamžite zobrazia.
   - **Optimalizácia `ContourLabelItem`**:
     Odstránený per-item hook `useFrame`, odstránený `backdropFilter: blur(2px)` a konfliktná CSS `transition`. Perspektívne škálovanie zabezpečuje priamo Drei `distanceFactor={85}` a hardvérové vrstvenie `willChange: transform`. Maximálny rozpočet kót je obmedzený na 36 prvkov globálne a 3 na jednu výškovú hladinu.

2. **Konsolidácia a odľahčenie materiálu vrstevníc (`MeshBasicMaterial` v `TerrainMesh`)**:
   - **Problém**: Pôvodná implementácia inštanciovala `MeshStandardMaterial` v každej dlaždici terénu samostatne ($N$-krát pre $N$ dlaždíc). Standard materiál vykonával kompletný fyzikálny PBR výpočet osvetlenia (4 bodové/smerové svetlá, normálové matice, odrazy) na 500 000 trojuholníkoch, hoci výstup fragment shaderu v `#include <dithering_fragment>` bol nahradený unlit farbou vrstevnice. Súčasne bol vypnutý face culling (`DoubleSide`).
   - **Riešenie**:
     Materiál bol presunutý na úroveň rodičovského komponentu `TerrainMesh` ako jediná zdieľaná inštancia `MeshBasicMaterial`:
     - **Hardware culling**: `side: THREE.FrontSide` umožňuje GPU zahodiť odvrátené trojuholníky terénu.
     - **Žiadne svetelné výpočty**: `ShaderLib.basic` neobsahuje žiadne svetelné cykly ani PBR kalkulácie.
     - **Zdieľanie inštancie**: 1 kompilácia shaderu namiesto $N$, nulové prepínanie materiálov vo WebGL renderovacom stave pri prechode dlaždicami.

---

### Výškový systém Bpv, model kvázigeoidu SR a detekcia CRS jaskyne (v2.5.10)

1. **Matematický model kvázigeoidu SR (DMQSK2014-E / DVRM05, `slovakiaQuasigeoid.ts`)**:
   - **Fyzikálny kontext**: Štátna WCS služba INSPIRE (`inspirews.skgeodesy.sk`) vracia DMR 5.0 dáta v súradnicovom systéme `EPSG:3046` s elipsoidickými výškami $h$ referovanými na elipsoid GRS80 (ETRS89). Speleologické zamerania na Slovensku a v strednej Európe však používajú ortometrické / normálne výšky nad strednou hladinou Baltského mora (Balt po vyrovnaní, Bpv).
   - **Základná redukčná rovnica**:
     $$H_{\text{Bpv}} = h_{\text{ETRS89}} - \zeta(\varphi, \lambda)$$
     kde $\zeta(\varphi, \lambda)$ predstavuje odchýlku kvázigeoidu od elipsoidu GRS80 (pre SR v rozsahu $36.0\ \text{m} \le \zeta \le 46.5\ \text{m}$, v oblasti Slovenského krasu $\zeta \approx 41.6\ \text{m}$).
   - **Vstavaná interpolovaná matica kvázigeoidu**:
     Pokrýva celé územie SR: $\varphi \in [47.5^\circ, 49.7^\circ]$ (krok $\Delta\varphi = 0.05^\circ$, 45 riadkov), $\lambda \in [16.7^\circ, 22.7^\circ]$ (krok $\Delta\lambda = 0.05^\circ$, 121 stĺpcov), odvodená z národného geodetického modelu GKÚ SR (`sk_gku_Slovakia_ETRS89h_to_Baltic1957.tif`).
   - **Bilineárna interpolácia**:
     Pre bod $(\varphi, \lambda)$ s indexmi $i = \lfloor (\varphi - 47.5) / 0.05 \rfloor$, $j = \lfloor (\lambda - 16.7) / 0.05 \rfloor$:
     $$u = \frac{\varphi - \varphi_i}{0.05}, \quad v = \frac{\lambda - \lambda_j}{0.05}$$
     $$\zeta(\varphi, \lambda) = (1-u)(1-v)\zeta_{i,j} + u(1-v)\zeta_{i+1,j} + (1-u)v\zeta_{i,j+1} + uv\zeta_{i+1,j+1}$$
   - **Presnosť**: Stredná chyba interpolácie $< 1.5\ \text{cm}$ v porovnaní s plným GeoTIFF gridom, pri nulovej pamäťovej záťaži a nulovej sieťovej réžii.
   - **Aplikácia na výškový terén (`dmrDownloader.ts`)**:
     Ak je zvolený systém `bpv` (predvolený):
     $$\forall i, j: \quad z'_{i,j} = z_{i,j} - \zeta_{\text{ref}}$$
     $$\text{bounds.minZ}' = \text{bounds.minZ} - \zeta_{\text{ref}}, \quad \text{bounds.maxZ}' = \text{bounds.maxZ} - \zeta_{\text{ref}}$$

2. **Detekcia súradnicového referenčného rámca jaskyne (`caveCoordinateSystem.ts`)**:
   - **Heuristická analýza súradníc staníc a vchodov**:
     - **S-JTSK (EPSG:5514 / EPSG:8352)**: V súboroch Therion `.lox` sú stanice uložené priamo v rovine Křováka ($X < -150\,000\ \text{m}$, $Y < -900\,000\ \text{m}$).
     - **Meridiánová konvergencia $\gamma$**:
       Křovákovo kužeľové zobrazenie vykazuje uhol medzi kartografickým severom (os $-X$) a geografickým severom:
       $$\gamma \approx \Delta\lambda \cdot \sin(\varphi_0) \approx -2.8^\circ \text{ až } -3.5^\circ$$
       Afinná transformácia DTM terénu v `dmrDownloader.ts` pomocou `proj4` automaticky zohľadňuje túto rotáciu:
       $$\mathbf{p}_{\text{JTSK}} = \mathbf{T} \cdot \mathbf{p}_{\text{UTM}}$$
     - **GPS UTM 34N/35N**: Súradnice $X \in [100\,000, 900\,000]$, $Y \in [4\,700\,000, 5\,600\,000]$. Terén DMR 5.0 je mapovaný v metrickej UTM rovine 1:1.
     - **WGS-84 (stupne)**: Detekované podľa rozsahu $\varphi \in [47^\circ, 50^\circ]$, $\lambda \in [16^\circ, 23^\circ]$ s okamžitou konverziou na UTM 34N.
     - **Lokálne relatívne meranie** (napr. $[0, 0, Z]$): Ak jaskyňa obsahuje aspoň jednu pevnú stanicu alebo vchod s GPS metadátami, počiatok stiahnutého DMR 5.0 terénu je posunutý o $\mathbf{t} = (E_{\text{vchod}}, N_{\text{vchod}})$, čím sa lokálny model jaskyne prirodzene umiestni do reálnej terénnej topografie.

---

### Architektúra rozhrania: Zjednotený riadok vrstevníc a umiestnenie textúry (v2.5.9)

1. **Unifikovaný jednoriadkový riadiaci blok vrstevníc (`SurfaceSection.tsx`)**:
   - **Kompaktná štruktúra**: Riadok `Vrstevnice (10m)` v poli `primary` združuje označenie, ColorPicker pre základné vrstevnice (`opts.contourColor`, štandardne zelená `#00ff00`), ColorPicker pre hlavné vrstevnice (`opts.contourColor10`, štandardne červená `#ff0000`) a prepínač zapnutia/vypnutia (`opts.showContours`).
   - **Odstránenie duplicitných riadkov**: Z poľa `details` boli odstránené redundantné riadky `t('terrain.contours')` a zachované bolo iba samostatné nastavenie pre zobrazenie výškových kót (`opts.showContourLabels`).
   - **Pozícia textúry**: Ovládací prvok `Textúra (JPG/PNG)` (`terrain.texture`) a jeho detailné parametre projekcie boli presunuté na úplný koniec nastavení povrchu.

2. **Rozšírenie komponentu `ColorPicker` (`controls.tsx`)**:
   - Pridané voliteľné typovanie `style?: React.CSSProperties` s predvoleným `marginLeft: 8`, umožňujúce externé prepísanie (napr. `style={{ marginLeft: 2 }}`) pre kompaktné radenie vzorkovníkov vedľa seba.

---

### Architektúra rozhrania: Samostatná záložka Povrch, CAD Štýl a Dokumentačný register sekcií (v2.5.8)

1. **Oddelenie sekcií Jaskyňa (`cave`) a Povrch (`surface`) v bočnom paneli**:
   - **Kategórie navigácie (`reveal.ts`)**: Typový zväzok `NavCategory` bol rozšírený na `'project' | 'view' | 'cave' | 'surface' | 'analysis' | 'system'`.
   - **Spätná kompatibilita**: Funkcia `revealInSidebar` automaticky normalizuje legacy požiadavku `'layers'` na `'cave'`. V komponente `NavigationSidebar` sa pre sekciu jaskyne vyhodnocuje `sections.cave ?? sections.layers`, čím je zaistená 100% kompatibilita so staršími testami a externými odkazmi.
   - **Prepojenie s hornou lištou (`ViewerToolbar.tsx`)**: Tlačidlá pre polygónový ťah, splaye, steny a stanice odkazujú do kategórie `cave`. Tlačidlá pre povrch, textúry a DMR 5.0 odkazujú do kategórie `surface`.

2. **Dokumentačný register sekcií (`sectionDocRegistry.ts`) a informačný modál (`SectionInfoModal.tsx`)**:
   - **Centralizovaný register**: Každá sekcia a nástroj obsahuje bilingválne metadáta definované v `sectionDocRegistry.ts`:
     ```typescript
     export interface SectionDoc {
       title: string;
       badge?: string;
       desc: string;
       bullets: string[];
       helpTab?: 'basics' | 'nav' | 'splays' | 'measuring' | 'clipping' | 'lidar' | 'terrain' | 'share';
     }
     ```
   - **Informačné tlačidlo (`SidebarAccordion.tsx`)**: Komponent pri zadaní `infoTopic` a `lang` automaticky vykreslí tlačidlo `.cad-info-btn` so symbolom `ℹ️`.
   - **Prístupnosť a modálne okno**: Kliknutím sa otvorí dialóg `SectionInfoModal` s jantárovým záhlavím, technickým odznakom, prehľadnými bodmi a možnosťou otvoriť priamo príslušnú kapitolu v globálnom okne Pomocníka (`HelpModal`).

3. **Geolokalizovaná detekcia jazyka a lišta prepínania (`i18n/index.ts`, `ViewerToolbar.tsx`)**:
   - Funkcia `getBrowserLanguage()` zisťuje preferenciu používateľa v nasledujúcej hierarchii:
     1. Uložená hodnota v `localStorage.getItem('cv-language')`.
     2. Kontrola časového pásma klienta cez `Intl.DateTimeFormat().resolvedOptions().timeZone`: ak patrí do `Europe/Bratislava` alebo `Europe/Prague`, vráti `'sk'`.
     3. Kontrola jazyka prehliadača `navigator.language`: ak začína na `sk` alebo `cs`, vráti `'sk'`.
     4. Pre všetky ostatné krajiny vráti `'en'`.
   - V pravej časti hornej lišty je integrovaný prepínač `SK | EN | DE | FR` s okamžitou reaktivitou a zápisom do `localStorage`.

4. **Jednotný vizuálny štýl CAD sekcií**:
   - Jantárovo-zlaté nadpisy sekcií (`#f59e0b`) so zhodnou typografiou a ikonografiou.
   - Výrazné celošírkové tlačidlá (`btn-fullwidth`) s jasným ohraničením a kontrastom pre jednoduchú identifikáciu na dotykových displejoch v teréne.

---

### Sťahovanie a generovanie povrchového terénu DMR 5.0 (WCS 2.0.1) (2.5.7)

1. **OGC WCS 2.0.1 protokol a INSPIRE špecifikácia (`dmrDownloader.ts`)**:
   - **Štátny server GKÚ SR**: `https://inspirews.skgeodesy.sk/geoserver/el/ows`
   - **Vrstva reliéfu**: `el__EL.GridCoverage` (LiDAR DMR 5.0 SR v 1 m rastri, 100% národné pokrytie).
   - **Referenčný systém**: ETRS89 / UTM zóna 34N (`EPSG:3046` / `EPSG:25834`, kódovanie elipsoidu GRS80).
   - **Výstupný formát**: `image/tiff;application=geotiff` (32-bit IEEE Float raster).
   - **KVP Subsetting požiadavka**:
     $$\text{subset}=\text{N}(N_{min}, N_{max})\quad\&\quad\text{subset}=\text{E}(E_{min}, E_{max})$$

2. **Matematický výpočet výseku (`calculateDmr5Bounds`) a World File (`generateTfwContent`)**:
   - Pre zadané GPS $(\varphi, \lambda)$ a požadovaný rozsah $L$ (predvoľby $500, 1000, 2000\ \text{m}$ alebo vlastný rozsah s krokom $500\ \text{m}$):
     $$(E_c, N_c) = \text{proj4}(\text{WGS84}, \text{UTM34}, [\lambda, \varphi])$$
     $$E_{min} = \text{round}(E_c - L/2), \quad E_{max} = E_{min} + L$$
     $$N_{min} = \text{round}(N_c - L/2), \quad N_{max} = N_{min} + L$$
   - Štandardný 6-riadkový ESRI World File (`.tfw`) definuje stred ľavého horného pixela:
     $$\text{Line 1}: 1.0, \quad \text{Line 2}: 0.0, \quad \text{Line 3}: 0.0, \quad \text{Line 4}: -1.0$$
     $$\text{Line 5}: E_{min} + 0.5, \quad \text{Line 6}: N_{max} - 0.5$$

3. **Geodetické zosúladenie s jaskynným meračským rámcom (`createDmr5Surface`)**:
   - **Jaskyňa v UTM 34N**: Priame zjednotenie `surface.centerOffset = cave.centerOffset`.
   - **Jaskyňa v S-JTSK**: Rigorózny prepočet kalibračnej matice povrchu cez `proj4(UTM34_DEF, SJTSK_DEF, ...)`.
   - **Jaskyňa v lokálnych meračských súradniciach**: Ak je známa poloha referenčného vchodu $(\varphi_{ent}, \lambda_{ent}) \rightarrow (E_{ent}, N_{ent})$ a jeho lokálne súradnice $(x_{ent}, y_{ent})$:
     $$E_{origin} = E_{ent} - x_{ent}, \quad N_{origin} = N_{ent} - y_{ent}$$
     $$X_{origin, calib} = E_{min} - E_{origin}, \quad Y_{origin, calib} = N_{max} - N_{origin}$$
     Povrch sa po prechode do scény prepočíta s nulovou odchýlkou voči vchodu.
   - **Podpora textúr**: Na vygenerovaný povrch sa okamžite vypočíta `sjtskBbox`, vďaka čomu je možné naň priamo aplikovať ZBGIS Ortofotomapu, DMR tieňovaný reliéf alebo geologickú mapu.

### Najkratšia 3D vzdialenosť k povrchu (minimálna hrúbka masívu), GPS a ZBGIS LiDAR (2.5.5)

1. **Matematický aparát a hierarchia referenčného bodu (`findReferenceStation`)**:
   - **Priorita 1 (Vchod jaskyne)**: Stanica s `isEntrance === true` alebo názvom obsahujúcim `vchod`, `vstup`, `entrance`, `eingang`, `trou`, `boca`, `zavrt`. Výška vchodu je $Z_{vchod}$. Ak má stanica priradené GPS (`gps !== null`), typ je `'entrance_gps'`, inak `'entrance'`.
   - **Priorita 2 (Bod s najnižším číslom)**: Ak jaskyňa nemá definovaný vchod ani GPS, vyradia sa povrchové stanice (názov s `surface`, `povrch`, `teren`, `gps`, `fix` alebo stanice pripojené výhradne k segmentom s `type === 'surface'`). Zo zostávajúcich staníc sa vyberie bod s minimálnym číselným identifikátorom (napr. 0, 1, 2... resp. najnižším indexom `idx`). Typ je `'lowest_station'`.
   - **Denivelácia od vchodu / referenčného bodu**:
     $$\Delta Z_{vchod} = Z_{bod} - Z_{ref}$$
     Kladná hodnota ($\Delta Z > 0$) vyjadruje polohu nad úrovňou vchodu (napr. komíny, horné poschodia), záporná hodnota ($\Delta Z < 0$) polohu pod úrovňou vchodu.

2. **Hĺbka pod povrchom a kolmé vzorkovanie DTM (`sampleSurfaceElevationAt`)**:
   - V 3D scéne s posunom kalibrácie jaskyne $\mathbf{o}_{cave}$ a posunom povrchu $\mathbf{o}_{surf}$ platí pre horizontálnu polohu kolmo nad bodom jaskyne $(X_{cave}, Y_{cave})$:
     $$X_{DTM} = X_{cave} + o_{cave, x} - o_{surf, x}$$
     $$Y_{DTM} = Y_{cave} + o_{cave, y} - o_{surf, y}$$
   - Z mriežky DTM sa interpoluje nadmorská výška povrchu $Z_{raw} = \text{sampleDtmAt}(X_{DTM}, Y_{DTM})$. Skutočná výška povrchu v scéne je:
     $$Z_{povrch} = Z_{raw} + o_{surf, z}$$
   - Vertikálna hĺbka bodu priamo pod povrchom:
     $$\text{distToSurf} = Z_{povrch} - (Z_{bod} + o_{cave, z})$$

3. **Geometricky najkratšia 3D vzdialenosť k povrchu (`findClosestSurfacePoint`) a GPS (`worldToWgs84`)**:
   - Pre bod v jaskyni $\mathbf{Q} = (X_q, Y_q, Z_q)$ a povrch reprezentovaný triangulovanou DTM mriežkou hľadáme bod $\mathbf{P}^* \in \mathcal{S}_{DTM}$, ktorý minimalizuje euklidovskú vzdialenosť v 3D:
     $$d_{3D}^* = \min_{\mathbf{P} \in \mathcal{S}_{DTM}} \|\mathbf{Q} - \mathbf{P}\|$$
   - **Ohraničenie vyhľadávacieho priestoru**: Ak je známa zvislá hĺbka $d_{vert} = |Z_{povrch} - Z_q|$, najkratšia vzdialenosť spĺňa $d_{3D}^* \le d_{vert}$. Horizontálny polomer hľadania v rovine $X-Y$ je preto striktne obmedzený $R_{max} = d_{vert}$. Cez inverznú maticu DTM kalibrácie sa ohraničí rozsah mriežky $[c_{min}, c_{max}] \times [r_{min}, r_{max}]$.
   - **Projekcia bodu na trojuholník (Christer Ericson algorithm)**: Každý štvorcový element mriežky je rozdelený na dva trojuholníky $(V_{00}, V_{10}, V_{01})$ a $(V_{10}, V_{11}, V_{01})$. Výpočet projekcie $\mathbf{Q}$ na trojuholník prebieha bez alokácie pamäte v pamäťovom registri s overením Voronoiových oblastí vrcholov, hrán a plochy trojuholníka.
   - **Geodetický prevod svetových súradníc na WGS84 (`worldToWgs84`)**:
     Ak má povrchový bod súradnice UTM alebo S-JTSK, vykoná sa priama rigorózna transformácia. Ak je model v lokálnych meračských súradniciach a je známy referenčný GPS bod vchodu $(\varphi_{ref}, \lambda_{ref})$, odchýlka $(\Delta x, \Delta y)$ sa prepočíta podľa meridiánovej a rovnobežkovej metriky WGS84 elipsoidu:
     $$M_{\varphi} = 111132.92 - 559.82 \cos(2\varphi_{ref}) + 1.175 \cos(4\varphi_{ref})$$
     $$N_{\lambda} = 111412.84 \cos(\varphi_{ref}) - 93.5 \cos(3\varphi_{ref})$$
     $$\varphi_{surf} = \varphi_{ref} + \frac{\Delta y}{M_{\varphi}}, \quad \lambda_{surf} = \lambda_{ref} + \frac{\Delta x}{N_{\lambda}}$$
   - **Generovanie URL odkazov**:
     - Google Maps: `https://maps.google.com/?q={lat},{lon}`
     - ZBGIS LiDAR: `https://zbgis.skgeodesy.sk/mapka/sk/teren/identification/point/{lat},{lon}?pos={lat},{lon},18` (presná identifikácia bodu s terčom a dialógom, mierka 18 pre detailný DMR 5.0)

4. **3D vizualizácia (`SurfaceDepthVisual`)**:
   - Vykresľuje sa v rámci lokálnych centrovaných súradníc skupiny jaskyne.
   - Počiatočný bod v jaskyni: $\mathbf{p}_{station} = (pos.x, pos.z, -pos.y)$.
   - Kolmý bod na povrchu: $\mathbf{p}_{vert} = (pos.x, pos.z + \text{distToSurf}, -pos.y)$.
   - Najbližší 3D bod na povrchu: $\mathbf{p}_{closest} = (closestSurfPos.x, closestSurfPos.z, -closestSurfPos.y)$.
   - **Najkratšia 3D spojnica**: výrazná jantárovo-oranžová línia (`color="#f59e0b"`, `lineWidth={3.8}`, `dashed={true}`) s dvojitým terčom na povrchu a štítkom mierky $\min d_{3D}$ doplneným o GPS súradnice.
   - **Vertikálna línia**: jemná svetlomodrá čiarkovaná línia (`color="#38bdf8"`, `lineWidth={1.8}`) s kótou $Z_{povrch}$ kolmo hore.
   - **Separácia a zjednotenie**: Ak je vzdialenosť $\|\mathbf{p}_{vert} - \mathbf{p}_{closest}\| < 0.25\text{ m}$ (rovný terén nad jaskyňou), línia sa vykreslí v jednom dominantnom štýle so združeným popisom, čím sa predchádza prekrývaniu a vizuálnemu šumu.
   - Komponent je plne paritný pre Engine v1 (`CaveViewer3D`) aj Engine v2 (`CaveViewerNextGen`).

### Výber staníc, meranie a rýchla lišta (2.4.34)

`StationLabel.pos`, `SelStation.pos` a voliteľný bod `StationClick` používajú **centrované meračské XYZ so Z nahor**. Scéna používa `T(p) = (x + cx, z + cz, -y - cy)` s kalibráciou `c`; `sceneToSurvey` pri v2 zásahu vykoná inverziu práve raz. Pôvodné súradnice sú `p + cave.centerOffset`. Bod terénu sa pred vykreslením inverzne prevedie do lokálneho rámca skupiny jaskyne. Vzdialenosti aj polygón počítajú v rovnakom rámci ako značky a čiary, aj pri kalibrovanom posune jaskyne voči terénu.

`SurveyPointPicker` pri zachytenom natívnom kliknutí premietne zapnuté stanice/splay body, prijme najbližší bod do 10 CSS pixelov (pri zhode rozhoduje bližšia hĺbka) a spotrebuje udalosť pred mesh handlermi. Pohyb nad 5 px znamená otáčanie, nie výber. Nepribudlo snímkové prehľadávanie, pomocné GPU ciele ani zmena worker protokolu. v2 povoľuje voľný výber len zo skupiny mračna, ignoruje pomocnú geometriu a presný vrchol obnoví z `Intersection.index` a `matrixWorld`. Siete/terén reagujú na klik, nie začiatok ťahania.

`measureDistance`: `d3 = hypot(dx,dy,dz)`, `dXY = hypot(dx,dy)`, sklon `atan2(dz,dXY)`, sieťový azimut `atan2(dx,dy) mod 360°`. `measurePolygon` počíta plochu usporiadaného rovinného polygónu `A = |Σ((pi-p0) × (pi+1-p0))|/2` a uzavretý 3D obvod. Nerovinný obvod dáva vektorovú/projekčnú plochu, nie plochu triangulovaného povrchu. Tektonickú orientáciu naďalej určuje prvá trojica. Hĺbka je `DTM(X+caveOffsetXY-surfaceOffsetXY)+surfaceOffsetZ-Z-caveOffsetZ` len pri pokrytí konečnými hodnotami DTM.

LOX zachováva `isFixed` (`m_flags & 0x04`) a `qualifiedName` (`stanica@survey.parent`); hierarchia survey má ochranu pred cyklom. `ViewerOptions` pridáva voliteľné `showFixedStations`, `showCenterline` (undefined znamená viditeľné) a `stationLabelMode: off|short|full|altitude|gps`. Staré prepínače mien/výšok zrušia explicitný režim. Bez GPS údajov sa GPS krok cyklu preskočí.

Zdieľané URL zachovávajú tieto voľby ako `cline=0`, `fixed=1` a `labels=off|short|full|altitude|gps`; neznáme režimy popisov sa ignorujú. Oba obaly Canvas izolujú CSS stacking context, aby premietnuté HTML popisy neprekrývali merací panel ani ostatné ovládanie aplikácie.

Predvolené pohľady animujú samostatný vektor polohy a priebežne ho aplikujú na aktuálnu R3F kameru. Zmena projekcie môže nahradiť kameru bez straty animácie pôdorysu/profilu; nový pohľad alebo odmontovanie zruší predchádzajúci tween. Pôdorys v lište cyklí `top`/`bottom`, Nárys `front` (z juhu, kamera na +Z) → `east` (+X) → `back` (−Z) → `side` (−X); všetky sú hodnoty `ViewPreset` z `@shared/types`. `bottom` dáva kameru na −Y s `up = (0,0,−1)`, sever ostáva hore a východ/západ sú zrkadlové. Pri pomalých softvérových GL snímkach GSAP lag smoothing natiahne 0,65 s tween, preto E2E čaká až 20 s.

`ViewerToolbar` používa typované navigačné callbacky a existujúce SVG Lucide. Obrazový dialóg a snímky reprezentácií vrstiev sú lokálne a nemenia App/Canvas. Vrstvové akcie zámerne menia spoločné options; Steny/Povrch si uložia reprezentácie, skryjú ich a opätovne obnovia. Reload parsuje uchované pôvodné bajty cez existujúci parser worker. `MeasurementOverlay` má priehľadné čiary bez depth-testu v neskorej render-order skupine a neinteraktívne HTML značky A/B. Bez novej runtime závislosti.

### Zjednotená navigácia (2.4.33)

`src/shared/components/NavigationSidebar/` obsahuje obal panela, accordiony s natívnymi tlačidlami, typované väzby a sekcie Project/View/Layers/Surface/Analysis/System. Surface je podskupinou Vrstiev, nie šiestou kategóriou. Kalibrácia jaskyne/povrchu je výhradne tam; WebM záznam a jeho dĺžka sú výhradne v Súbor → Zdieľanie a dostupné exporty.

`App` ponecháva stav datasetu, `ViewerOptions`, workery a handlery ovplyvňujúce scénu. `NavigationBindings` je typované rozhranie UI; sekcie používajú potrebné polia. Aktívnu kategóriu, zbalenie na počítači a mobilný drawer vlastní lokálne obal panela; rozbalenie vlastní každý accordion. Tieto lokálne zmeny nerenderujú App ani susedný Canvas. Zmena parametra scény renderer zámerne aktualizuje; zmena rozmerov plátna pri zbalení môže vyvolať resize a vykreslenie snímky.

Neaktívne sekcie zostávajú namontované a skryté, čím sa zachovajú referencie súborových vstupov aj rozbalené nastavenia. Hlavné prepínače sú mimo zbalených detailov; SDF detaily vyžadujú zapnutú vrstvu, LiDAR zachováva podmienky PLY. Pri šírke ≤768 px drawer uzamyká Tab/Shift+Tab, označí súrodencov scény ako inert, spracuje Escape a obnoví fokus. Zdieľanie/pomoc najprv zatvoria drawer a až potom otvoria externý dialóg. Menný priestor `navigation` pokrýva SK/EN/FR/DE. Protokoly workerov, geometrické algoritmy a závislosti sa nemenia.

---

## 📑 Obsah
1. [Systémová architektúra a Dual-Engine koncept](#1-systémová-architektúra-a-dual-engine-koncept)
2. [Matematický aparát a geodetické transformácie](#2-matematický-aparát-a-geodetické-transformácie)
3. [Algoritmy rekonštrukcie stien a Signed Distance Fields (Splay SDF)](#3-algoritmy-rekonštrukcie-stien-a-signed-distance-fields-splay-sdf)
4. [Výpočet štruktúrnej geológie a tektoniky (Dip & Strike)](#4-výpočet-štruktúrnej-geológie-a-tektoniky-dip--strike)
5. [Kamerové projekcie a algoritmus Zoom-to-Fit](#5-kamerové-projekcie-a-algoritmus-zoom-to-fit)
6. [Post-processing shadery (Eye-Dome Lighting)](#6-post-processing-shadery-eye-dome-lighting)
7. [Paralelné Web Workery a prenos dát (ArrayBuffers)](#7-paralelné-web-workery-a-prenos-dát-arraybuffers)
8. [URL schéma a stavová hydratácia](#8-url-schéma-a-stavová-hydratácia)
9. [Stitch CAD dizajnový systém a CSS tokeny](#9-stitch-cad-dizajnový-systém-a-css-tokeny)
10. [Optimalizácia výkonu, React Render Decoupling a WebGL Render Loop](#10-optimalizácia-výkonu-react-render-decoupling-a-webgl-render-loop)

---

## 1. Systémová architektúra a Dual-Engine koncept

Aplikácia je postavená na báze **React 18**, **Three.js** a **React-Three-Fiber** a využíva prísne oddelenú **Dual-Engine** architektúru:

```
                          ┌─────────────────────────────┐
                          │   Vstupný súbor / URL       │
                          │ (.lox, .ply, .3d, .plt, STL)│
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │     parser.worker.ts        │
                          │  (Paralelný Web Worker)     │
                          └──────────────┬──────────────┘
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
         ┌─────────────────────────────┐   ┌─────────────────────────────┐
         │     ENGINE v1 (Standard)    │   │     ENGINE v2 (NextGen)     │
         │  src/v1/CaveViewer3D.tsx    │   │ src/v2/CaveViewerNextGen.tsx│
         ├─────────────────────────────┤   ├─────────────────────────────┤
         │ • LOX, 3D, PLT, STL siete   │   │ • Masívne PLY LiDAR mračná  │
         │ • Therion Scraps polygóny   │   │ • Octree LOD partitioning   │
         │ • Splay SDF Marching Cubes  │   │ • WebGL EDL & point shaders │
         │ • Three.js Mesh pipeline    │   │ • 60 FPS pre > 10M bodov    │
         └──────────────┬──────────────┘   └──────────────┬──────────────┘
                        │                                 │
                        └────────────────┬────────────────┘
                                         ▼
                          ┌─────────────────────────────┐
                          │    Spoločné UI a Analýzy    │
                          │   (Meranie, Rezy, HUD)      │
                          └─────────────────────────────┘
```

### Princíp delenia:
* **Engine v1 (`src/v1/`)**: Zameraný na speleologické vektorové dáta, polygonálne ťahy, ručne kreslené steny (scraps) a parametrické SDF siete.
* **Engine v2 (`src/v2/`)**: Špecializovaný na mračná bodov (LiDAR), kde je kľúčový Octree streaming (`pointcloud.worker.ts`) a GPU post-processing (Eye-Dome Lighting).
* **Shared Layer (`src/shared/`)**: Zdieľané dátové typy (`@shared/types`), matematické knižnice (`tectonics.ts`, `surfaceReconstruction.ts`), lokalizácie (`i18n`) a komponenty používateľského rozhrania (`MeasurementPanel`, `CompassRose`, `FloatingClippingSlider`).

### 1.2 Prepínanie motorov a izolácia LiDAR dát (`isPlyLidarData`)
Aby nedochádzalo k miešaniu logiky Engine v1 a v2, aplikácia používa striktnú klasifikáciu:
- `isPlyLidarData(ext, cave)`: Vyhodnocuje sa ako `true` výhradne pre súbory `.ply` alebo explicitné mračná bodov (`isLiDAR: true` bez polygónových segmentov).
- **Parser Survey dát (`caveParser.ts`)**: Pre bežné súbory (`.lox`, `.3d`, `.plt`) nastavuje `pointCount: 0`. Stanice sa neinterpretujú ako body mračna.
- **UI Guarding**: Prepínač motora `LiDAR NEXTGEN`, panel `LiDAR editácia`, karta `LiDAR detektor komínov` a prekryvná vrstva štetca sa renderujú iba ak `isPlyLidar === true`.
- **Failsafe**: Pri načítaní non-PLY súborov sa motor vždy automaticky resetuje na `v1` (aj v prípade prítomnosti URL parametra `?eng=v2`).

---

## 2. Matematický aparát a geodetické transformácie

### 2.1 Eliminácia numerickej chyby plávajúcej rádovej bodky (Centroid Subtraction)
Súradnice v kartografických systémoch (napr. S-JTSK) dosahujú hodnoty okolo $X \approx -500\,000\ \text{m}$, $Y \approx -1\,200\,000\ \text{m}$. Grafické karty (GPU) počítajú v 32-bitovej plávajúcej rádovej bodke (`float32`), kde má mantisa presnosť iba 24 bitov (~7 dekadických číslic). Použitie globálnych súradníc priamo v shaderoch spôsobuje trasenie (jittering) geometrie.

**Riešenie**:
V parseri sa vypočíta ťažisko modelu $P_{\text{offset}} = (x_0, y_0, z_0)$ v 64-bitovej presnosti (`float64`). Všetky vrcholy sú do GPU posielané v lokálnych súradniciach:
$$P_{\text{local}} = P_{\text{world}} - P_{\text{offset}}$$
Globálne súradnice sa spätne dopočítavajú iba pri zobrazení hodnôt v UI kartách a meracích paneloch.

### 2.2 Transformácia súradníc S-JTSK (EPSG:5514) $\leftrightarrow$ WGS-84 (EPSG:4326) $\leftrightarrow$ UTM
Pre transformáciu rastrov a vektorov sa využíva knižnica `proj4` s definíciou Křovákovho konformného kužeľového zobrazenia:
```ts
const S_JTSK = "+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";
```

---

## 3. Algoritmy rekonštrukcie stien a Signed Distance Fields (Splay SDF)

Moduly `splayWall.worker.ts` a `splayMath.ts` transformujú zamerané splay lúče do objemového skalárneho poľa vzdialeností (SDF) a následne generujú polygónovú sieť pomocou algoritmu **Marching Cubes**.

### 3.1 Vzdialenosť bodu od 3D úsečky (Capsule SDF)
Pre každý bod v priestore $P \in \mathbb{R}^3$ a úsečku definovanú stanicou $A$ a koncom lúča $B$:
$$h = \text{clamp}\left(\frac{(P - A) \cdot (B - A)}{\|B - A\|^2},\ 0,\ 1\right)$$
Vzdialenosť k úsečke je definovaná ako:
$$d(P, A, B, r) = \|P - (A + h(B - A))\| - r$$
kde $r$ je polomer virtuálnej kapsule (`splayCapsuleRadius`).

### 3.2 Hladké zlučovanie telies (Polynomial Smooth-Min)
Jednotlivé kapsuly sa nezlučujú ostrou binárnou operáciou $\min(d_1, d_2)$, ale polynomickým vyhladením s parametrom $k = \text{splaySmoothK}$:
$$h = \max(k - |d_1 - d_2|,\ 0) / k$$
$$\text{smin}(d_1, d_2, k) = \min(d_1, d_2) - \frac{h^2 \cdot k}{4}$$

### 3.3 Bisektorová deliaca rovina (Bisector Normal Plane)
Aby sa zabránilo kolíziám lúčov medzi susednými stanicami $A$ a $B$, je v strede spojnice $M = \frac{A + B}{2}$ definovaná deliaca normálová rovina so smerovým vektorom $\vec{u} = \frac{B - A}{\|B - A\|}$. Splay body zo stanice $A$ sú orezané podmienkou $\vec{u} \cdot (P - M) \le 0$.

### 3.4 Optimalizovaný Narrow-Band Splatting, 1D polpriestorové orezávanie a trilineárne normály (v2.5.12)
Namiesto hrubého vyhodnocovania všetkých štvorstenov a kapsúl v každom voxeli mriežky ($O(V \times (T + C))$) implementuje `splayWall.worker.ts` algoritmus **Narrow-Band Bounding-Box Splatting** ($O(V_{\text{active}})$):
1. **Úzke pásmo (Narrow-Band Padding)**: Každé teleso (štvorsten alebo kapsula) sa vpisuje iba do voxelov svojho AABB rozšíreného o polomer aktívneho pásma:
   $$\text{bandPad} = \max(0, \text{isovalue}) + k + 1{,}85 \cdot \Delta v$$
   Pre každý voxel s aktuálnou hodnotou $\text{cur}$ platí prah vplyvu $\text{cullDist} = \min(\text{bandPad},\ \text{cur} + k)$, pretože pre $d \ge \text{cur} + k$ platí $\text{smin}(\text{cur}, d, k) \equiv \text{cur}$.
2. **Predpočítané polpriestory štvorstena a 1D Scanline Clipping (`precomputeTetrahedrons`)**:
   Každá zo 4 stien štvorstena $i \in \{0,1,2,3\}$ má predpočítanú vonkajšiu jednotkovú normálu $\vec{n}_i$ a posun $d_i$. Pozdĺž riadku v osi $X$ je orientovaná vzdialenosť lineárnou funkciou $s_i(x) = b_i + x \cdot m_i$, kde $m_i = n_{ix} \cdot \Delta v$. Pred vstupom do slučky $X$ sa interval $[x_{\text{start}}, x_{\text{end}}]$ analyticky oreže nerovnosťami $b_i + x \cdot m_i \le \text{bandPad}$.
3. **$O(1)$ vnútorná SDF konvexného štvorstena**:
   Ak $\max(s_0, s_1, s_2, s_3) \le 0$, bod leží vo vnútri konvexného štvorstena a jeho presná znamienková vzdialenosť k hranici je priamo:
   $$\text{SDF}_{\text{in}}(P) = \max(s_0, s_1, s_2, s_3)$$
   bez výpočtu vzdialenosti k trojuholníkom a bez volania `Math.sqrt`. Pre vonkajšie body ($\max_i s_i > 0$) sa testujú iba privrátené steny ($s_i > 0$) cez bezalokačnú skalárnu funkciu `pointToTriangleDistSqScalar`.
4. **Analytický trilineárny gradient v Surface Nets (`extractSurfaceNets`)**:
   Normály vrcholov siete sa počítajú v $O(1)$ priamo z 8 rohov aktívnej bunky $(c_{000} \dots c_{111})$ na lokálnych sub-voxelových súradniciach $(u, v, w) \in [0, 1]^3$ trilineárnou interpoláciou parciálnych derivácií $(\partial f / \partial x, \partial f / \partial y, \partial f / \partial z)$, čím odpadá 6 globálnych volaní `evaluateSDF` na každý vrchol.

### 3.5 Detekcia a vizualizácia hrany rezu (BVH Shapecast & ClippingEdges, v2.5.13)
Pre vizualizáciu rezu stien jaskyne na červeno (`colorClippingEdges = "#ff4444"`) sa využíva priestorový strom `three-mesh-bvh`:
1. **Inicializácia BVH stromu**:
   Pri vytvorení `THREE.BufferGeometry` v `createSplayBufferGeometry` sa vyvolá `geo.computeBoundsTree()`.
2. **Prienik trojuholníka s rovinou rezu**:
   Pre každú rovinu rezu $\pi = (\vec{n}, d)$ strom prechádza bunky metódou `shapecast(intersectsBounds, intersectsTriangle)`. Ak trojuholník pretína rovinu, body prieniku úsečky sa interpolujú:
   $$t = \frac{|d_i|}{|d_i| + |d_{i+1}|},\quad P = P_i + t(P_{i+1} - P_i)$$
3. **Viacrovinové filtrovanie (Multi-Plane Culling)**:
   Pri súčasnej aktivácii horizontálneho a profilového rezu sa overuje viditeľnosť oboch koncov úsečky voči všetkým ostatným aktívnym rovinám ($\pi_j \cdot P_k + d_j \ge -10^{-4}$); odrezané segmenty sú eliminované.

### 3.6 Hypsometrické farbenie Splay SDF stien (`splayAltitude`, v2.5.14)
1. **Normalizácia výšky a výpočet farby vo vertex bufferi**:
   Pri extrakcii geometrie v `createSplayBufferGeometry` sa pre každý vrchol $i$ s vertikálnou súradnicou $y_i$ (os $Y$ v Three.js zodpovedá nadmorskej výške $Z$ v jaskynnom rámci) vypočíta normalizovaná hodnota $t \in [0, 1]$ a RGB farba:
   $$t = \text{clamp}\left(\frac{y_i - Z_{\min}}{Z_{\max} - Z_{\min}},\ 0,\ 1\right),\quad C_i = \text{elevColor}(t)$$
   Tieto farby sú trvalo uložené v `THREE.BufferAttribute(colors, 3)` pod názvom `color`.
2. **Okamžité prepínanie shaderu (0 ms)**:
   Prepínač `splayAltitude` riadi vlastnosti materiálu `vertexColors: boolean` a `color: Color`. Keďže farby sú už predpočítané v GPU pamäti, prepnutie nevyžaduje opätovný beh workera a prebehne v jedinom vykresľovacom cykle.

### 3.7 Webová kvalita, WCAG 2.2 a SEO optimalizácia (v2.5.15)
1. **WCAG 2.2 AA kontrast a strom prístupnosti**:
   - Všetky uzly pre výber súborov `<input type="file">` v `App.tsx`, `ProjectSection.tsx` a `SurfaceSection.tsx` obsahujú explicitný atribút `aria-label` mapovaný cez lokalizačnú funkciu `t()`, čím sa odstraňujú neoznačené prvky v strome prístupnosti.
   - Textové prvky spĺňajú podmienku kontrastu $C = \frac{L_1 + 0{,}05}{L_2 + 0{,}05} \ge 4{,}5:1$ (úprava odznakov `.changelog-badge`, kategórií `.changelog-group` a pätičkového odkazu `/privacy.html`).
2. **Optimalizácia prenosu fontov a CSS render-blocking**:
   - Nahradenie neohraničených variabilných osí Google Fontu Material Symbols (`opsz,wght,FILL,GRAD@...`) fixným formátom s `&display=swap` (`@24,400,0,0&display=swap`) znížilo binárny súbor z **3 912 KiB na 323 KiB (92% úspora)**.
   - Odstránenie meta značiek zakazujúcich vyrovnávaciu pamäť (`http-equiv="Cache-Control"`) z `index.html` v prospech správneho riadenia HTTP hlavičiek na serveri.
3. **Plné pokrytie vyhľadávacích a AI crawlerov**:
   - Statické súbory `robots.txt`, `sitemap.xml` a `llms.txt` v priečinku `public/` eliminujú nežiaduci SPA fallback a zabezpečujú 100% SEO indexovateľnosť a interoperabilitu s AI agentmi.

---

## 4. Výpočet štruktúrnej geológie a tektoniky (Dip & Strike)

Modul `src/shared/utils/tectonics.ts` počíta orientáciu geologických rovín z 3 bodov $P_1, P_2, P_3 \in \mathbb{R}^3$:

### 4.1 Výpočet normály roviny
$$\vec{v}_1 = P_2 - P_1,\quad \vec{v}_2 = P_3 - P_1$$
$$\vec{N} = \vec{v}_1 \times \vec{v}_2 = (N_x, N_y, N_z)$$
Jednotková normála:
$$\vec{n} = \frac{\vec{N}}{\|\vec{N}\|}$$
Orientáciu normalizujeme tak, aby smerovala nahor ($n_z \ge 0$). V prípade $n_z < 0$ invertujeme $\vec{n} \leftarrow -\vec{n}$.

### 4.2 Uhol sklonu roviny (Dip $\theta$)
Uhol medzi rovinou a horizontálou:
$$\theta = \arccos(|n_z|) \times \frac{180^\circ}{\pi}$$

### 4.3 Smer spádnice (Dip Direction $\alpha$)
Azimut najstrmšieho poklesu vrstvy:
$$\alpha = \left(\text{atan2}(n_x,\ n_y) \times \frac{180^\circ}{\pi} + 360^\circ\right) \bmod 360^\circ$$

### 4.4 Smer vrstvy (Strike $\beta$)
Smerová priamka kolmá na spádnicu (podľa pravidla pravej ruky):
$$\beta = (\alpha + 90^\circ) \bmod 360^\circ$$

---

## 5. Kamerové projekcie a algoritmus Zoom-to-Fit

Funkcia `calculateFitParams` v `ProjectionController.tsx` zabezpečuje presné vyplnenie obrazovky (~85% viewportu) pre oba režimy kamery:

### 5.1 Perspektívna kamera
Pre ohraničujúcu guľu modelu s polomerom $R$ a zorný uhol $\text{FOV}$:
$$d_{\text{target}} = \frac{R}{\sin(\text{FOV} / 2)} \times 1.15$$

### 5.2 Ortogonálna kamera
Pre ortogonálnu kameru sa zoom faktor vypočíta z rozmerov plátna $W, H$:
$$\text{zoom}_{\text{ortho}} = \frac{\min(W, H)}{2 \cdot R \cdot 1.15}$$

---

## 6. Post-processing shadery (Eye-Dome Lighting)

### 6.1 Eye-Dome Lighting (EDL) Shader
EDL je screen-space tieňovací algoritmus pre bodové mračná. Vypočítava hĺbkový gradient $F(u, v)$ z 4 susedných pixelov v tvare kríža vo vzdialenosti $d$:
$$F(u, v) = \sum_{i=1}^4 \max\left(0,\ \ln(z(u, v)) - \ln(z(u + \delta x_i,\ v + \delta y_i))\right)$$
Výsledná intenzita pixelu:
$$I = I_0 \cdot \exp(-F(u, v) \cdot k_{\text{exp}})$$
kde $k_{\text{exp}}$ je parameter plasticity.

---

## 7. Paralelné Web Workery a prenos dát (ArrayBuffers)

Všetky výpočtovo náročné operácie bežia mimo hlavného UI vlákna:
* `parser.worker.ts`: Parsovanie binárnych súborov `.lox`, `.ply`, `.stl`.
* `pointcloud.worker.ts`: Tvorba Octree priestorových stromov a LOD streaming.
* `splayWall.worker.ts`: Generovanie 3D sietí zo splayov cez Marching Cubes.
* `lidarPlanMap.worker.ts`: 2D rastrové projekcie a hustotné mapy.

### Zero-Copy Transferable Objects:
Dáta medzi vláknami neprechádzajú pomalou JSON serializáciou, ale priamym odovzdaním vlastníctva pamäte:
```ts
self.postMessage({
  type: 'SPLAY_WALL_READY',
  positions: positionsArray.buffer,
  normals: normalsArray.buffer,
  colors: colorsArray.buffer
}, [positionsArray.buffer, normalsArray.buffer, colorsArray.buffer]);
```

---

## 8. URL schéma a stavová hydratácia

Stav aplikácie je plne serializovaný v reťazci URL parametrov:

| Parameter | Dátový typ | Popis |
| :--- | :--- | :--- |
| `model` | `string` (URL) | Priamy odkaz na načítavaný 3D súbor. |
| `embed` | `boolean` (`1`/`0`) | Aktivuje čistý iframe režim bez vonkajších líšt. |
| `proj` | `orthographic` / `perspective` | Nastavenie typu kamerovej projekcie. |
| `theme` | `precision` / `dark` / `light` | Farebná téma scény a materiálov. |
| `sdf` | `boolean` (`1`/`0`) | Aktivácia Splay SDF stien. |
| `smin` | `number` (napr. `0.12`) | Vyhladzovací parameter SDF stien. |
| `srad` | `number` (napr. `0.14`) | Polomer kapsuly okolo splayov. |
| `scraps` | `boolean` (`1`/`0`) | Zobrazenie Therion ručných stien. |
| `terrain` | `none` / `shaded` / `satellite` | Režim povrchového terénu. |
| `alt` | `abs` / `rel` | Absolútny vs. relatívny výškový systém. |
| `clip` | `number` | Vertikálna rovina Z-rezu. |

---

## 9. Stitch CAD dizajnový systém a CSS tokeny

Vo verziách 2.4.22 až 2.4.25 bol integrovaný a kalibrovaný dizajnový systém **Precision Speleology & 3D Geospatial Engine** odvodený zo špecifikácie Google Stitch (`DESIGN.md`):

* **CSS premenné (`:root` a `.theme-light`):**
  * Základňa: `--cv-bg: #0b0f17` (Deep Abyss) / `--cv-bg: #f7f3eb` (Fieldwork Sand).
  * Kontajnery a karty: `--cv-surface-card: #1c2028`, `--cv-surface-high: #262a33`, `--cv-surface-low: #141820` (v `.theme-light`: nízka elevácia `#f2ece2`, vyššia `#e8ded0`).
  * Primárny akcent: `--cv-primary: #00d2ff` (Electric Cyan) / `--cv-primary: #0284c7` (Fieldwork Blue).
  * Sekundárny akcent: `--cv-secondary: #10b981` (Subterranean Emerald) / `#059669`.
  * Písmo: `--cv-font-sans: 'Inter'` pre UI, `--cv-font-mono: 'JetBrains Mono'` s `font-variant-numeric: tabular-nums` pre súradnice a telemetriu.
* **Three.js sRGB Color Space a gradienty pozadia (v2.4.24 - v2.4.25):**
  * Téma `precision` využíva technický modrý vertikálny gradient: zhora tmavšia nočná modrá (`#103258`) prechádzajúca do svetlejšej technickej modrej (`#1d5b9b`).
  * Téma `light` využíva vertikálny pieskový gradient zhora nadol: svetlá slonovinová piesková (`#f7f3eb`) prechádzajúca do tmavšej vápencovej pieskovej (`#d5c4ad`).
* **Oprava mapového zdroja Freemap a detekcia placeholderov (v2.4.26):**
  * Zastaraný endpoint `tiles.freemap.sk/o/{z}/{x}/{y}.jpg` (vracajúci 1843-bajtový PNG s textom "no map data") bol nahradený za oficiálny produkčný `https://ortofoto.tiles.freemap.sk/{z}/{x}/{y}.jpg`.
  * Konfigurácie v `public/map-proxy.php` a `vite.config.ts` boli aktualizované na `ortofoto.tiles.freemap.sk`.
  * `XyzTileDownloader.ts` obsahuje explicitnú validáciu dlaždíc proti 1843-bajtovým placeholderom: pri ich detekcii odmietne dlaždicu ako chybnú a automaticky prepne na proxy fallback.
  * Inkrementovaná verzia cache kľúčov v `tileCache.ts` na `KEY_VERSION = 'v2'`, čo zabezpečilo okamžitú invalidáciu chybných "no map data" dlaždíc u všetkých používateľov.
* **Oprava prepínania a layoutu bočného panelu (v2.4.25):**
  * Kontajner `.canvas-wrap` má explicitne definovaný `min-width: 0`, čo umožňuje CSS flexboxu korektne zmenšiť šírku 3D plátna pri opätovnom vysunutí bočného panelu (`.sidebar-container`), namiesto jeho vytlačenia mimo viditeľnú plochu obrazovky.
  * Pridané plávajúce tlačidlo `.sidebar-reopen-tab` pre okamžité znovuotvorenie panela priamo z pravého horného rohu 3D scény.
  * Mobilná lišta nastavení je obmedzená cez `@media (max-width: 768px)` a `.mobile-drawer-header`, čím je zamedzené jej nechcené zobrazovanie na desktopových rozlíšeniach.
* **Exkluzivita LiDAR ovládačov pre PLY formát (v2.4.24):**
  * Prepínač motora `LiDAR NEXTGEN` (Engine v2) a súvisiace editačné panely sa podmienečne vykresľujú iba pri prítomnosti skutočných mračien bodov (`isPointcloud && isPlyFormat`).
  * `caveParser.ts` v `buildResult` zachováva meračským polygónovým súborom (`.lox`, `.3d`, `.plt`) reálny počet `pointCount = 0`, čím eliminuje nesprávne zapnutie LiDAR rozhrania.
* **Architektúra bočného panelu a hierarchia kariet:**
  * **`.sidebar-pinned-header`**: Trvalo ukotvený blok (`position: sticky; top: 0; z-index: 50; flex-shrink: 0`) obsahujúci súhrnné dáta datasetu (`.sidebar-stat-card`) a navigačné prepínače záložiek (`.sidebar-tab-bar`), čím je zaručené, že navigačný kontext neodroluje pri posune ovládačov.
  * **`.cad-card`**: Primárne modulárne kontajnery pre logické celky (orez, meračská sieť, Splay SDF, povrchy, tektonika).
  * **`.cad-subcard`**: Sekundárne vložené informačné boxy adaptujúce sa cez CSS premenné (`background: var(--cv-surface-low)`), nahrádzajúce staré hardcoded tmavé bloky (`#0f172a`, `bg-slate-800`).
  * **`.cad-slider`, `.cad-tool-btn`, `.btn-mini`, `.cad-select`**: Štandardizované interaktívne prvky s vysokokontrastnou odozvou pre oba motívy.
* **Prepínače a komponenty:**
  * Kompaktné CAD prepínače `.switch` s akcentom `box-shadow: 0 0 8px rgba(0,210,255,0.35)`.
  * Dynamická väzba šablón na kontajner `.viewer-shell.theme-{currentTheme}`.

---

## 10. Optimalizácia výkonu, React Render Decoupling a WebGL Render Loop

Vo verzii **v2.4.27** bola zrealizovaná komplexná výkonnostná stabilizácia a optimalizácia jadra aplikácie (sub-16ms latencia, 60 FPS odozva pri interakcii a nulové vyťaženie CPU/GPU pri nečinnosti):

### 1. Riešenie priehľadnosti povrchov a stien pri rotácii kamery:
- V komponentoch `CaveViewer3D` (`TerrainMesh`), `Scraps` a `SplayCaveWalls` bolo odstránené dynamické prepínanie priehľadnosti na hodnotu `1.0` pri pohybe kamery (`isMoving` / `!isFullyIdle`). Priehľadnosť zadaná používateľom ostáva stála bez nežiaduceho preblikávania do plnej farby.
- `TerrainTile` vylúčil `props.isMoving` z výpočtu `terrainSubsample`. Tým sa eliminoval synchrónny prepočet geometrie a prestavba BVH stromu na hlavnom vlákne pri štarte a zastavení rotácie.
- `props.opacity` bolo vyňaté z poľa závislostí `useMemo` shaderového materiálu `contourMat`, čím sa predišlo rekompilácii GLSL shaderov počas animácie; `depthWrite` je nastavené dynamicky na `props.opacity === 1`.

### 2. Eliminácia 10Hz re-render kaskády v `App.tsx`:
- `CameraMonitor` v `CaveViewer3D` a `CaveViewerNextGen` aktualizuje stav `cameraData` v rodičovskom komponente len vtedy, keď sa zmenil horizontálny azimut o viac ako $1^\circ$, nastala zmena kategórie vrstevníc `distBucket` alebo translácia pozície prekročila $0.25\ \text{m}^2$ (s časovým throttlom 150 ms). Tým sa zabránilo re-renderovaniu 6500-riadkového stromu `App.tsx` 10-krát za sekundu počas rotácie scény.
- Nekonečný animačný cyklus `requestAnimationFrame` častíc na úvodnom plátne (`bg-canvas`) je automaticky zastavený v režime 3D prehliadača (`appState === 'viewer'`).

### 3. Stabilizácia referencií props (React.memo):
- Spätné volania `onProcessingEnd`, `onTextureReady`, `onSurfaceOffsetChange` a objekt `manualConnection` boli memoizované cez `useCallback` a `useMemo`, vďaka čomu manipulácia s bočným panelom, posuvníkmi a kartami nespúšťa zbytočné re-rendery komponentov `<CaveViewer3D>` a `<CaveViewerNextGen>`.

### 4. Zlúčenie geometrie v `Scraps.tsx` (50 % úspora):
- Namiesto separátneho generovania `currentSolid` a `currentAlt` (ktoré 2× spúšťalo `mergeVertices`, `applyTaubinSmoothing`, výpočet normál a BVH strom) sa generuje jediná `BufferGeometry` s atribútom `color`. Tri Three.js materiály bez `vertexColors` atribút farby automaticky ignorujú.

### 5. Zero-Copy Worker I/O & VRAM Lifecycle Management:
- `parser.worker.ts` odovzdáva buffery `surf.dtm.data.buffer` a `surf.bitmapData.buffer` cez `Transferable` zoznam v `self.postMessage()`.
- Odstránené redundantné klonovania `buf.slice(0)` v `App.tsx`.
- Komponenty `CaveLegs`, `PointCloud`, `OrganicShell`, `TerrainMesh` a `Scraps` dôsledne volajú `dispose()` na všetkých geometriách, textúrach a BVH stromoch (`disposeBoundsTree`) pri odmontovaní a zmene parametrov.

### 6. Okamžitý on-demand prechod:
- Timeout nečinnosti (`idleTimeoutRef`) bol skrátený z 1500 ms na 180 ms, čím sa WebGL renderovacia slučka (`frameloop="demand"`) stabilizuje do pasívneho režimu s nulovou spotrebou okamžite po pustení myši.

---

## 11. Priehľadnosť tieňovaného povrchu, 2D obojsmerné vrstevnice a Axonometria (v2.4.28)

### 1. Priehľadnosť tieňovaného povrchu a výškovej siete:
- V `src/App.tsx` bol pridaný vyhradený posuvník pre `opts.surfaceOpacity` pri zapnutom `opts.showSurfaceMesh` alebo `opts.showSurfaceNetwork`.
- V `CaveViewer3D.tsx` (`TerrainTile`) je priehľadnosť prepojená priamo na Three.js materiál: `transparent={props.opacity < 1}`, `opacity={props.opacity}` a `depthWrite={props.opacity === 1}` s korektným polygónovým odsadením (`polygonOffset`).

### 2. Dvojitá 2D detekcia hrán pre kóty vrstevníc (`ContourLabels`):
- Pôvodná hrubá $16 \times 16$ mriežka s testovaním iba horizontálnych hrán bola nahradená jemnejším rastrom $36 \times 36$ s obojsmernou interpoláciou:
  - Horizontálne hrany: $(r, c) \leftrightarrow (r, c+\Delta c)$
  - Vertikálne hrany: $(r, c) \leftrightarrow (r+\Delta r, c)$
- Pre každú hlavnú vrstevnicu $z_{\text{major}}$ sa vypočíta presný priesečník $t = \frac{z_{\text{target}} - z_1}{z_2 - z_1}$.
- Výber bodov je priestorovo riadený minimálnou vzdialenosťou $d_{\min} = \max(30\ \text{m}, \frac{\text{maxDim}}{14})$, čo zaručuje minimálne jednu dobre čitateľnú hodnotu v zornom poli používateľa bez zhlukovania štítkov.

### 3. Podmienené zobrazenie Splay SDF stien:
- Karta *Splay SDF steny (2D/3D)* v `src/App.tsx` sa podmieňuje cez `{cave && splayCount > 0 && (...)}`. Pri modeloch bez pomocných splay lúčov je karta úplne skrytá.

### 4. Jednotné prepínanie splay lúčov a bodov:
- `ViewerOptions.showSplay` riadi súčasne `CaveLegs` (splay úsečky) aj splay bodovú geometriu v `Stations`.
- `showStations` riadi iba bežné stanice polygónového ťahu; vypnutie tejto vrstvy neodpojí splay body od prepínača splay lúčov.

### 5. Trojuholníková sieť a axonometrický režim (`Scraps.tsx`):
- Prepínač *Trojuholník. mesh* (`options.accurateScraps`) bol integrovaný do oboch 3D prehliadačov (`CaveViewer3D` aj `CaveViewerNextGen`):
  - Montáž stien `<Scraps>` je aktívna pri `(o.showScraps || o.accurateScraps || o.scrapsWireframe)`, čo umožňuje samostatné spustenie.
  - V `Scraps.tsx` sa zapína `flatShading={options.accurateScraps || !smooth}` pre ostré fazetové tieňovanie stien.
  - Drôtená sieť `(showWire || options.accurateScraps)` sa vykresľuje v `renderOrder={10}` s farbou `options.colorScrapsWire` a `depthWrite={!showSolid && !showAltitude}` pre autentický speleologický axonometrický vzhľad.
- v2.5.0: `LayersSection.tsx` zobrazuje prepínač *Trojuholník. mesh* iba pri `isPlyLidar`. Pri ostatných modeloch `wireOn = scrapsWireframe || (!isPlyLidar && accurateScraps)` a kliknutie nastaví `{ scrapsWireframe: !wireOn, accurateScraps: false }` (staré URL s `acc=1` zostávajú čitateľné). Prepínače `traverseAltitude` / `scrapsAltitude` sú v slote `primary` accordionu; duplicitná karta *Mierka (Jaskyniar)* odstránená — `placedCaver` nastavuje `StationDetailCard`.

---
## 12. Pamäťové a sieťové optimalizácie (v2.4.30)

- Mapovanie bodov podkladovej mapy na stanice používa `Map<string, StationLabel>`; pri duplicitných názvoch sa zachová prvá stanica ako pri pôvodnom `Array.find()`. Párovanie je O(P + S) namiesto O(P × S).
- Pri odmontovaní `PointCloudLOD` alebo zmene URL sa požiadavka preruší pomocou `AbortController`; pole normál sa vytvorí a pripojí k geometrii iba pri dostupných platných normálach. Zmena referencie `cave.pointNormals` invaliduje memoizovanú geometriu.
- Splay geometria sa ukladá do LRU cache s limitom 256 MiB, počítaným ako súčet `byteLength` polí pozícií, normál a indexov. Čítanie aj zápis obnovujú položku ako najnovšiu; najstaršie sa odstraňujú pri prekročení limitu a nadlimitná geometria sa neuloží.
- Každý pokus o načítanie XYZ dlaždice má 15-sekundový timeout. Po jeho vypršaní `AbortController` zruší požiadavku a downloader skúsi ďalší zdroj; časovač sa vždy vyčistí.

## 13. Odložené načítanie Mapbox terénu (v2.4.31)

- `CaveViewerNextGen` načítava `MapboxTerrain` cez `React.lazy()` a `React.Suspense`; komponent sa importuje len pri splnení podmienky GPS súradníc, zapnutého terénu a dostupného tokenu.
- `three-geo` je izolované v chunke `vendor-mapbox-terrain` za dynamickým importom a nie je vynútene zahrnuté v `optimizeDeps`, takže sa nespracúva pri štarte Vite ani nenačítava do hlavnej produkčnej cesty.
- Nepoužívaná priama závislosť `pdfjs-dist` bola odstránená z manifestu a lockfile.

## 14. Prístupné prepínače a jazyk dokumentu (v2.4.32)

- Ovládacie prvky `.switch` sú `<button type="button" role="switch">` s `aria-checked` a lokalizovaným `aria-label`; natívna aktivácia tlačidla zabezpečuje klávesy Enter a Space bez vlastného `onKeyDown`.
- Efekt v `App.tsx` synchronizuje stav `lang` s `document.documentElement.lang`, aby ho správne oznamovali asistenčné technológie.
- `index.html` poskytuje názov, popis, Open Graph metadáta a lokálny SVG favicon.

## 15. Priamy vertikálny rez a odhalenie v bočnom paneli z lišty (v2.5.1)

- `App.tsx` drží `profilePicking`. `startProfilePick()` zapne `showProfileClipping`, vymaže `activeProfilePoints` a využije `measurementMode = 'distance'` (rovnaký snap aj A/B overlay). Efekt prevezme prvé dva `selectedStations` do `activeProfilePoints` a ukončí meranie. `setProfileClipping(on)` obnoví existujúcu líniu alebo spustí výber, ak žiadna nie je. Rovina rezu ostáva $\mathbf{n} = \widehat{(p_2 - p_1) \times \hat{y}}$, $d = -\mathbf{n}\cdot p_1 - \text{offset}$ v oboch enginoch.
- `NavigationSidebar/reveal.ts` posiela udalosť `cv-nav-reveal` s `{ category, target }`. Nástroje `ViewerToolbar` majú `reveal={[kategória, cieľ]}`; `NavigationSidebar` lokálne prepne kategóriu, na desktope sa rozbalí (mobilný drawer ostáva zatvorený) a zvýrazní `[data-nav-target]` (najbližší `.toggle-row`) triedou `.nav-reveal`. `SidebarAccordion` má prop `navTarget`.
- Posúva sa iba `.nav-panel-content` (`scrollBy`), nie `scrollIntoView`: posun nadradených kontajnerov menil veľkosť R3F plátna a refit v2 posúval cieľ kamery počas animácie pohľadu.

---
*LochViewer Developer Team — Dokumentácia je automaticky udržiavaná a synchronizovaná pri každej zmene kódu.*
