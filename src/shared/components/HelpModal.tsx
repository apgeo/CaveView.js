import React, { useState, useMemo } from 'react'
import packageJson from '../../../package.json'

export interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  initialLang?: 'sk' | 'en' | 'fr' | 'de'
}

type TabKey = 'basics' | 'nav' | 'splays' | 'measuring' | 'clipping' | 'lidar' | 'terrain' | 'share'

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  initialLang = 'sk'
}) => {
  const [lang, setLang] = useState<'sk' | 'en'>(initialLang === 'sk' ? 'sk' : 'en')
  const [activeTab, setActiveTab] = useState<TabKey>('basics')
  const [searchQuery, setSearchQuery] = useState('')

  if (!isOpen) return null

  const isSk = lang === 'sk'

  return (
    <div 
      className="share-overlay"
      style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div 
        className="plan-map-dialog"
        style={{ 
          maxWidth: '850px', 
          width: '94vw', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '0',
          overflow: 'hidden',
          background: '#0f172a',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.15)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>📖</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02em' }}>
                {isSk ? 'LochViewer — Používateľská príručka' : 'LochViewer — User Guide'}
              </h2>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {isSk ? `Kompletný sprievodca funkciami a ovládacími prvkami v${packageJson.version} (Stitch CAD Design)` : `Comprehensive guide to tools, shortcuts & workflows v${packageJson.version} (Stitch CAD Design)`}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Language Switcher */}
            <div style={{ display: 'flex', background: 'rgba(30, 41, 59, 0.7)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                onClick={() => setLang('sk')}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: isSk ? '#3b82f6' : 'transparent',
                  color: isSk ? '#fff' : '#94a3b8'
                }}
              >
                🇸🇰 SK
              </button>
              <button
                onClick={() => setLang('en')}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: !isSk ? '#3b82f6' : 'transparent',
                  color: !isSk ? '#fff' : '#94a3b8'
                }}
              >
                🇬🇧 EN
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                borderRadius: '8px',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                transition: 'all 0.15s'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          background: 'rgba(30, 41, 59, 0.4)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '4px 12px',
          gap: '4px'
        }}>
          {[
            { id: 'basics', icon: '📁', labelSk: 'Formáty a Lišta', labelEn: 'Formats & Topbar' },
            { id: 'nav', icon: '🧭', labelSk: 'Navigácia & Skratky', labelEn: 'Navigation & Shortcuts' },
            { id: 'splays', icon: '🕳️', labelSk: 'Splay 3D Steny', labelEn: 'Splay 3D Walls' },
            { id: 'measuring', icon: '📐', labelSk: 'Meranie & Tektonika', labelEn: 'Measuring & Tectonics' },
            { id: 'clipping', icon: '✂️', labelSk: 'Rezy Z-Clip', labelEn: 'Z-Clipping' },
            { id: 'lidar', icon: '☁️', labelSk: 'LiDAR NextGen', labelEn: 'LiDAR NextGen' },
            { id: 'terrain', icon: '🏔️', labelSk: 'Terén & ZBGIS', labelEn: 'Terrain & ZBGIS' },
            { id: 'share', icon: '🔗', labelSk: 'Zdieľanie & Embed', labelEn: 'Share & Embed' },
          ].map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabKey)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: active ? '#3b82f6' : 'transparent',
                  color: active ? '#fff' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s'
                }}
              >
                <span>{tab.icon}</span>
                <span>{isSk ? tab.labelSk : tab.labelEn}</span>
              </button>
            )
          })}
        </div>

        {/* Content Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          color: '#e2e8f0',
          fontSize: '13px',
          lineHeight: '1.6'
        }}>
          {activeTab === 'basics' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>📁 {isSk ? 'Podporované formáty & Spustenie' : 'Supported Formats & Loading'}</h3>
              <p>
                {isSk 
                  ? 'LochViewer spracováva 3D dáta priamo v prehliadači prostredníctvom WebGL a paralelných Web Workerov (100% lokálne a bezpečne bez odosielania na externé servery).'
                  : 'LochViewer parses and renders 3D cave data directly in your browser via WebGL and Web Workers (100% client-side, zero cloud telemetry).'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginTop: '14px' }}>
                {[
                  { ext: '.lox', name: 'Therion / Loch', descSk: '3D polygóny, scraps, splays, DTM a textúry', descEn: '3D centerlines, scraps, splays, DTM and textures' },
                  { ext: '.3d', name: 'Survex', descSk: 'Polygónové ťahy a podzemné stanice', descEn: 'Underground cave traverse surveys' },
                  { ext: '.plt', name: 'Compass', descSk: 'Zamerané traverzy a shoty', descEn: 'Compass cave survey files' },
                  { ext: '.ply', name: 'LiDAR Point Cloud', descSk: 'Milióny bodov, RGB farby, intenzita', descEn: 'Dense point clouds, RGB colors, intensity' },
                  { ext: '.stl', name: '3D Mesh', descSk: 'Triangulované siete z fotogrametrie a skenovania', descEn: 'Triangulated mesh models from 3D scans' },
                  { ext: '.tif/.tfw', name: 'GeoTIFF / DMR5', descSk: 'Digitálny model terénu SR v S-JTSK', descEn: 'Digital elevation models & aerial orthophotos' },
                ].map(f => (
                  <div key={f.ext} style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ background: '#1d4ed8', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>{f.ext}</span>
                      <strong style={{ fontSize: '12px', color: '#f8fafc' }}>{f.name}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{isSk ? f.descSk : f.descEn}</div>
                  </div>
                ))}
              </div>

              <h4 style={{ color: '#38bdf8', marginTop: '20px' }}>🧭 {isSk ? 'Zjednotené menu & CAD Rozhranie' : 'Unified Sidebar & CAD Interface'}</h4>
              <p>
                {isSk 
                  ? 'Ovládanie je rozdelené do 6 prehľadných kategórií s jednotným jantárovo-žltým ladením nadpisov, výraznými dotykovými tlačidlami a informačnými ikonami (ℹ️) pri každej sekcii:'
                  : 'Controls are organized into 6 clean categories with unified amber section titles, prominent tactile action buttons, and contextual documentation icons (ℹ️) on every section:'}
              </p>
              <p>{isSk
                ? '1. Súbor & projekty: import, zdieľanie a exporty vrátane WebM. 2. Pohľad & kamera: projekcia, Fit a rotácia. 3. Jaskyňa & model: polygonálny ťah, splay lúče, 3D steny, Splay SDF rekonštrukcia a stanice. 4. Povrch & terén: tieňovaný reliéf DTM, vrstevnice, sťahovanie DMR 5.0 WCS, WMS vrstvy a kalibrácia. 5. Nástroje & analýza: meranie, horizontálny rez a vertikálny profil. 6. Nastavenia & pomoc: motív, jazyk a návod.'
                : '1. Files & projects: import, sharing and exports including WebM. 2. View & camera: projection, Fit and rotation. 3. Cave & Model: centerline traverse, splay rays, 3D walls, Splay SDF walls and stations. 4. Surface & Terrain: DTM shaded relief, contours, DMR 5.0 WCS download, WMS layers and cave-surface calibration. 5. Tools & analysis: measurement, horizontal clipping and vertical profile. 6. Settings & help: themes, language and manual.'}</p>
              <p>{isSk
                ? 'Pri každom paneli nájdete malé tlačidlo (ℹ️) – po kliknutí sa otvorí vyskakovacie okno s technickým popisom nástroja, kľúčovými parametrami a preklikom do tohto sprievodcu.'
                : 'Every accordion header includes a small (ℹ️) button that reveals an instant contextual guide with key options and direct links to the relevant manual chapter.'}</p>
              <p>{isSk
                ? 'V pravom rohu hornej lišty sa nachádza rýchly prepínač jazyka (SK | EN | DE | FR). Pri prístupe zo Slovenska a Česka je predvolená slovenčina, pre ostatné krajiny angličtina.'
                : 'A dedicated Language Bar (SK | EN | DE | FR) is located in the top-right toolbar corner. Users from Slovakia/Czechia automatically default to Slovak, all other locations default to English.'}</p>
              <p>{isSk
                ? 'Panel zbalíte na ikony a otvoríte výberom kategórie. Na mobile použite menu; Tab/Shift+Tab zostávajú v draweri a Escape ho zatvorí s návratom fokusu. Enter a medzerník ovládajú prepínače aj Podrobnosti.'
                : 'Collapse the sidebar to icons and select a category to reopen it. On mobile, open the menu; Tab/Shift+Tab stay in the drawer and Escape closes it with focus restoration. Enter and Space activate switches and Details.'}</p>
              <p>{isSk
                ? 'Horná lišta: Otvoriť, Reload pôvodných dát, PNG, rotácia, ortogonál/perspektíva, pôdorys, nárys, Fit, vchody, pevné a všetky stanice, cyklické popisy, polygonálny ťah, splay lúče/body, steny, povrch, obraz na povrch, meranie a celá obrazovka. Názov zobrazíte podržaním kurzora; na mobile pás posúvajte vodorovne.'
                : 'Top toolbar: Open, Reload original data, PNG, rotation, projection, plan, elevation, Fit, entrances, fixed/all stations, cycling labels, centerline, splays, walls, surface, surface image, measurement and fullscreen. Hover for names; scroll the strip horizontally on mobile.'}</p>
              <p>{isSk
                ? 'Popisy cyklujú číslo → úplné meno → výška → GPS → vypnuté; GPS sa bez dát preskočí. LOX zachováva mená typu 1@jaskyna aj príznak pevnej stanice. Menu obrazu ponúka miestny súbor, kalibráciu a ZBGIS ortofoto. Reload zahodí úpravy a znovu spracuje uchovaný súbor, nie zmenený súbor na disku.'
                : 'Labels cycle number → full name → elevation → GPS → off, skipping GPS when unavailable. LOX preserves names such as 1@survey and fixed-station flags. The image menu offers a local image, calibration and ZBGIS orthophoto. Reload discards edits and reparses retained bytes, not a changed disk file.'}</p>
              <ul style={{ paddingLeft: '20px', color: '#cbd5e1', fontSize: '12px' }}>
                <li><strong>📷 Export PNG</strong> — {isSk ? 'Snímka vo vysokom rozlíšení so severkou a mierkou' : 'High-res screenshot with compass & scale'}</li>
                <li><strong>🧊/📐 Projekcia (O)</strong> — {isSk ? 'Prepínač Perspektíva ↔ Ortogonálne zobrazenie' : 'Perspective ↔ Orthographic camera toggle'}</li>
                <li><strong>⛶ Zoom to Fit (F)</strong> — {isSk ? 'Vycentrovanie jaskyne do zorného poľa' : 'Recenter and fit model to screen'}</li>
                <li><strong>📈 Centerline (C)</strong> — {isSk ? 'Kostra polygonálneho ťahu a staníc' : 'Survey centerline traverse network'}</li>
                <li><strong>⚡ {isSk ? 'Splay lúče a body' : 'Splay rays & points'}</strong> — {isSk ? 'Spoločne zobrazí alebo skryje pomocné lúče aj ich koncové body' : 'Toggles auxiliary survey rays and their endpoint dots together'}</li>
                <li><strong>🪨 Steny (W)</strong> — {isSk ? 'Plné 3D steny (Scraps, Splay SDF, STL)' : '3D cave wall meshes'}</li>
                <li><strong>🏔️ Terén (T)</strong> — {isSk ? 'Nadložný povrch, DMR tieňovanie a ortofotomapa' : 'Overhead surface terrain & orthophoto'}</li>
                <li><strong>✂️ Z-Clip (Z)</strong> — {isSk ? 'Horizontálny posuvník rezu nadmorskej výšky' : 'Floating horizontal slicing plane'}</li>
                <li><strong>📏 Meranie (M)</strong> — {isSk ? '3-Stavový cyklický merací nástroj' : '3-State measurement & polygon area'}</li>
              </ul>
            </div>
          )}

          {activeTab === 'nav' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>🧭 {isSk ? 'Navigácia & Klávesové skratky' : 'Navigation & Shortcuts'}</h3>
              <p>
                {isSk
                  ? 'LochViewer podporuje plynulú navigáciu myšou, dotykovými gestami aj rýchlymi klávesovými skratkami pre technické mapovanie.'
                  : 'LochViewer supports smooth mouse navigation, touch gestures, and 1-key technical view presets for precision cave mapping.'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '14px' }}>
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>🖱️ {isSk ? 'Ovládanie myšou' : 'Mouse Controls'}</h4>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#cbd5e1' }}>
                    <li><strong>{isSk ? 'Ľavé tlačidlo' : 'Left Click'}</strong>: {isSk ? 'Orbitálna rotácia' : 'Orbit rotate'}</li>
                    <li><strong>{isSk ? 'Pravé tlačidlo' : 'Right Click'}</strong>: {isSk ? 'Posun (Pan)' : 'Pan view'}</li>
                    <li><strong>{isSk ? 'Koliesko' : 'Wheel'}</strong>: {isSk ? 'Plynulý Zoom' : 'Smooth Zoom'}</li>
                    <li><strong>{isSk ? 'Dvojklik' : 'Double Click'}</strong>: {isSk ? 'Prelet kamery k bodu' : 'Flight to point'}</li>
                    <li><strong>{isSk ? 'Klik na ružicu' : 'Click Compass'}</strong>: {isSk ? 'Zarovnať na Sever' : 'Snap to North'}</li>
                  </ul>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>⌨️ {isSk ? 'Klávesové skratky' : 'Keyboard Shortcuts'}</h4>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#cbd5e1' }}>
                    <li><kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px', border: '1px solid #475569' }}>1</kbd> — {isSk ? 'Pôdorys (Plan View)' : 'Plan View (Top)'}</li>
                    <li><kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px', border: '1px solid #475569' }}>2</kbd> — {isSk ? 'Pozdĺžny profil (Profile)' : 'Profile View (Front)'}</li>
                    <li><kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px', border: '1px solid #475569' }}>3</kbd> — {isSk ? 'Priečny profil (Section)' : 'Cross Section (Side)'}</li>
                    <li><kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px', border: '1px solid #475569' }}>4</kbd> — {isSk ? '3D Izometria' : '3D Isometric view'}</li>
                    <li>{isSk ? 'Horná lišta: Pôdorys opakovaným klikom prepína zhora ↔ zdola; Nárys postupne z juhu → východu → severu → západu.' : 'Toolbar: repeated Plan clicks toggle above ↔ below; Elevation cycles from south → east → north → west.'}</li>
                    <li>{isSk ? 'Nožnice: kliknite na 2 body v modeli – model sa odreže zvislou rovinou cez túto líniu. Ikony lišty zároveň ukážu príslušné nastavenie v bočnom paneli.' : 'Scissors: click 2 points in the model to cut it with a vertical plane through that line. Toolbar icons also reveal the matching control in the sidebar.'}</li>
                    <li><kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px', border: '1px solid #475569' }}>O</kbd> — {isSk ? 'Ortogonál ↔ Perspektíva' : 'Ortho ↔ Perspective'}</li>
                    <li><kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '3px', border: '1px solid #475569' }}>Ctrl+Z</kbd> — {isSk ? 'Späť v histórii pohľadov' : 'Undo navigation flight'}</li>
                    <li>{isSk ? 'Prepínače: fokus cez Tab, aktivácia klávesom Enter alebo medzerníkom' : 'Switches: focus with Tab; activate with Enter or Space'}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'splays' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>🕳️ {isSk ? 'Splay SDF 3D Steny (Marching Cubes)' : 'Splay SDF 3D Cave Walls'}</h3>
              <p>
                {isSk
                  ? 'Revolučný algoritmus Signed Distance Fields (SDF), ktorý priamo z laserových lúčov (splays) automaticky vypočíta uzavretú, hladkú a nepriepustnú 3D sieť chodieb.'
                  : 'Automated volumetric Signed Distance Field (SDF) and parallel Marching Cubes algorithm reconstructing watertight 3D passage walls from raw laser splay rays.'}
              </p>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6', marginTop: '12px' }}>
                <strong style={{ color: '#93c5fd' }}>{isSk ? 'Hlavné výhody:' : 'Key Highlights:'}</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '12px' }}>
                  <li><strong>{isSk ? 'Podmienená CAD karta' : 'Conditional CAD Card'}</strong>: {isSk ? 'Vo Vrstvy & dáta iba pri modeloch so splay lúčmi. Zapnite vrstvu a rozbaľte Podrobnosti.' : 'Under Layers & data only for models with splay rays. Enable the layer and open Details.'}</li>
                  <li><strong>{isSk ? 'Hranatosť stien (Sharpness)' : 'Wall Sharpness (Angular)'}</strong>: {isSk ? 'Posuvník 0.02 (ostré hrany chodby) až 0.25 (hladké organické erózne steny).' : 'Slider from 0.02 (sharp technical facets) to 0.25 (smooth rounded erosion walls).'}</li>
                  <li><strong>{isSk ? 'Trojuholník. mesh (Axonometria)' : 'Triangle Mesh (Axonometry)'}</strong>: {isSk ? 'Pri LOX zlúčené s prepínačom Drôtený model (drôtený model alebo axonometria stien); samostatný prepínač iba pre LiDAR PLY, kde mení rekonštrukciu povrchu.' : 'For LOX merged into the Wireframe switch (wire model or wall axonometry); a separate switch appears only for LiDAR PLY, where it changes surface reconstruction.'}</li>
                  <li><strong>{isSk ? 'Bisektorová rovina' : 'Bisector Normal Plane'}</strong>: {isSk ? 'Zamedzuje prekrývaniu a kolíziám lúčov medzi susednými stanicami.' : 'Eliminates overlapping cone artifacts between adjacent stations.'}</li>
                  <li><strong>{isSk ? 'Rýchly Narrow-Band Splatting (~75× zrýchlenie)' : 'Fast Narrow-Band Splatting (~75x Speedup)'}</strong>: {isSk ? 'Vpisovanie predpočítaných štvorstenov s 1D polpriestorovým orezávaním a trilineárnymi normálami v Surface Nets vygeneruje 3D steny v zlomku sekundy.' : 'Precomputed half-space tetrahedron splatting with 1D scanline clipping and O(1) trilinear Surface Nets normals generates 3D walls in sub-second time.'}</li>
                  <li><strong>{isSk ? 'Červená hrana rezu (Clipping)' : 'Red Cut Edge (Clipping)'}</strong>: {isSk ? 'Pri horizontálnom aj profilovom reze sa na stene SDF modelu v reálnom čase vykresľuje zreteľná červená čiara rezu.' : 'Real-time red cross-section outline displayed across SDF walls during horizontal and profile clipping.'}</li>
                  <li><strong>{isSk ? 'Pamäťová Cache' : 'Session Cache'}</strong>: {isSk ? 'Vygenerovaná sieť sa ukladá do pamäte s limitom 256 MiB; najstaršie modely sa pri prekročení limitu automaticky uvoľnia.' : 'Generated geometry is cached up to 256 MiB; least-recently-used models are released when the limit is reached.'}</li>
                  <li><strong>{isSk ? 'Farbenie podľa výšky (Predvolené)' : 'Color by Height (Default)'}</strong>: {isSk ? 'Plná podpora hypsometrickej škály pre SDF steny; prepínač je predvolene zapnutý a zobrazený priamo v paneli Splay SDF steny.' : 'Full hypsometric elevation gradient for SDF walls; enabled and visible by default directly within the Splay SDF panel.'}</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'measuring' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>📐 {isSk ? 'Meranie & Štruktúrna geológia' : 'Measurement & Structural Geology'}</h3>
              <p>
                {isSk
                  ? 'Pravítkom v hornej lište alebo vo Nástroje & analýza → Meranie otvoríte panel. Mimo merania kliknutie otvorí kartu stanice s menom, X/Y, výškou, dostupnými GPS, deniveláciou od vchodu (± hodnota), najkratšou 3D vzdialenosťou k povrchu (minimálna hrúbka masívu, výrazná jantárová čiara, GPS povrchu a priame prekliky na Google Maps a ZBGIS LiDAR s presným identifikačným bodom) a vertikálnou hĺbkou DTM (kolmo hore, modrá čiara); v 3D scéne sa zobrazia terče a kóty mierky. Chýbajúce dáta sa neodhadujú.'
                  : 'Use the top-toolbar ruler or Tools & analysis → Measurement. Outside measurement, a click opens station details: name, X/Y, height, available GPS, denivelation from entrance (± value), shortest 3D distance to surface (minimum rock cover, prominent amber line, surface GPS with one-click links to Google Maps & ZBGIS LiDAR with exact point identification pin), and vertical DTM depth (straight up, blue dashed line); in the 3D scene, target rings and scale badges are displayed. Missing data is not estimated.'}
              </p>
              <p>{isSk
                ? 'Stanice a zapnuté splay body sa prichytávajú do 10 px. Body A/B aj čiara zostanú na modeli; ďalší klik presunie B. Vymeniť A/B obráti smer, Odobrať posledný bod vráti výber, Nové meranie ho vyčistí a Escape meranie ukončí. Ťahanie len otáča, začatie merania zastaví automatickú rotáciu.'
                : 'Stations and enabled splay endpoints snap within 10 px. A/B markers and the line remain on the model; the next click replaces B. Swap A/B reverses direction, Remove last point undoes a pick, New measurement clears it and Escape exits. Dragging only orbits; starting measurement stops automatic rotation.'}</p>
              <p>{isSk
                ? 'Plochu zadávajte po obvode bez kríženia: výpočet zahŕňa všetky vrcholy. Pri nerovinnom obvode ide o projekčnú plochu; orientáciu určuje prvá trojica. Výška nereferencovaného LiDAR je Z zo súboru, nie zaručená nadmorská výška.'
                : 'Pick polygon boundaries in order without crossings: area uses all vertices. Non-planar boundaries produce projected areas; orientation uses the first three points. Unreferenced LiDAR height is source Z, not a guaranteed sea-level elevation.'}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 6px 0', color: '#a5b4fc' }}>📏 {isSk ? 'Vzdialenosť (2 Body)' : 'Distance (2 Points)'}</h4>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                    {isSk ? '3D priama vzdialenosť, horizontálny priemet, prevýšenie ΔH, azimut a sklon spojnice.' : 'True 3D distance, horizontal distance, elevation difference ΔH, azimuth, and inclination.'}
                  </p>
                </div>
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 6px 0', color: '#c084fc' }}>⛏️ {isSk ? 'Tektonika (3 Body)' : 'Tectonics (3 Points)'}</h4>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                    {isSk ? 'Výpočet sklonu roviny (Dip), azimutu spádnice (Dip Direction), smeru vrstvy (Strike) a 3D zobrazenie disku roviny.' : 'Calculates true dip angle, dip direction, strike line, and displays interactive 3D planar disc.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'clipping' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>✂️ {isSk ? 'Horizontálne rezy (Z-Clipping)' : 'Horizontal Z-Clipping'}</h3>
              <p>
                {isSk
                  ? 'Kliknutím na nožnice ✂️ sa v pravom hornom rohu vysunie plávajúci posuvník. Posúvaním plynulo zrezávate nadložie modelu s okamžitým zobrazením presnej nadmorskej výšky rezu.'
                  : 'Click the scissors icon ✂️ to reveal the floating Z-slice slider. Dynamically slice horizontal cave tiers with live elevation readout.'}
              </p>
            </div>
          )}

          {activeTab === 'lidar' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>☁️ {isSk ? 'LiDAR Point Cloud (Engine v2)' : 'LiDAR Point Cloud (Engine v2)'}</h3>
              <p>
                {isSk
                  ? 'Špecializovaný motor pre laserové skeny (.ply) s miliónmi bodov. Prepínač LiDAR NEXTGEN a editačné nástroje sa zobrazujú výhradne pri načítaných mračnách bodov formátu PLY (bežné polygónové modely ako .lox a .3d tento režim nepotrebujú). Využíva Octree LOD streaming (60 FPS) a Eye-Dome Lighting (EDL) post-processing pre plastické tieňovanie detailov.'
                  : 'High-performance engine for massive point clouds (.ply) with Octree streaming (60 FPS) and Eye-Dome Lighting (EDL) depth shading. The LiDAR NEXTGEN switch and editing tools appear exclusively when PLY point cloud datasets are loaded.'}
              </p>
              <ul style={{ paddingLeft: '18px', fontSize: '12px', color: '#cbd5e1' }}>
                <li><strong>{isSk ? 'Exkluzivita pre PLY' : 'Exclusive to PLY'}</strong>: {isSk ? 'Čisté rozhranie bez zbytočných prepínačov pre bežné meračské polygóny.' : 'Clean UI hiding LiDAR controls when viewing standard survey polygons.'}</li>
                <li><strong>{isSk ? 'Guma & Štetec' : 'Eraser & Brush'}</strong>: {isSk ? 'Interaktívne vymazanie šumu a vegetácie.' : 'Interactively erase scan noise or vegetation.'}</li>
                <li><strong>{isSk ? '2D Pôdorysná mapa' : '2D Plan Map'}</strong>: {isSk ? 'Generovanie a PNG export ortofoto mapy z hustoty bodov.' : 'Generate high-resolution PNG plan raster from point density.'}</li>
                <li><strong>{isSk ? 'Zrušenie načítania' : 'Cancel Loading'}</strong>: {isSk ? 'Pri výmene alebo zatvorení mračna sa jeho rozpracované sieťové načítanie automaticky preruší.' : 'An in-progress point-cloud download is cancelled when the cloud is replaced or closed.'}</li>
              </ul>
            </div>
          )}

          {activeTab === 'terrain' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>🏔️ {isSk ? 'Povrchový terén, WMS ZBGIS & Kalibrácia' : 'Terrain, ZBGIS WMS & Calibration'}</h3>
              <p>
                {isSk
                  ? 'Pripojenie na oficiálny štátny mapový WMS server GKÚ SR (Ortofoto a DMR 5.0 tieňovanie) a Mapbox 3D terén. Mapbox 3D modul sa načíta až po zapnutí terénu. Nástroj Kalibrácia umožňuje jemný 3D posun jaskyne voči povrchu v krokoch po 0.5 m.'
                  : 'Official Slovak Geodetic Institute (GKÚ ZBGIS) WMS integration, Mapbox 3D satellite surfaces (loaded only when terrain is enabled), and 0.5m 3D cave-to-surface position calibration.'}
              </p>
              <ul style={{ paddingLeft: '18px', fontSize: '12px', color: '#cbd5e1' }}>
                <li><strong>{isSk ? 'Sťahovanie DMR 5.0 (LiDAR GKÚ SR)' : 'DMR 5.0 Download (GKÚ LiDAR)'}</strong>: {isSk ? 'Priame stiahnutie 1-metrového výškového modelu reliéfu SR zo štátnej služby INSPIRE OGC WCS 2.0.1 (výsek 500 m až 10 km s krokom po 500 m) pre modely bez povrchu aj s možnosťou exportu .tif a .tfw súborov.' : 'Direct download of 1-meter Slovak digital elevation model from national INSPIRE OGC WCS 2.0.1 (tile 500 m to 10 km in 500 m steps) for caves without surface, with optional export of .tif and .tfw files.'}</li>
                <li><strong>{isSk ? 'Výškový systém Bpv & kvázigeoid' : 'Bpv Height Datum & Quasigeoid'}</strong>: {isSk ? 'Automatická transformácia z elipsoidických výšok INSPIRE ETRS89 na Baltský systém po vyrovnaní (Bpv) cez presný slovenský model kvázigeoidu (odpočet odchýlky cca 41 až 45 m). K dispozícii je prepínač na surové ETRS89 dáta.' : 'Automatic reduction from INSPIRE ETRS89 ellipsoidal heights to Baltic 1957 sea-level heights (Bpv) using the national quasigeoid model (subtracting undulation of ~41 to 45 m). Raw ETRS89 heights remain selectable.'}</li>
                <li><strong>{isSk ? 'Detekcia CRS jaskyne a sever' : 'Cave CRS Detection & North'}</strong>: {isSk ? 'Automatické rozpoznanie súradnicového systému jaskyne (S-JTSK Křovák, GPS UTM 34N/35N, WGS-84, lokálne zameranie) s korekciou meridiánovej konvergencie a presným usadením vchodu.' : 'Automatic detection of survey reference frame (S-JTSK Křovák, GPS UTM 34N/35N, WGS-84, local relative survey) with meridian convergence alignment and entrance anchoring.'}</li>
                <li><strong>{isSk ? 'Zjednotené vrstevnice a textúra' : 'Unified Contours & Texture'}</strong>: {isSk ? 'Vrstevnice sú integrované do jedného riadku s priamou voľbou farieb pre tenké a hrubé čiary spolu s prepínačom zapnutia; textúra (JPG/PNG) je umiestnená na konci nastavení.' : 'Contours are unified into a single row with direct color pickers for thin base and thick major lines alongside the toggle switch; texture (JPG/PNG) is positioned as the final terrain option.'}</li>
                <li><strong>{isSk ? 'Priehľadnosť povrchu' : 'Surface Opacity'}</strong>: {isSk ? 'Vyhradený posuvník priehľadnosti pre tieňovaný terén a výškovú sieť bez nutnosti textúry.' : 'Dedicated opacity slider for shaded relief and height network.'}</li>
                <li><strong>{isSk ? 'Kóty vrstevníc a 60 FPS optimalizácia' : 'Contour Altitudes & 60 FPS Motion'}</strong>: {isSk ? 'Dvojitá 2D detekcia výšok s optimalizovaným renderingom. Počas pohybu kamery sa DOM kóty dočasne skryjú a čiary využívajú odľahčený zdieľaný MeshBasicMaterial s hardvérovým cullingom pre okamžitú odozvu a garantovaných 60 FPS.' : 'Dual-axis elevation detection with optimized rendering. During camera motion, DOM labels are deferred and contour lines utilize a lightweight shared MeshBasicMaterial with hardware culling for instant response and guaranteed 60 FPS.'}</li>
                <li><strong>{isSk ? 'Stabilná priehľadnosť' : 'Persistent Transparency'}</strong>: {isSk ? 'Priehľadnosť povrchu terénu aj stien ostáva trvalo aktívna aj počas otáčania kamery bez preblikávania.' : 'Surface and wall transparency remains active during camera movement without flipping to opaque.'}</li>
                <li><strong>{isSk ? 'Okamžitá odozva' : 'Instant 60 FPS'}</strong>: {isSk ? 'On-demand WebGL vykresľovanie s bleskovou 180 ms stabilizáciou šetrí CPU/GPU batériu a zabezpečuje plynulý beh.' : 'On-demand WebGL render loop with 180 ms idle settling minimizes CPU/GPU load while delivering 60 FPS.'}</li>
              </ul>
            </div>
          )}

          {activeTab === 'share' && (
            <div>
              <h3 style={{ color: '#60a5fa', marginTop: 0 }}>🔗 {isSk ? 'Zdieľanie & Iframe Embed' : 'Sharing & Iframe Embedding'}</h3>
              <p>
                {isSk
                  ? 'Všetky nastavenia kamery, farieb, výšky rezu a filtrov sa v reálnom čase ukladajú do URL adresy. Cez tlačidlo Zdieľať môžete vygenerovať priamy odkaz alebo kód <iframe> pre vašu webstránku.'
                  : 'All visual states, slice heights, camera positions, and layer settings are preserved in shareable URLs and iframe embed codes.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#94a3b8'
        }}>
          <div>
            LochViewer • Slovenská speleologická spoločnosť (SSS) • <a href="https://loch.sss.sk" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>loch.sss.sk</a>
          </div>
          <button
            onClick={onClose}
            className="share-copy-btn"
            style={{ flex: 0, padding: '6px 16px', background: '#3b82f6', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >
            {isSk ? 'Zavrieť' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
