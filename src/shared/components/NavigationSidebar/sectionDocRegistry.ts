import type { Language } from '@shared/i18n';

export interface SectionDoc {
  title: string;
  badge?: string;
  desc: string;
  bullets: string[];
  helpTab?: 'basics' | 'nav' | 'splays' | 'measuring' | 'clipping' | 'lidar' | 'terrain' | 'share';
}

const SECTION_DOCS: Record<string, Record<Language, SectionDoc>> = {
  survey: {
    sk: {
      title: 'Meračská sieť & Polygónový ťah',
      badge: 'CAD · 3D',
      desc: 'Základná kostra jaskynného modelu tvorená meračským polygónovým ťahom medzi stanicami. Zobrazuje 3D línie, pomocné splay lúče, objemové trubice a orientačnú metrickú mriežku.',
      bullets: [
        'Polygónový ťah (Centerline): hlavná zameraná línia podzemných chodieb.',
        'Splay lúče: lúčovité meračské závery k stenám a stropu z jednotlivých bodov.',
        'Meračské trubice: priestorová 3D aproximácia objemu chodieb podľa LRUD rozmerov.',
        'Referenčná mriežka: metrická priestorová sieť pre vizuálny odhad mierky v 3D.',
      ],
      helpTab: 'basics',
    },
    en: {
      title: 'Survey Network & Centerline',
      badge: 'CAD · 3D',
      desc: 'Primary structural backbone of the cave survey formed by traverse legs between stations. Displays 3D survey lines, radial splay shots, volume corridors, and a reference coordinate grid.',
      bullets: [
        'Centerline: main survey traverse line connecting underground stations.',
        'Splay rays: radial measurement shots to walls and ceiling from individual stations.',
        'Survey tubes: 3D volumetric corridor approximation from LRUD passage data.',
        'Reference grid: spatial metric grid for visual scale estimation across the 3D scene.',
      ],
      helpTab: 'basics',
    },
    de: {
      title: 'Vermessungsnetz & Polygonzug',
      badge: 'CAD · 3D',
      desc: 'Strukturelles Rückgrat des Höhlenmodells aus Polygonzügen zwischen Vermessungspunkten.',
      bullets: [
        'Polygonzug (Centerline): Hauptvermessungslinie der Höhlengänge.',
        'Splay-Strahlen: radiale Messungen zu Wänden und Decke.',
        'Vermessungsschläuche: 3D-Volumennäherung aus LRUD-Daten.',
        'Referenzgitter: metrisches 3D-Koordinatennetz.',
      ],
      helpTab: 'basics',
    },
    fr: {
      title: 'Cheminement topographique & Polygone',
      badge: 'CAD · 3D',
      desc: 'Structure principale de la cavité formée par le cheminement topographique entre les stations.',
      bullets: [
        'Cheminement (Centerline) : ligne directrice reliant les stations souterraines.',
        'Visées rayonnantes (Splays) : mesures radiales vers les parois et le plafond.',
        'Tubes topographiques : approximation 3D volumétrique issue des dimensions LRUD.',
        'Grille de référence : repère métrique 3D spatial.',
      ],
      helpTab: 'basics',
    },
  },

  stations: {
    sk: {
      title: 'Meračské stanice & Kóty',
      badge: 'GPS · INFO',
      desc: 'Identifikácia a označovanie zameraných bodov v jaskyni. Umožňuje zobraziť čísla staníc, úplné názvy, nadmorské výšky Z, GPS súradnice a zvýrazniť vchody jaskyne.',
      bullets: [
        'Vchody jaskyne: zvýraznenie vstupných bodov so špeciálnym terčom.',
        'Pevné stanice (Fixed): geodeticky zamerané referenčné body s GPS.',
        'Cyklovanie štítkov: Číslo stanice → Úplný názov → Výška Z → GPS → Vypnuté.',
        'Detailná karta bodu: kliknutím na stanicu zobrazíte deniveláciu a minimálnu hrúbku nadložia s odkazmi na Google Maps a ZBGIS LiDAR.',
      ],
      helpTab: 'basics',
    },
    en: {
      title: 'Survey Stations & Labels',
      badge: 'GPS · INFO',
      desc: 'Identification and labeling of survey stations throughout the cave. Supports numbers, full station names, elevations Z, GPS coordinates, and entrance highlights.',
      bullets: [
        'Entrances: highlighted cave entrance stations with distinctive target markers.',
        'Fixed stations: geodetically surveyed reference points with GPS coordinates.',
        'Label cycling: Station number → Full name → Altitude Z → GPS → Off.',
        'Inspection card: click any station to view denivelation, overhead depth, and rock cover with Google Maps and ZBGIS LiDAR links.',
      ],
      helpTab: 'basics',
    },
    de: {
      title: 'Messpunkte & Beschriftung',
      badge: 'GPS · INFO',
      desc: 'Identifikation und Beschriftung der Vermessungspunkte in der Höhle.',
      bullets: [
        'Höhleneingänge: hervorgehobene Eingangspunkte mit Zielmarkierung.',
        'Fixpunkte: geodätisch eingemessene Referenzpunkte mit GPS.',
        'Beschriftungszyklus: Nummer → Vollständiger Name → Höhe Z → GPS → Aus.',
        'Punktkarte: Klick auf Station zeigt Denivellation und Gesteinsüberdeckung.',
      ],
      helpTab: 'basics',
    },
    fr: {
      title: 'Stations & Étiquettes',
      badge: 'GPS · INFO',
      desc: 'Identification et affichage des stations topographiques dans la cavité.',
      bullets: [
        'Entrées : mise en valeur des entrées avec marqueur ciblé.',
        'Stations fixes : repères géodésiques avec coordonnées GPS.',
        'Cycle d\'étiquettes : Numéro → Nom complet → Altitude Z → GPS → Désactivé.',
        'Fiche de station : clic pour afficher dénivellation et épaisseur de roche.',
      ],
      helpTab: 'basics',
    },
  },

  walls: {
    sk: {
      title: 'Steny jaskyne (Scraps / 3D model)',
      badge: 'MESH · 3D',
      desc: '3D polygonálny model stien jaskyne zmapovaný v teréne (formát LOX/Therion). Umožňuje plné tieňovanie, drôtenú sieť (wireframe), hypsometrické farbenie podľa výšky a Taubinovo vyhladzovanie.',
      bullets: [
        '3D plný model: realistické zobrazenie povrchu stien chodieb.',
        'Drôtená sieť: autentický speleologický axonometrický vzhľad.',
        'Farbenie podľa výšky: hypsometrická farebná škála podľa nadmorskej výšky Z.',
        'Taubinovo vyhladzovanie: redukcia meračského šumu bez nežiaduceho zmenšenia objemu.',
      ],
      helpTab: 'basics',
    },
    en: {
      title: 'Cave Walls (Scraps / 3D Mesh)',
      badge: 'MESH · 3D',
      desc: '3D polygonal wall mesh reconstructed from field scraps (LOX/Therion format). Supports shaded rendering, wireframe mesh, altitude hypsometry, and Taubin Laplacian smoothing.',
      bullets: [
        'Solid 3D model: realistic shaded wall surface rendering.',
        'Wireframe mesh: authentic speleological axonometric line representation.',
        'Color by altitude: hypsometric altitude color ramp along Z axis.',
        'Taubin smoothing: volume-preserving Laplacian surface smoothing to eliminate survey noise.',
      ],
      helpTab: 'basics',
    },
    de: {
      title: 'Höhlenwände (Scraps / 3D-Netz)',
      badge: 'MESH · 3D',
      desc: '3D-Polygonmodell der Höhlenwände aus Therion-Scraps.',
      bullets: [
        'Vollständiges 3D-Modell: schattierte Wandoberflächen.',
        'Drahtgitter: authentische speläologische Axonometrie.',
        'Höhenfarben: hypsometrische Farbpalette nach Höhe Z.',
        'Taubin-Glättung: Rauschunterdrückung ohne Schrumpfung.',
      ],
      helpTab: 'basics',
    },
    fr: {
      title: 'Parois de cavité (Scraps / 3D)',
      badge: 'MESH · 3D',
      desc: 'Modèle polygonal 3D des parois reconstitué à partir des scraps Therion.',
      bullets: [
        'Modèle 3D plein : rendu ombré réaliste des parois.',
        'Fil de fer (Wireframe) : vue axonométrique spéléologique authentique.',
        'Couleur par altitude : échelle hypsométrique le long de l\'axe Z.',
        'Lissage de Taubin : élimination du bruit de mesure sans perte de volume.',
      ],
      helpTab: 'basics',
    },
  },

  splay_walls: {
    sk: {
      title: 'Splay SDF steny (2D/3D lúče)',
      badge: 'SDF · VOXEL',
      desc: 'Matematická rekonštrukcia stien jaskyne z radiálnych meračských splay lúčov pomocou funkcie Signed Distance Field (SDF). Ideálne pre modely bez manuálnych polygonálnych stien.',
      bullets: [
        'SDF rekonštrukcia: automatické prepojenie zameraných profilov do súvislého 3D plášťa.',
        '2D horizontálne rezy a 3D izoplochy.',
        'Nastaviteľné vyhladzovanie a hustota siete.',
      ],
      helpTab: 'splays',
    },
    en: {
      title: 'Splay SDF Walls (Ray Reconstruction)',
      badge: 'SDF · VOXEL',
      desc: 'Mathematical cave wall reconstruction from radial splay shots using Signed Distance Field (SDF) volumetrics. Ideal for survey datasets lacking manual scrap meshes.',
      bullets: [
        'SDF reconstruction: automated corridor lofting between surveyed splay clusters.',
        '2D horizontal slices and 3D isosurface generation.',
        'Adjustable smoothing radius and voxel density.',
      ],
      helpTab: 'splays',
    },
    de: {
      title: 'Splay SDF-Wände (Strahlen-Rekonstruktion)',
      badge: 'SDF · VOXEL',
      desc: 'Mathematische Rekonstruktion von Höhlenwänden aus Splay-Messstrahlen.',
      bullets: [
        'SDF-Rekonstruktion: kontinuierliche 3D-Hülle aus Messprofilen.',
        '2D-Schnitte und 3D-Isoflächen.',
        'Einstellbare Glättung und Voxeldichte.',
      ],
      helpTab: 'splays',
    },
    fr: {
      title: 'Parois Splay SDF (Rayons)',
      badge: 'SDF · VOXEL',
      desc: 'Reconstitution mathématique des parois par champs de distance signée (SDF).',
      bullets: [
        'Reconstruction SDF : enveloppe 3D continue issue des visées.',
        'Coupes horizontales 2D et isosurfaces 3D.',
        'Lissage et résolution de grille réglables.',
      ],
      helpTab: 'splays',
    },
  },

  lidar: {
    sk: {
      title: 'LiDAR mračno bodov & Editačný štetec',
      badge: 'LOD · NEXTGEN',
      desc: 'Vysokovýkonný Engine v2 pre masívne mračná bodov z laserového skenovania (milióny bodov). Podporuje Octree LOD, Eye-Dome Lighting (EDL), výber tvaru bodov a laserový štetec na čistenie nečistôt.',
      bullets: [
        'EDL tieňovanie: vnímanie hĺbky a plastický reliéf bez nutnosti predpočítaných normál.',
        'Tvar bodov: Kruh, Štvorec, Kríž, Asterisk, Plus.',
        'Editačný štetec: označovanie a mazanie nežiaducich bodov s históriou Undo.',
        'Octree LOD: plynulé dynamické streamovanie pri stabilných 60 FPS.',
      ],
      helpTab: 'lidar',
    },
    en: {
      title: 'LiDAR Point Cloud & Editing Brush',
      badge: 'LOD · NEXTGEN',
      desc: 'High-performance Engine v2 for massive airborne and terrestrial LiDAR point clouds. Features Octree LOD streaming, Eye-Dome Lighting (EDL), point shape selection, and noise/vegetation cleaning brush.',
      bullets: [
        'Eye-Dome Lighting: enhanced depth perception and plastic silhouette shading.',
        'Point shapes: Circle, Square, Cross, Asterisk, Plus.',
        'Editing brush: interactive lasso and brush point deletion with multi-step Undo.',
        'Octree LOD: dynamic streaming maintaining smooth 60 FPS.',
      ],
      helpTab: 'lidar',
    },
    de: {
      title: 'LiDAR-Punktwolke & Bearbeitungspinsel',
      badge: 'LOD · NEXTGEN',
      desc: 'Hochleistungs-Engine v2 für Millionen von Laserscan-Punkten.',
      bullets: [
        'Eye-Dome Lighting (EDL): plastische Tiefenwahrnehmung.',
        'Punktformen: Kreis, Quadrat, Kreuz, Asterisk, Plus.',
        'Bearbeitungspinsel: gezieltes Löschen unerwünschter Punkte mit Undo.',
        'Octree LOD: flüssige Darstellung bei 60 FPS.',
      ],
      helpTab: 'lidar',
    },
    fr: {
      title: 'Nuage de points LiDAR & Pinceau',
      badge: 'LOD · NEXTGEN',
      desc: 'Moteur NextGen v2 pour nuages de points massifs issus de scanners laser.',
      bullets: [
        'Ombrage EDL : perception accrue du relief et de la profondeur.',
        'Formes de points : Cercle, Carré, Croix, Astérisque, Plus.',
        'Pinceau d\'édition : sélection et suppression de points avec historique Undo.',
        'Octree LOD : affichage fluide et adaptatif à 60 FPS.',
      ],
      helpTab: 'lidar',
    },
  },

  tectonics: {
    sk: {
      title: 'Tektonika & Geologické pukliny',
      badge: 'GEOLOGY',
      desc: 'Analýza smeru a sklonu puklinových systémov a zlomových rovín, pozdĺž ktorých prebiehal speleogenetický vývoj jaskyne vo vápencovom masíve.',
      bullets: [
        'Zlomové plochy: 3D vizualizácia rovinných puklín s orientáciou.',
        'Smer a sklon (Strike & Dip): speleologické vyhodnotenie hlavných štruktúr.',
        'Filter vrstiev podľa klasifikácie puklín.',
      ],
      helpTab: 'basics',
    },
    en: {
      title: 'Tectonics & Geological Faults',
      badge: 'GEOLOGY',
      desc: 'Structural analysis of fault planes, joint sets, strike, and dip angles guiding speleogenetic development in the limestone massif.',
      bullets: [
        'Fault planes: 3D planar visualization with spatial orientation.',
        'Strike & Dip: structural evaluation of primary joint directions.',
        'Layer filtering according to fault classification.',
      ],
      helpTab: 'basics',
    },
    de: {
      title: 'Tektonik & Geologische Klüfte',
      badge: 'GEOLOGY',
      desc: 'Strukturanalyse von Störungszonen und Kluftsystemen im Höhlenmassiv.',
      bullets: [
        'Störungsflächen: 3D-Ebenen mit Raumlage.',
        'Streich- und Fallwinkel (Strike & Dip).',
        'Schichtfilter nach geologischer Klassifikation.',
      ],
      helpTab: 'basics',
    },
    fr: {
      title: 'Tectonique & Fractures géologiques',
      badge: 'GEOLOGY',
      desc: 'Analyse structurale des failles et diaclases orientant la spéléogenèse.',
      bullets: [
        'Plans de faille : visualisation 3D des discontinuités orientées.',
        'Direction et pendage (Strike & Dip).',
        'Filtrage par familles de fractures.',
      ],
      helpTab: 'basics',
    },
  },

  surface: {
    sk: {
      title: 'Digitálny model reliéfu (DMR / DTM)',
      badge: 'DTM · 3D',
      desc: '3D výškový povrch terénu nad jaskyňou. Umožňuje porovnať priebeh podzemných chodieb s povrchovou geomorfológiou, krasovými závrtmi, údoliami a roklinami.',
      bullets: [
        'Tieňovaný povrch: plastický reliéf terénu.',
        'Priehľadnosť povrchu: posuvník 5 % až 100 % pre priehľad do podzemia bez textúry.',
        'Vrstevnice & Kóty: presné generovanie vrstevníc s obojsmerným odpočtom nadmorskej výšky.',
        'Výšková sieť: metrická trojuholníková sieť s hypsometriou.',
      ],
      helpTab: 'terrain',
    },
    en: {
      title: 'Digital Terrain Model (DMR / DTM)',
      badge: 'DTM · 3D',
      desc: '3D digital elevation surface above the cave. Enables comparing underground passages with surface geomorphology, sinkholes, valleys, and karst features.',
      bullets: [
        'Shaded relief: plastic 3D terrain topography.',
        'Surface opacity: dedicated 5% to 100% slider to reveal underground passages without loading textures.',
        'Contour lines & labels: dynamic contour intervals with dual-axis elevation labels.',
        'Elevation grid: triangulated wireframe mesh with hypsometric tinting.',
      ],
      helpTab: 'terrain',
    },
    de: {
      title: 'Digitales Geländemodell (DGM / DTM)',
      badge: 'DTM · 3D',
      desc: '3D-Geländeoberfläche über der Höhle zum Vergleich mit Karstformen und Tälern.',
      bullets: [
        'Schattiertes Relief: plastische Geländedarstellung.',
        'Geländetransparenz: Schieberegler 5% bis 100% für Einblick in den Untergrund.',
        'Höhenlinien & Kanten: automatische Höhenbeschriftung.',
        'Höhengitter: trianguliertes Gitternetz.',
      ],
      helpTab: 'terrain',
    },
    fr: {
      title: 'Modèle Numérique de Terrain (MNT / DTM)',
      badge: 'DTM · 3D',
      desc: 'Surface topographique 3D au-dessus de la cavité pour corréler galeries et dolines.',
      bullets: [
        'Relief ombré : rendu topographique plastique.',
        'Transparence de surface : réglage 5% à 100% pour observer le réseau sous-jacent.',
        'Courbes de niveau & cotes : calcul automatique et étiquetage régulier.',
        'Maillage altimétrique : grille filaire hypsométrique.',
      ],
      helpTab: 'terrain',
    },
  },

  dmr5: {
    sk: {
      title: 'DMR 5.0 (GKÚ LiDAR SR - WCS 2.0.1)',
      badge: 'GKÚ · WCS',
      desc: 'Priame online sťahovanie certifikovaného digitálneho modelu reliéfu DMR 5.0 zo štátnej služby INSPIRE OGC WCS 2.0.1 GKÚ SR v rozlíšení 1 × 1 meter pre celé územie Slovenska.',
      bullets: [
        '100 % celoslovenské pokrytie: Tatry, Slovenský kras, Muráň, Malé Karpaty a ďalšie.',
        'Automatické GPS: predvyplnenie polohy vchodu alebo centra jaskyne.',
        'Vlastná veľkosť výseku: predvoľby 500 m, 1 km, 2 km alebo vlastný rozsah s krokovaním po 500 m.',
        'Export do PC: uloženie georeferencovaného .tif + .tfw súboru pre QGIS a CAD softvér.',
      ],
      helpTab: 'terrain',
    },
    en: {
      title: 'DMR 5.0 (GKÚ LiDAR Slovakia - WCS)',
      badge: 'GKÚ · WCS',
      desc: 'Direct online streaming of Slovakia\'s certified 1-meter DMR 5.0 LiDAR elevation raster from national INSPIRE OGC WCS 2.0.1 service covering 100% of Slovak territory.',
      bullets: [
        '100% nationwide coverage: Tatras, Slovak Karst, Muran, Lesser Carpathians, etc.',
        'Auto GPS: automatic entrance or cave center coordinate detection.',
        'Custom extent: presets 500m, 1km, 2km or custom size in 500m steps up to 10km.',
        'Export to PC: georeferenced .tif + .tfw (World File) download for GIS/CAD workflows.',
      ],
      helpTab: 'terrain',
    },
    de: {
      title: 'DMR 5.0 (Slowakei LiDAR - WCS)',
      badge: 'GKÚ · WCS',
      desc: 'Direkter Download des slowakischen 1m-LiDAR-Geländemodells über INSPIRE WCS.',
      bullets: [
        '100% landesweite Abdeckung der Slowakei.',
        'Automatische GPS-Erkennung des Höhleneingangs.',
        'Benutzerdefinierte Ausdehnung in 500m-Schritten.',
        'Export als .tif + .tfw für GIS und CAD.',
      ],
      helpTab: 'terrain',
    },
    fr: {
      title: 'MNT 5.0 (LiDAR Slovaquie - WCS)',
      badge: 'GKÚ · WCS',
      desc: 'Téléchargement direct du modèle altimétrique national slovaque 1 m via WCS.',
      bullets: [
        'Couverture nationale à 100 % de la Slovaquie.',
        'Détection GPS automatique de l\'entrée.',
        'Étendue personnalisable par pas de 500 m.',
        'Export en fichiers .tif + .tfw pour QGIS et CAD.',
      ],
      helpTab: 'terrain',
    },
  },

  wms: {
    sk: {
      title: 'Mapové podklady GKÚ ZBGIS (WMS)',
      badge: 'ZBGIS · WMS',
      desc: 'Aplikácia štátnych máp na 3D povrch jaskyne cez WMS službu Geodetického a kartografického ústavu SR.',
      bullets: [
        'Ortofotomapa SR: letecké ortofotomapy s vysokým rozlíšením.',
        'DMR 5.0 tieňovanie: jemne tieňovaný reliéf krasových foriem a závrtov.',
        'Základná mapa SR: topografická mapa s turistickými a katastrálnymi prvkami.',
      ],
      helpTab: 'terrain',
    },
    en: {
      title: 'Slovak GKÚ ZBGIS Maps (WMS)',
      badge: 'ZBGIS · WMS',
      desc: 'Texture draping of official Slovak geodetic maps onto 3D terrain via GKÚ Geoportal WMS.',
      bullets: [
        'Orthophoto: high-resolution aerial imagery across Slovakia.',
        'DMR 5.0 hillshading: finely shaded relief revealing sinkholes and karst terrain.',
        'Topographic map: official topographic vector map with trails and landmarks.',
      ],
      helpTab: 'terrain',
    },
    de: {
      title: 'ZBGIS Kartenunterlagen (WMS)',
      badge: 'ZBGIS · WMS',
      desc: 'Projektion offizieller slowakischer Geodäsie-Karten auf das 3D-Gelände.',
      bullets: [
        'Orthofoto: hochauflösende Luftbilder.',
        'DMR 5.0 Schattierung: detailreiches Relief von Karsttrichtern.',
        'Topographische Karte: offizielle Basiskarte.',
      ],
      helpTab: 'terrain',
    },
    fr: {
      title: 'Cartes nationales ZBGIS (WMS)',
      badge: 'ZBGIS · WMS',
      desc: 'Drapage des cartes géodésiques slovaques officielles sur le relief 3D.',
      bullets: [
        'Orthophoto : imagerie aérienne haute résolution.',
        'Ombrage MNT 5.0 : visualisation nette des dolines karstiques.',
        'Carte topographique de base : repères et sentiers.',
      ],
      helpTab: 'terrain',
    },
  },

  mapbox: {
    sk: {
      title: 'Mapbox 3D Satelitný terén',
      badge: 'GLOBAL · 3D',
      desc: 'Globálny 3D satelitný model terénu generovaný z Mapbox RGB výškových dlaždíc pre medzinárodné jaskyne mimo SR.',
      bullets: [
        'Celosvetové pokrytie: vhodné pre expedície kdekoľvek na Zemi.',
        'Výškové prevýšenie (Exaggeration): nastaviteľná vertikálna mierka reliéfu.',
        'Odložené načítanie: kód modulu sa sťahuje až po zapnutí terénu.',
      ],
      helpTab: 'terrain',
    },
    en: {
      title: 'Mapbox 3D Satellite Terrain',
      badge: 'GLOBAL · 3D',
      desc: 'Global 3D satellite elevation surface generated from Mapbox RGB terrain tiles for worldwide cave systems.',
      bullets: [
        'Global coverage: ideal for international speleological expeditions.',
        'Vertical exaggeration: adjustable vertical relief multiplier.',
        'Lazy loading: modular bundle downloaded only when enabled.',
      ],
      helpTab: 'terrain',
    },
    de: {
      title: 'Mapbox 3D Satellitengelände',
      badge: 'GLOBAL · 3D',
      desc: 'Weltweites 3D-Gelände aus Mapbox-Satelliten- und Höhendaten.',
      bullets: [
        'Globale Abdeckung für internationale Höhlenexpeditionen.',
        'Höhenüberhöhung: anpassbare Reliefskalierung.',
        'Lazy-Loading: wird erst bei Aktivierung geladen.',
      ],
      helpTab: 'terrain',
    },
    fr: {
      title: 'Terrain satellite Mapbox 3D',
      badge: 'GLOBAL · 3D',
      desc: 'Surface topographique satellite mondiale générée à partir des tuiles Mapbox RGB.',
      bullets: [
        'Couverture mondiale pour expéditions spéléologiques internationales.',
        'Exagération verticale réglable.',
        'Chargement différé pour préserver la mémoire.',
      ],
      helpTab: 'terrain',
    },
  },

  custom_texture: {
    sk: {
      title: 'Vlastná textúra a 2D kalibrácia',
      badge: 'TEXTURE · 2D',
      desc: 'Možnosť nahrať vlastný mapový podklad (napr. historická mapa, geologická mapa, ortofotomapa z dronu) a presne ho napasovať na 3D terén.',
      bullets: [
        'Podpora formátov JPG a PNG.',
        'Posun textúry: jemná korekcia v osiach X a Y.',
        'Uloženie a načítanie kalibračného súboru (.calib).',
      ],
      helpTab: 'terrain',
    },
    en: {
      title: 'Custom Texture & 2D Calibration',
      badge: 'TEXTURE · 2D',
      desc: 'Upload custom map imagery (e.g. historical survey, geological map, drone orthophoto) and calibrate its offset and scale onto 3D terrain.',
      bullets: [
        'Supports standard JPG and PNG raster images.',
        'Texture shift: fine-tuning in X and Y pixel space.',
        'Calibration persistence: export and import alignment coordinates (.calib).',
      ],
      helpTab: 'terrain',
    },
    de: {
      title: 'Eigene Textur & 2D-Kalibrierung',
      badge: 'TEXTURE · 2D',
      desc: 'Laden eigener Kartenbilder mit manueller Ausrichtung.',
      bullets: [
        'Unterstützung für JPG und PNG.',
        'Verschiebung in X- und Y-Achse.',
        'Kalibrierungsdateien speichern und laden.',
      ],
      helpTab: 'terrain',
    },
    fr: {
      title: 'Texture personnalisée & Calage 2D',
      badge: 'TEXTURE · 2D',
      desc: 'Import de plans historiques ou géologiques avec calage 2D.',
      bullets: [
        'Formats JPG et PNG pris en charge.',
        'Décalage fin selon les axes X et Y.',
        'Export/import de fichiers de calage (.calib).',
      ],
      helpTab: 'terrain',
    },
  },

  calibration: {
    sk: {
      title: '3D Geodetická kalibrácia jaskyne voči povrchu',
      badge: 'GEO · 3D',
      desc: 'Nástroj na jemnú korekciu polohy jaskynného polygónu voči povrchovému modelu terénu v troch osiach (X, Y, Z).',
      bullets: [
        'Posun v metroch: krokovanie po 0.5 m (Sever/Juh, Východ/Západ, Nadmorská výška).',
        'Reset kalibrácie: návrat k pôvodným meračským súradniciam.',
        'Export a import: uloženie konfiguračného súboru kalibrácie pre opakované použitie.',
      ],
      helpTab: 'terrain',
    },
    en: {
      title: '3D Cave-to-Surface Geodetic Calibration',
      badge: 'GEO · 3D',
      desc: 'Tool for fine-tuning the 3D spatial alignment of underground cave passages relative to surface terrain across X, Y, Z axes.',
      bullets: [
        'Metric adjustments: 0.5 m steps (North/South, East/West, Altitude Z).',
        'Calibration reset: restore original survey placement.',
        'Export & import: save calibration parameters for automatic loading.',
      ],
      helpTab: 'terrain',
    },
    de: {
      title: '3D-Geodätische Höhlenkalibrierung',
      badge: 'GEO · 3D',
      desc: 'Feinausrichtung der Höhle relativ zur Oberfläche in X-, Y- und Z-Achsen.',
      bullets: [
        'Schritte von 0.5 m (Nord/Süd, Ost/West, Höhe Z).',
        'Reset auf Originalkoordinaten.',
        'Export und Import von Kalibrierungsdateien.',
      ],
      helpTab: 'terrain',
    },
    fr: {
      title: 'Calage géodésique 3D cavité / surface',
      badge: 'GEO · 3D',
      desc: 'Outil de translation 3D de la cavité par rapport au terrain (axes X, Y, Z).',
      bullets: [
        'Ajustement métrique par pas de 0.5 m.',
        'Réinitialisation aux coordonnées d\'origine.',
        'Export et import des paramètres de calage.',
      ],
      helpTab: 'terrain',
    },
  },

  views: {
    sk: {
      title: 'Pohľady, Kamera & Projekcia',
      badge: 'CAMERA · 3D',
      desc: 'Prepínanie ortogonálnych a axonometrických speleologických pohľadov. Umožňuje cyklické prepínanie strán a voľbu typu projekcie.',
      bullets: [
        'Pôdorys: prepínanie pohľadu zhora a zdola.',
        'Nárys: cyklické otáčanie svetových strán (Juh → Východ → Sever → Západ).',
        'Bokorys: bočný profil jaskyne.',
        'Perspektíva vs. Ortografická projekcia: prepínanie 3D plastického zobrazenia a technického výkresu.',
      ],
      helpTab: 'nav',
    },
    en: {
      title: 'Views, Camera & Projection',
      badge: 'CAMERA · 3D',
      desc: 'Speleological orthographic and axonometric camera projections with side cycling and azimuth controls.',
      bullets: [
        'Plan view: toggles view from above and below.',
        'Elevation view: cycles cardinal directions (South → East → North → West).',
        'Section view: transverse side profile.',
        'Perspective vs Orthographic: toggle between 3D depth and technical CAD projection.',
      ],
      helpTab: 'nav',
    },
    de: {
      title: 'Ansichten, Kamera & Projektion',
      badge: 'CAMERA · 3D',
      desc: 'Umschalten speläologischer Ansichten und Projektionen.',
      bullets: [
        'Grundriss: Ansicht von oben / unten.',
        'Aufriss: Rotation durch Himmelsrichtungen (Süd → Ost → Nord → West).',
        'Seitenansicht: Längs- und Querschnitte.',
        'Perspektivisch vs. Orthographisch.',
      ],
      helpTab: 'nav',
    },
    fr: {
      title: 'Vues, Caméra & Projection',
      badge: 'CAMERA · 3D',
      desc: 'Projections topographiques axonométriques et orthogonales.',
      bullets: [
        'Plan : vue du dessus et du dessous.',
        'Coupe développée : cycle des directions cardinales (Sud → Est → Nord → Ouest).',
        'Profil : vue latérale.',
        'Perspective vs Orthographique : basculement technique.',
      ],
      helpTab: 'nav',
    },
  },

  clipping: {
    sk: {
      title: 'Orezávanie & Vertikálny profil',
      badge: 'SECTION · CUT',
      desc: 'Interaktívne orezanie modelu 3D rovinami alebo vytvorenie vertikálneho speleologického rezu pozdĺž zvolenej línie v jaskyni.',
      bullets: [
        'Priamy profil z hornej lišty: kliknite 2 body a jaskyňa sa okamžite rozreže.',
        'Posun a otočenie roviny rezu v reálnom čase.',
        'Kváder (Bounding Box): priestorové orezanie v osiach X, Y a Z.',
      ],
      helpTab: 'clipping',
    },
    en: {
      title: 'Bounding Box & Vertical Profile',
      badge: 'SECTION · CUT',
      desc: 'Interactive 3D bounding box sectioning or instant vertical profile cut along any two chosen stations.',
      bullets: [
        'Direct profile from toolbar: pick two points to cut the cave immediately.',
        'Real-time section offset and normal flip controls.',
        'Bounding Box: spatial clipping along X, Y, and Z axes.',
      ],
      helpTab: 'clipping',
    },
    de: {
      title: 'Begrenzungsbox & Vertikalschnitt',
      badge: 'SECTION · CUT',
      desc: 'Interaktives Schneiden des Modells mit Ebenen und Profilschnitten.',
      bullets: [
        'Direktschnitt aus der Symbolleiste: 2 Punkte wählen.',
        'Echtzeitverschiebung und Drehung der Schnittebene.',
        'Begrenzungsbox in X-, Y- und Z-Achsen.',
      ],
      helpTab: 'clipping',
    },
    fr: {
      title: 'Boîte de coupe & Profil vertical',
      badge: 'SECTION · CUT',
      desc: 'Découpe 3D interactive ou section verticale directe le long d\'une ligne.',
      bullets: [
        'Profil direct : sélection de 2 points pour couper le modèle immédiatement.',
        'Décalage et inversion du plan de coupe en temps réel.',
        'Boîte englobante : découpe spatiale selon X, Y et Z.',
      ],
      helpTab: 'clipping',
    },
  },

  measurement: {
    sk: {
      title: '3D Meranie vzdialeností & Polygón',
      badge: 'MEASURE · 3D',
      desc: 'Profesionálny meračský nástroj s automatickým prichytávaním k staniciam a splay bodom do 10 pixelov.',
      bullets: [
        'Vzdialenosť A ↔ B: celková 3D dĺžka, horizontálny rozstup a prevýšenie ΔZ.',
        'Polygón a plocha: meranie obvodu a plochy uzavretého polygónu.',
        'Telemetria voči terénu: kolmá hĺbka a najkratšia vzdialenosť k povrchu (minimálna hrúbka masívu).',
        'Klávesa Escape zruší posledný bod alebo ukončí meranie.',
      ],
      helpTab: 'measuring',
    },
    en: {
      title: '3D Distance & Polygon Area',
      badge: 'MEASURE · 3D',
      desc: 'Professional survey measurement tool with shared 10-pixel screen-space snapping to stations, splays, and meshes.',
      bullets: [
        'Distance A ↔ B: total 3D distance, horizontal span, and vertical difference ΔZ.',
        'Polygon & Area: perimeter and 3D surface area of multi-point polygons.',
        'Terrain telemetry: overhead vertical depth and true shortest 3D distance to surface.',
        'Escape key cancels last point or clears measurement.',
      ],
      helpTab: 'measuring',
    },
    de: {
      title: '3D-Messung & Polygonfläche',
      badge: 'MEASURE · 3D',
      desc: 'Präzises 3D-Messwerkzeug mit Fangfunktion an Stationen.',
      bullets: [
        'Strecke A ↔ B: 3D-Distanz, Horizontalabstand und Höhendifferenz ΔZ.',
        'Polygon: Umfang und Fläche mehrpunktiger Polygone.',
        'Geländetelemetrie: vertikale Tiefe und minimale Felsüberdeckung.',
      ],
      helpTab: 'measuring',
    },
    fr: {
      title: 'Mesure 3D & Aire polygonale',
      badge: 'MEASURE · 3D',
      desc: 'Outil de mesure 3D avec accrochage précis aux stations.',
      bullets: [
        'Distance A ↔ B : distance 3D, distance horizontale et dénivelé ΔZ.',
        'Polygone & Aire : périmètre et surface 3D.',
        'Télémétrie de surface : profondeur verticale et épaisseur de roche minimale.',
      ],
      helpTab: 'measuring',
    },
  },

  speleo_analysis: {
    sk: {
      title: 'Speleologická analýza & Detekcia dómov',
      badge: 'ANALYSIS',
      desc: 'Automatické vyhodnocovanie morfológie jaskynných priestorov, detekcia veľkých podzemných siení, dómov a zúžení z LiDAR dát.',
      bullets: [
        'Detekcia anomálií: nájdenie priestorových anomálií a siení.',
        'Profil chodby: priečny prierez a kubatúra vybraného segmentu.',
        '2D mapový export: generovanie pôdorysnej mapy v rozlíšení pre tlač.',
      ],
      helpTab: 'measuring',
    },
    en: {
      title: 'Speleological Analysis & Cavity Detection',
      badge: 'ANALYSIS',
      desc: 'Automated analysis of cave morphology, large chamber/dome detection, and constrictions from survey and LiDAR spatial data.',
      bullets: [
        'Anomaly detection: locate spacious chambers and unexpected volumetric expansions.',
        'Passage profile: cross-sectional geometry and corridor volume.',
        '2D plan map generation: printable vector/raster plan map export.',
      ],
      helpTab: 'measuring',
    },
    de: {
      title: 'Speläologische Analyse & Hallenerkennung',
      badge: 'ANALYSIS',
      desc: 'Automatisierte Erkennung von Hohlräumen und Hallen aus Vermessungsdaten.',
      bullets: [
        'Anomalie-Erkennung: Aufspüren großer Hallen.',
        'Gangprofil: Querschnitt und Kubatur.',
        '2D-Planerstellung für den Druck.',
      ],
      helpTab: 'measuring',
    },
    fr: {
      title: 'Analyse spéléologique & Grandes salles',
      badge: 'ANALYSIS',
      desc: 'Détection automatisée des volumes, grandes salles et rétrécissements.',
      bullets: [
        'Détection d\'anomalies volumétriques.',
        'Profil de galerie : section transversale et cubature.',
        'Export de plan 2D prêt pour impression.',
      ],
      helpTab: 'measuring',
    },
  },

  system: {
    sk: {
      title: 'Nastavenia systému, Téma & Pomoc',
      badge: 'SYSTEM',
      desc: 'Konfigurácia používateľského rozhrania, farebných motívov pozadia a prístup k interaktívnej speleologickej dokumentácii.',
      bullets: [
        'Témy: Klasická tmavá (Deep Abyss), Technická modrá (Precision), Svetlá piesková (Fieldwork Sand).',
        'Jazyk: Slovenčina, English, Deutsch, Français s automatickou detekciou regiónu.',
        'Dokumentácia: kompletný sprievodca klávesovými skratkami a speleologickými funkciami.',
      ],
      helpTab: 'nav',
    },
    en: {
      title: 'System Settings, Theme & Help',
      badge: 'SYSTEM',
      desc: 'Interface configuration, background theme selection, and access to interactive speleological guides.',
      bullets: [
        'Themes: Classic dark (Deep Abyss), Technical blue (Precision), Fieldwork sand (Light).',
        'Language: Slovak, English, German, French with auto-detection for SK/CZ.',
        'Documentation: comprehensive interactive guide with shortcuts and formulas.',
      ],
      helpTab: 'nav',
    },
    de: {
      title: 'Systemeinstellungen, Thema & Hilfe',
      badge: 'SYSTEM',
      desc: 'Oberflächenkonfiguration, Farbthemen und Hilfedokumentation.',
      bullets: [
        'Themen: Dunkel (Deep Abyss), Technisch (Precision), Sandfarben (Light).',
        'Sprachen: Slowakisch, Englisch, Deutsch, Französisch.',
        'Hilfe & Tastenkürzel.',
      ],
      helpTab: 'nav',
    },
    fr: {
      title: 'Paramètres système, Thème & Aide',
      badge: 'SYSTEM',
      desc: 'Configuration de l\'interface, thèmes visuels et documentation.',
      bullets: [
        'Thèmes : Sombre (Deep Abyss), Technique (Precision), Sable (Light).',
        'Langues : slovaque, anglais, allemand, français.',
        'Guide d\'utilisation et raccourcis.',
      ],
      helpTab: 'nav',
    },
  },
};

export function getSectionDoc(topic: string, lang: Language): SectionDoc | null {
  const entry = SECTION_DOCS[topic];
  if (!entry) return null;
  return entry[lang] || entry.en || entry.sk || null;
}
