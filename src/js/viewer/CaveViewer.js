import { Color, EventDispatcher, FogExp2, Raycaster, Scene, Vector2, Vector3, WebGLRenderer, LinearSRGBColorSpace } from '../Three';
import {
	FACE_SCRAPS, FACE_WALLS, FACE_MODEL, FEATURE_BOX, FEATURE_ENTRANCES, FEATURE_ENTRANCE_DOTS, FEATURE_GRID, FEATURE_STATIONS, FEATURE_TERRAIN, FEATURE_TRACES,
	LABEL_STATION, LABEL_STATION_COMMENT, LEG_CAVE, LEG_SPLAY, LEG_DUPLICATE, LEG_SURFACE, LM_NONE, LM_SINGLE, MOUSE_MODE_TRACE_EDIT, SURVEY_WARNINGS,
	VERSION, VIEW_ELEVATION_E, VIEW_ELEVATION_N, VIEW_ELEVATION_S, VIEW_ELEVATION_W,  VIEW_NONE, VIEW_PLAN,
} from '../core/constants';

import { CameraManager } from './CameraManager';
import { CameraMove } from './CameraMove';
import { CaveLoader } from '../loaders/CaveLoader';
import { Cfg } from '../core/Cfg';
import { CommonTerrain } from '../terrain/CommonTerrain';
import { ExportGltf } from './ExportGltf';
import { HUD } from '../hud/HUD';
import { LightingManager } from './LightingManager';
import { LiveMarkers } from './LiveMarkers';
import { SurveyTrails } from './SurveyTrails';
import { Materials } from '../materials/Materials';
import { ModelSource } from '../core/ModelSource';
import { OrbitControls } from '../ui/OrbitControls';
import { PointerControls } from '../ui/PointerControls';
import { PublicFactory } from '../public/PublicFactory';
import { RenderUtils } from '../core/RenderUtils';
import { Snapshot } from './Snapshot';
import { StationMediaOverlay } from '../ui/StationMediaOverlay';
import { Survey } from './Survey';
import { ViewState } from './ViewState';
import { WebTerrain } from '../terrain/WebTerrain';
import { WorkerPoolCache } from '../core/WorkerPool';

class CaveViewer extends EventDispatcher {

	constructor ( domID, configuration ) {

		super();
		console.log( 'CaveView v' + VERSION );

		const container = document.getElementById( domID );

		if ( ! container ) throw new Error( `No container DOM object [${domID}] available` );

		this.container = container;

		const cfg = new Cfg( configuration );

		// the element put into fullscreen when the viewer's fullscreen is asked for: the
		// container itself unless the configuration names another, which a host uses to
		// take controls of its own around the viewer into fullscreen with it

		const fullscreenElement = resolveFullscreenElement( cfg.value( 'fullscreenElement', null ) );

		// target with css for fullscreen on small screen devices
		container.classList.add( 'cv-container' );
		container.style.backgroundColor = cfg.themeColorCSS( 'background' );


		const ctx = {
			cfg: cfg,
			container: container,
			workerPools: new WorkerPoolCache ( cfg ),
			glyphStringCache: new Map(),
			materials: null,
			viewer: this,
			renderUtils: new RenderUtils()
		};

		this.ctx = ctx;

		const materials = new Materials( this );

		ctx.materials = materials;

		// the capture session open, if any - see beginCapture(). It is declared ahead of the
		// renderer because the renderer is set up by functions that consult it.

		let capture = null;

		let renderer = new WebGLRenderer( { antialias: true, alpha: true } );

		renderer.outputColorSpace = LinearSRGBColorSpace;

		resetRenderer();

		updatePixelRatio();

		renderer.clear();
		renderer.autoClear = false;

		container.appendChild( renderer.domElement );

		const fog = new FogExp2( cfg.themeColorCSS( 'background' ), 0.0025 );

		const scene = new Scene();
		scene.fog = fog;
		scene.name = 'CV.Viewer';

		const cameraManager = new CameraManager( ctx, renderer, scene );

		// setup lighting
		const lightingManager = new LightingManager( ctx, scene );

		// setup controllers
		const controls = new OrbitControls( cameraManager, renderer.domElement, this );

		this.getControls = function () { return controls; };

		controls.maxPolarAngle = cfg.themeAngle( 'maxPolarAngle' );
		controls.addEventListener( 'change', onCameraMoved );
		controls.addEventListener( 'end', onCameraMoveEnd );

		const cameraMove = new CameraMove( controls, onCameraMoved );
		this.cameraMove = cameraMove;

		// a reader who has asked the system for less motion - the prefers-reduced-motion
		// media query - is taken to the end of each camera move in one frame rather than
		// flown there, and is not auto rotated. The query is watched, so a change of the
		// setting while the viewer is displayed is honoured.

		const motionQuery = ( typeof window.matchMedia === 'function' ) ? window.matchMedia( '(prefers-reduced-motion: reduce)' ) : null;

		if ( motionQuery !== null ) {

			cameraMove.setReducedMotion( motionQuery.matches );
			motionQuery.addEventListener( 'change', onMotionPreference );

		}

		Object.defineProperty( this, 'reducedMotion', {
			get() { return motionQuery !== null && motionQuery.matches; }
		} );

		const moveEndEvent = { type: 'moved', cameraManager: cameraManager };
		const pointerControls = new PointerControls( ctx, renderer.domElement );
		const liveMarkers = new LiveMarkers( ctx, renderer.domElement );
		const surveyTrails = new SurveyTrails( ctx );

		let publicFactory = null;

		const mouse = new Vector2();
		const raycaster = new Raycaster();

		raycaster.layers.enableAll();
		raycaster.params.Points.threshold = 20;

		let terrain = null;
		let survey = null;

		let useFog = false;

		let renderRequired = true;
		let clipped = false;

		// preallocated tmp objects

		const __v = new Vector3();
		const __p = new Vector3();
		const self = this;

		let savedView = null;
		let mouseOver = false;

		// the camera move a focus call is waiting on - see settlePendingMove()
		let pendingMove = null;

		// the media overlay, created by the first setStationMedia() call - see below
		let stationMedia = null;

		// event handler
		window.addEventListener( 'resize', onResize );

		Object.defineProperties( this, {

			'mouseOver': {
				get() { return mouseOver; }
			},

			'reset': {
				set() { setupView( false ); }
			},

			'surveyLoaded': {
				get() { return ( survey !== null ); }
			},

			'terrain': {
				get() { return cameraManager.testCameraLayer( FEATURE_TERRAIN ); },
				set: loadTerrain,
				enumerable: true
			},

			'stationLabelOver': {
				get() { return pointerControls.getStationNameLabelMode(); },
				set: x => { pointerControls.setStationNameLabelMode( x ); },
				enumerable: true
			},

			// the markers an application maintains are kept as models are cleared and
			// loaded, so whether they are labelled is kept with them rather than being
			// among the view settings that each model is displayed with

			'liveMarkerLabels': {
				get() { return liveMarkers.getLabels(); },
				set( x ) {

					liveMarkers.setLabels( x );
					self.dispatchEvent( { type: 'change', name: 'liveMarkerLabels' } );

				}
			},

			// a marker is labelled with a block of lines rather than with the single name a
			// station is labelled with, so its text is drawn smaller than the text of the
			// model's own labels, and a backing is drawn behind the block so that it can be
			// read over the line work of the survey. Both belong to the markers for the same
			// reason as above, and either can be set back to what a marker looked like
			// without it: a size of null is the size the labels of the model are drawn at.

			// how long a marker takes to travel between two stations. An application
			// replaying a log faster than it happened sets this down, and an application
			// scrubbing one sets it to zero so that a marker is placed rather than sent.

			'liveMarkerMoveTime': {
				get() { return liveMarkers.getMoveTime(); },
				set( x ) {

					liveMarkers.setMoveTime( x );
					self.dispatchEvent( { type: 'change', name: 'liveMarkerMoveTime' } );

				}
			},

			'liveMarkerLabelSize': {
				get() { return liveMarkers.getLabelSize(); },
				set( x ) {

					liveMarkers.setLabelSize( x );
					self.dispatchEvent( { type: 'change', name: 'liveMarkerLabelSize' } );

				}
			},

			'liveMarkerLabelBacking': {
				get() { return liveMarkers.getLabelBacking(); },
				set( x ) {

					liveMarkers.setLabelBacking( x );
					self.dispatchEvent( { type: 'change', name: 'liveMarkerLabelBacking' } );

				}
			},

			'terrainShading': {
				get() { return terrain !== null ? terrain.shadingMode : null; },
				set: stateSetter( setTerrainShadingMode, 'terrainShading'),
				enumerable: true
			},

			'hasTerrain': {
				get() { return !! terrain; }
			},

			'hasRealTerrain': {
				get() { return ( terrain && ! terrain.isFlat ); }
			},

			'terrainAttributions': {
				get() { return terrain !== null ? terrain.attributions : []; }
			},

			'terrainDirectionalLighting': {
				get() { return ( lightingManager.lightingMode !== LM_NONE ); },
				set: x => { lightingManager.lightingMode = x ? LM_SINGLE : LM_NONE; },
				enumerable: true
			},

			'terrainLightingMode': {
				get() { return lightingManager.lightingMode; },
				set: stateSetter( mode => { lightingManager.lightingMode = mode; }, 'terrainLightingMode' ),
				enumerable: true
			},

			'terrainShadingModes': {
				get() { return terrain !== null ? terrain.terrainShadingModes : {}; }
			},

			'terrainTileSet': {
				get() { return terrain?.tileSet.bind( terrain ); }
			},

			'terrainDatumShift': {
				get() { return !! terrain?.activeDatumShift; },
				set: stateSetter( x => { terrain?.applyDatumShift( x ); }, 'terrainDatumShift' ),
				enumerable: true
			},

			'terrainDatumShiftValue': {
				get() { return Math.round( terrain.datumShift ); },
				set: stateSetter( x => { terrain.datumShift = x; }, 'terrainDatumShiftValue' )
			},

			'terrainOpacity': {
				get() { return ( terrain !== null ) ? terrain.getOpacity() : 0; },
				set: stateSetter( x => { terrain?.setOpacity( x ); }, 'terrainOpacity' ),
				enumerable: true
			},

			'shadingMode': {
				get() { return survey?.caveShading; },
				set: stateSetter( mode => survey.setShadingMode( mode, false ), 'shadingMode' ),
				enumerable: true
			},

			'hideMode': {
				get() { return survey?.hideMode; },
				set: x => { survey.setHideMode( x ); renderView(); },
				enumerable: true
			},

			'flatShading': {
				get() { return survey?.wallsMode; },
				set: x => { survey.setWallsMode( x ); renderView(); },
				enumerable: true
			},

			'route': {
				get() { return survey?.getRoutes().setRoute; },
				set: x => { survey.getRoutes().setRoute = x; }
			},

			'routeNames': {
				get() { return survey?.getRoutes().getRouteNames(); },
			},

			'surfaceShading': {
				get() { return survey?.surfaceShading; },
				set: stateSetter( mode => survey.setSurfaceShading( mode ), 'surfaceShading' ),
				enumerable: true
			},

			'duplicateShading': {
				get() { return survey?.duplicateShading; },
				set: stateSetter( mode => survey.setDuplicateShading( mode ), 'duplicateShading' ),
				enumerable: true
			},

			'cameraType': {
				get() { return cameraManager.mode; },
				set: stateSetter( mode => cameraManager.setCamera( mode, controls.target ), 'cameraType' ),
				enumerable: true
			},

			'eyeSeparation': {
				get() { return cameraManager.eyeSeparation; },
				set: stateSetter( x => { cameraManager.eyeSeparation = x; }, 'eyeSeparation' )
			},

			'view': {
				get() { return VIEW_PLAN; },
				set: stateSetter( setViewMode, 'view' ),
				enumerable: true
			},

			'cursorHeight': {
				get() { return materials.cursorHeight; },
				set: stateSetter( x => { materials.cursorHeight = x; }, 'cursorHeight' )
			},

			'linewidth': {
				get() { return ( materials.linewidth - 1 ) / 10; },
				set: stateSetter( x => { materials.linewidth = x * 10 + 1; }, 'linewidth' ),
				enumerable: true
			},

			'scaleLinewidth': {
				get() { return materials.scaleLinewidth; },
				set: stateSetter( x => { materials.scaleLinewidth = !! x; }, 'scaleLinewidth' )
			},

			'maxDistance': {
				get() { return ( survey === null ) ? 0 :  survey.getMaxDistance(); }
			},

			'maxHeight': {
				get() { return ( survey === null ) ? 0 : survey.limits.max.z; }
			},

			'minHeight': {
				get() { return ( survey === null ) ? 0 : survey.limits.min.z; }
			},

			'section': {
				get() { return ( survey === null ) ? null : survey.selection.getNode(); },
				set: stateSetter( selectSection, 'section' )
			},

			'sectionByName': {
				get: () => survey?.selection.getName(),
				set: name => { selectSection( survey.selection.getByName( name ) ); }
			},

			'popup': {
				set: x => { pointerControls.setPopup( x ); }
			},

			'highlight': {
				set: stateSetter( node => survey.highlightSelection( node ), 'highlight' )
			},

			'polarAngle': {
				get() { return controls.getPolarAngle(); },
				set: x => { cameraMove.setPolarAngle( x ); }
			},

			'azimuthAngle': {
				set: x => { cameraMove.setAzimuthAngle( x ); }
			},

			'editMode': {
				get() { return pointerControls.getEditMode(); },
				set: stateSetter( x => { pointerControls.setEditMode( x ); }, 'editMode' )
			},

			'setPOI': {
				set: stateSetter( () => cameraMove.start( true ), 'setPOI' )
			},

			'HUD': {
				get() { return hud.getVisibility(); },
				set: x => { hud.setVisibility( x ); },
				enumerable: true
			},

			'cut': {
				set: cutSection
			},

			'zScale': {
				get() { return survey?.zScale; },
				set: stateSetter( x => { survey.zScale = x; }, 'zScale' ),
				enumerable: true
			},

			'autoRotate': {

				// an auto rotation asked for during a capture session is the one resumed when
				// it ends: while it is open the camera moves only as the frames ask

				get() { return ( capture === null ) ? controls.autoRotate : capture.autoRotate; },
				set: stateSetter( x => {

					if ( capture === null ) {

						cameraMove.setAutoRotate( !! x );

					} else {

						capture.autoRotate = !! x;

					}

				}, 'autoRotate' )
			},

			'wheelTilt': {
				get() { return controls.wheelTilt; },
				set( x ) {
					controls.wheelTilt = !! x;
					self.dispatchEvent( { type: 'change', name: 'wheelTilt' } );
				},
				enumerable: true
			},

			'svxControlMode': {
				get() { return controls.svxControlMode; },
				set( x ) {
					controls.svxControlMode = !! x;
					// force refresh of help tab
					self.dispatchEvent( { type: 'newCave', name: 'newCave' } );
				},
				enumerable: true
			},

			'zoomToCursor': {
				get() { return controls.zoomToCursor; },
				set( x ) {
					controls.zoomToCursor = !! x;
					self.dispatchEvent( { type: 'change', name: 'zoomToCursor' } );
				},
				enumerable: true
			},

			'autoRotateSpeed': {
				get() { return controls.autoRotateSpeed / 11; },
				set: stateSetter( setAutoRotateSpeed, 'autoRotateSpeed' )
			},

			'fullscreen': {
				get: isFullscreen,
				set: setFullscreen
			},

			'fullscreenElement': {
				get() { return fullscreenElement; }
			},

			'fog': {
				get() { return useFog; },
				set: stateSetter( setFog, 'fog' ),
				enumerable: true
			},

			'isClipped': {
				get() { return clipped; }
			},

			'maxSnapshotSize': {
				get() {
					if ( renderer === null ) return 0; // disposed - see renderView()

					const context = renderer.getContext();
					return context.getParameter( context.MAX_RENDERBUFFER_SIZE );
				}
			},

			'focalLength': {
				get() { return cameraManager.focalLength; },
				set: setFocalLength,
				enumerable: true
			}
		} );

		enableLayer( FEATURE_BOX,       'box' );
		enableLayer( FEATURE_ENTRANCES, 'entrances' );
		enableLayer( FEATURE_ENTRANCE_DOTS, 'entrance_dots' );
		enableLayer( FEATURE_STATIONS,  'stations' );
		enableLayer( FEATURE_TRACES,    'traces' );
		enableLayer( FEATURE_GRID,      'grid' );
		enableLayer( FACE_SCRAPS,       'scraps' );
		enableLayer( FACE_MODEL,        'model' );
		enableLayer( FACE_WALLS,        'walls' );
		enableLayer( LEG_CAVE,          'legs' );
		enableLayer( LEG_SPLAY,         'splays' );
		enableLayer( LEG_SURFACE,       'surfaceLegs' );
		enableLayer( LEG_DUPLICATE,     'duplicateLegs' );
		enableLayer( LABEL_STATION,     'stationLabels' );
		enableLayer( LABEL_STATION_COMMENT, 'stationComments' );
		enableLayer( SURVEY_WARNINGS,     'warnings' );

		container.addEventListener( 'pointerover', onPointerOver );
		container.addEventListener( 'pointerleave', onPointerLeave );

		fullscreenElement.addEventListener( 'fullscreenchange', onFullscreenChange );
		fullscreenElement.addEventListener( 'webkitfullscreenchange', onFullscreenChange );

		this.addEventListener( 'change', viewChanged );

		cfg.addEventListener( 'colors', () => {

			container.style.backgroundColor = cfg.themeColorCSS( 'background' );

			if ( capture === null ) {

				renderer.setClearColor( cfg.themeColor( 'background' ), 0.0 );

			} else {

				// the frames of a capture stay opaque, on the background they were asked
				// for or on the new one, and the viewer is left on the new one when it ends

				capture.clearColor.copy( cfg.themeColor( 'background' ) );
				capture.clearAlpha = 0.0;

				if ( capture.background === null ) renderer.setClearColor( cfg.themeColor( 'background' ), 1.0 );

			}

			if ( survey ) survey.refreshColors();

			renderView();

		} );

		function onMotionPreference ( event ) {

			cameraMove.setReducedMotion( event.matches );

			// a rotation under way is the motion the reader has just asked to be spared

			if ( event.matches && controls.autoRotate ) self.autoRotate = false;

		}

		function onPointerOver () { mouseOver = true; }

		function onPointerLeave () { mouseOver = false; }

		function viewChanged( event ) {

			if ( survey !== null && event.name === 'splays' ) {

				survey.stations.setSplaysVisibility( self.splays );

			}

		}

		const hud = new HUD( this, renderer );

		const caveLoader = new CaveLoader( ctx );

		hud.getProgressDial( 0 ).watch( caveLoader );

		const viewState = new ViewState( cfg, this );

		this.renderView = renderView;

		onResize();

		function enableLayer ( layerTag, name ) {

			Object.defineProperty( self, name, {
				get() { return cameraManager.testCameraLayer( layerTag ); },
				set( x ) {

					if ( cameraManager.setCameraLayer( layerTag, x ) ) {

						self.dispatchEvent( { type: 'change', name: name } );

					}

					renderView();
				},
				enumerable: true
			} );

			const hasName = 'has' + name.substr( 0, 1 ).toUpperCase() + name.substr( 1 );

			Object.defineProperty( self, hasName, {
				get() { return survey ? survey.hasFeature( layerTag ) : false; }
			} );

		}

		function stateSetter ( modeFunction, name ) {

			return function ( newMode ) {

				modeFunction( isNaN( newMode ) ? newMode : Number( newMode ) );

				self.dispatchEvent( { type: 'change', name: name, value: newMode } );

				renderView();

			};

		}

		function resetRenderer () {

			if ( renderer === null ) return; // disposed - see renderView()

			renderer.setSize( container.clientWidth, container.clientHeight );
			renderer.setPixelRatio( window.devicePixelRatio );
			renderer.setClearColor( cfg.themeColor( 'background' ), 0.0 );
			renderer.setClearAlpha( 0.0 );
			renderer.setRenderTarget( null );

		}

		function updatePixelRatio() {

			// the media query this listens to fires after dispose() as readily as before it

			if ( renderer === null ) return;

			const pr = window.devicePixelRatio;

			// the renderer draws at the capture's density while a session is open, and is
			// returned to the screen's - the new one - when it ends

			if ( capture === null ) {

				renderer.setPixelRatio( pr );

			} else {

				capture.pixelRatioChanged = true;

			}

			matchMedia( `(resolution: ${pr}dppx)` ).addEventListener( 'change', updatePixelRatio, { once: true } );

		}

		function resolveFullscreenElement ( option ) {

			if ( option === null || option === undefined ) return container;

			const element = ( typeof option === 'string' ) ? document.getElementById( option ) : option;

			if ( ! element || ! ( element instanceof Element ) ) {

				console.warn( 'CaveView: the fullscreenElement option names no element - the container is used' );
				return container;

			}

			return element;

		}

		// true while the class alone is displaying the viewer large: from the moment the
		// viewer sets it, which is before the browser is asked for anything, until the
		// document names a fullscreen element. Where the browser refuses - in a frame that
		// is not allowed fullscreen, say - it never does, and what the stylesheet does with
		// the class is all there is. Until the document speaks nothing but this says that
		// the element is covering the page, and that the next request to leave, or a
		// dispose, is what has to uncover it - whether or not the browser has answered yet.

		let fullscreenByClassOnly = false;

		// what has become of a request the browser has yet to answer. It answers some time
		// after the call that asked has returned, and by then the host may have taken the
		// request back or disposed the viewer: a fullscreen granted to a request that
		// nobody is waiting for any more is left again as it arrives.

		const REQUEST_NONE = 0;
		const REQUEST_ASKED = 1;
		const REQUEST_TAKEN_BACK = 2;

		let fullscreenRequest = REQUEST_NONE;

		function reportFullscreen () {

			onResize();
			self.dispatchEvent( { type: 'change', name: 'fullscreen' } );

		}

		function stopListeningForFullscreen () {

			fullscreenElement.removeEventListener( 'fullscreenchange', onFullscreenChange );
			fullscreenElement.removeEventListener( 'webkitfullscreenchange', onFullscreenChange );

		}

		function exitFullscreen () {

			if ( document.fullscreenElement ) {

				document.exitFullscreen();

			} else if ( document.webkitFullscreenElement ) {

				if ( document.webkitExitFullscreen ) {

					document.webkitExitFullscreen();

				} else if ( document.webkitCancelFullScreen ) {

					document.webkitCancelFullScreen();

				}

			}

		}

		function onFullscreenRefused () {

			fullscreenRequest = REQUEST_NONE;

			// disposed while the browser was deciding: this was the answer the listeners
			// were kept for - see dispose()

			if ( renderer === null ) {

				stopListeningForFullscreen();
				return;

			}

			// taken out of the state again meanwhile, or in a fullscreen that came some
			// other way

			if ( ! fullscreenByClassOnly ) return;

			// the class stays, and is now known to be all there will be: the size and the
			// state are reported as a change of fullscreen would have reported them

			reportFullscreen();

		}

		function isFullscreen () {

			if ( fullscreenByClassOnly ) return true;

			// the document says which element is in fullscreen where the API exists. The
			// comparison of the container with the window is kept only for a browser
			// without it: on its own it could not tell a container the host had sized to
			// the window from one in fullscreen.

			if ( 'fullscreenElement' in document ) return document.fullscreenElement === fullscreenElement;
			if ( 'webkitFullscreenElement' in document ) return document.webkitFullscreenElement === fullscreenElement;

			return (
				window.innerHeight === container.clientHeight &&
				window.innerWidth === container.clientWidth
			);

		}

		function onFullscreenChange () {

			const large = document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

			if ( large === fullscreenElement && fullscreenRequest !== REQUEST_NONE ) {

				// the browser's answer to the viewer's own request

				const takenBack = ( fullscreenRequest === REQUEST_TAKEN_BACK );

				fullscreenRequest = REQUEST_NONE;

				if ( renderer === null ) stopListeningForFullscreen();

				if ( takenBack ) {

					// granted after the host had taken the request back, or disposed the
					// viewer: nobody is left who wants it, or who could leave it later

					exitFullscreen();
					return;

				}

			}

			// disposed, and still listening only for that answer

			if ( renderer === null ) return;

			// a fullscreen that did come - asked for by the viewer, or by the host itself
			// after the viewer was refused - is the document's to report from here on

			if ( large !== null ) fullscreenByClassOnly = false;

			if ( isFullscreen() ) {

				fullscreenElement.classList.add( 'toggle-fullscreen' );

			} else {

				fullscreenElement.classList.remove( 'toggle-fullscreen' );

			}

			reportFullscreen();

		}

		function setFullscreen ( targetState ) {

			if ( isFullscreen() === targetState ) return;

			if ( targetState ) {

				// with another element of the page in fullscreen there is nothing to ask the
				// browser for, and the class set on its own would cover what that element is
				// displaying with nothing left to take it off again

				if ( ( document.fullscreenElement ?? document.webkitFullscreenElement ?? null ) !== null ) return;

				// the class is set before the browser is asked, and counts as covering the
				// page from here: a stylesheet that displays the element large by the class
				// already does, whatever the browser goes on to answer

				fullscreenElement.classList.add( 'toggle-fullscreen' );
				fullscreenByClassOnly = true;

				if ( fullscreenRequest !== REQUEST_NONE ) {

					// taken back and asked for again before the browser had answered the
					// first time: that answer serves

					fullscreenRequest = REQUEST_ASKED;
					return;

				}

				if ( document.fullscreenElement === null ) {

					// a browser that refuses says so by rejecting, where it answers at all

					const request = fullscreenElement.requestFullscreen();

					if ( request !== undefined ) {

						fullscreenRequest = REQUEST_ASKED;
						request.catch( onFullscreenRefused );

					}

				} else if ( document.webkitFullscreenElement === null) {

					fullscreenElement.webkitRequestFullscreen();

				}

			} else {

				fullscreenElement.classList.remove( 'toggle-fullscreen' );

				if ( fullscreenByClassOnly ) {

					// there is no fullscreen to leave, and so no event to come: the size
					// and the state are reported from here. A request still with the
					// browser is taken back, so that what it may yet grant is not kept.

					fullscreenByClassOnly = false;

					if ( fullscreenRequest === REQUEST_ASKED ) fullscreenRequest = REQUEST_TAKEN_BACK;

					reportFullscreen();
					return;

				}

				exitFullscreen();

			}

		}

		function setAutoRotateSpeed ( speed ) {

			controls.autoRotateSpeed = Math.max( Math.min( speed, 1.0 ), -1.0 ) * 11;

		}

		function setTerrainShadingMode ( mode ) {

			if ( terrain === null ) return;

			terrain.setShadingMode( mode, renderView );

			if ( terrain.isTiled ) terrain.zoomCheck( cameraManager );

		}


		function setupTerrain ( newTerrain ) {

			if ( newTerrain.isLoaded ) {

				terrain = newTerrain;

				terrain.setup( renderer, scene, survey );

				if ( terrain.isTiled ) {

					terrain.addEventListener( 'progress', onEnd );
					terrain.watch( self );

				}

			}

			setScale();
			setupView( true );

		}

		function setFocalLength( f ) {

			const fChange = f / cameraManager.focalLength;

			cameraManager.focalLength = f;

			// adjust camera position to maintain view
			controls.scaleDolly( fChange );

		}

		function onCameraMoved () {

			if ( survey === null ) return;

			lightingManager.setRotation( cameraManager.getRotation() );

			if ( cameraManager.activeCamera.isOrthographicCamera ) {

				ctx.materials.scale =  cameraManager.activeCamera.zoom * survey.scale.z;

			}

			renderView( true );

		}

		function setViewMode ( mode ) {

			const targetAxis = __v;

			switch ( mode ) {

			case VIEW_NONE:

				return;

			case VIEW_PLAN:

				targetAxis.set( 0, 0, -1 );

				break;

			case VIEW_ELEVATION_N:

				targetAxis.set( 0, 1, 0 );

				break;

			case VIEW_ELEVATION_S:

				targetAxis.set( 0, -1, 0 );

				break;

			case VIEW_ELEVATION_E:

				targetAxis.set( 1, 0, 0 );

				break;

			case VIEW_ELEVATION_W:

				targetAxis.set( -1, 0, 0 );

				break;

			default:

				console.warn( 'invalid view mode specified: ', mode );
				return;

			}

			cameraMove.prepare( survey.getWorldBoundingBox(), targetAxis );
			cameraMove.start( renderRequired );

		}

		function setFog ( enable ) {

			useFog = enable;
			fog.density = useFog ? 0.0025 : 0;

		}

		this.addOverlay = function ( name, overlayProvider ) {

			CommonTerrain.addOverlay( ctx, name, overlayProvider );

		};

		this.addFormatters = function ( stationFormatter ) {

			pointerControls.formatters.station = stationFormatter;

		};

		function cutSection () {

			const selection = survey.selection;

			if ( selection.isEmpty() || selection.isStation() ) return;

			settlePendingMove( new Error( 'cancelled' ) );

			cameraMove.cancel();

			survey.remove( terrain );
			survey.cutSection( selection.getNode() );

			// grab a reference to prevent survey being destroyed in clearView()
			const cutSurvey = survey;

			savedView = viewState.getState();

			// reset view
			self.clearView();

			clipped = true;

			loadSurvey( cutSurvey );

			// move to plan view - required to set zoom limits atm
			cameraMove.prepare( survey.getWorldBoundingBox(), __v.set( 0, 0, -1 ) );
			cameraMove.start( false );

		}

		function selectSection ( node ) {

			if ( node.isStation() ) {

				if ( pointerControls.getEditMode() === MOUSE_MODE_TRACE_EDIT ) {

					pointerControls.selectTraceStation( node );

				} else {

					survey.selectStation( node );

					cameraMove.preparePoint( survey.getWorldPosition( node.clone() ) );

				}

			} else {

				survey.selectSection( node );

				settlePendingMove( new Error( 'cancelled' ) );

				cameraMove.cancel();
				cameraMove.prepare( survey.selection.getWorldBoundingBox() );

				if ( survey.selection.isEmpty() ) cameraMove.start( renderRequired );

			}

		}

		function onResize () {

			if ( renderer === null ) return; // disposed - see renderView()

			// the size a capture session draws at was fixed when it began, from the size the
			// container had then: a resize while it is open is carried out when it ends

			if ( capture !== null ) {

				capture.resizePending = true;
				return;

			}

			// adjust the renderer to the new canvas size
			const w = container.clientWidth;
			const h = container.clientHeight;

			renderer.setSize( w, h );

			self.dispatchEvent( { type: 'resized', name: 'rts', 'width': w, 'height': h } );

			renderView();

		}

		this.addPlugin = function ( plugin ) {

			new plugin( ctx, renderer, scene );

		};

		this.clearView = function () {

			if ( renderer === null ) return; // disposed - see renderView()

			// clear the current cave model, and clear the screen
			renderer.clear();

			hud.setVisibility( false );

			// terminate all running workers (tile loading/wall building etc)
			ctx.workerPools.terminateActive();

			if ( terrain && terrain.isTiled ) {

				terrain.unwatch( self );

			}

			scene.remove( survey );

			controls.enabled = false;

			survey  = null;
			terrain = null;

			cameraManager.resetCameras();

			controls.reset();

			this.dispatchEvent( { type: 'clear' } );

		};

		this.loadSource = function ( source, section = null ) {

			caveLoader.loadSource( source, section ).then(
				surveyData => {

					// the viewer was disposed while the survey was being read, or its
					// coordinate system looked up: there is nothing left to display it in

					if ( renderer === null ) return;

					onResize();

					try {

						loadSurvey( new Survey( ctx, surveyData ) );

					} catch ( e ) {

						alert( e );

					}

				},
				error => {

					// a load that fails after the viewer was disposed - as it does when what
					// it was working with has been let go of - has nobody left to tell

					if ( renderer === null ) return;

					alert( `Failed loading cave information: ${error}.`);
					this.clearView();

				}

			);

			clipped = ( section !== null && section !== '' );

		};

		this.loadCave = function ( file, section ) {

			this.loadSource( new ModelSource( [ { name: file } ], false ), section );

		};

		this.loadCaves = function ( files ) {

			this.loadSource( ModelSource.makeModelSourceFiles( files ) );

		};

		this.setView = function ( properties ) {

			// don't render until all settings made.

			renderRequired = false;

			Object.assign( this, properties );

			renderRequired = true;

			renderView();

		};

		this.saveView = function () {

			viewState.saveState();

		};

		this.resetView = function () {

			viewState.clear();
			this.setView( viewState.getDefaultState() );

		};

		this.getView = function () {

			return viewState.getState();

		};

		function setupView ( final ) {

			if ( savedView === null ) {

				self.setView( viewState.getDefaultState() );

			} else {

				self.setView( savedView );

			}

			if ( final ) {

				savedView = null;
				// signal any listeners that we have a new cave

				self.dispatchEvent( { type: 'newCave', name: 'newCave', survey: survey } );

				controls.setLimits( survey.combinedLimits.getSize( __v ) );

			}

		}

		function loadSurvey ( newSurvey ) {

			// only render after first SetupView()
			renderRequired = false;

			survey = newSurvey;

			hud.getProgressDial( 1 ).watch( survey );

			setScale();

			materials.flushCache();
			publicFactory = new PublicFactory( survey );

			scene.addStatic( survey );
			scene.matrixAutoUpdate = false;

			controls.enabled = true;

			survey.getRoutes().addEventListener( 'changed', onSurveyChanged );
			survey.addEventListener( 'changed', onSurveyChanged );

			self.dispatchEvent( { type: 'newSurvey', name: 'newSurvey', survey: survey, publicFactory: publicFactory } );

			// have we got built in terrain
			let terrain = survey.terrain;

			if ( terrain !== null ) {

				setupTerrain( terrain );

			} else if ( navigator.onLine ) {

				terrain = new WebTerrain( ctx, survey, setupTerrain );

				hud.getProgressDial( 0 ).watch( terrain );

				setupView( false );

			} else {

				setupView( true );

			}

		}

		function onEnd ( event ) {

			if ( event.name === 'end' ) renderView();

		}

		function onSurveyChanged ( /* event */ ) {

			survey.setShadingMode( survey.caveShading );

		}

		function loadTerrain ( mode ) {

			if ( terrain !== null ) {

				terrain.setVisibility( mode );

				cameraManager.setCameraLayer( FEATURE_TERRAIN, mode );

				self.dispatchEvent( { type: 'change', name: 'terrain' } );

				renderView();

			}

		}

		function renderView ( autorotate = false ) {

			// a disposed viewer has nothing to draw with. A host does not always make
			// dispose() its last call: a resize observer, an animation frame or a late
			// event handler of its own can still ask for a frame, and that is nothing to
			// do rather than an exception.

			if ( renderer === null || ! renderRequired || renderer.xr.isPresenting ) return;

			// ignore render requests if we are autorotating so don't need
			// extra render calls

			if ( controls.autoRotate && ! autorotate ) return;

			// while a capture session is open the one frame drawn is the one captureFrame()
			// asks for: anything else would be drawn over the frame being captured, and the
			// state a frame is drawn from is the application's to settle before asking

			if ( capture !== null && ! capture.drawing ) return;

			renderer.clear();

			if ( survey !== null ) {

				survey.update( cameraManager, controls.target );

				if ( useFog ) materials.setFog( true );

				cameraManager.activeRenderer();

			}

			if ( useFog ) materials.setFog( false );

			hud.renderHUD();

			// anything anchored to a position in the model is placed from the camera
			// matrices the frame was rendered with, rather than from those of the one
			// before it, which would leave it a frame behind the model while the view moves

			if ( stationMedia !== null ) stationMedia.reposition();

		}

		this.selectSection = selectSection;
		this.resetRenderer = resetRenderer;
		this.renderView = renderView;
		this.resize = onResize;

		// a move of a single frame - the only kind a reader who prefers reduced motion is
		// given - ends inside the call that starts it. A caller that returns a promise has
		// its listener in place before it moves; one that only says the end of its move is
		// signalled by 'moved' has told its host to listen after the call has returned,
		// which for such a move would be after the only signal there was. Such a caller
		// holds the signal while it starts the move, and gives it once it has returned.

		let moveEndHeld = false;
		let moveEndDue = false;

		function onCameraMoveEnd () {

			if ( moveEndHeld ) {

				moveEndDue = true;
				return;

			}

			self.dispatchEvent( moveEndEvent );

		}

		function holdMoveEnd () {

			moveEndHeld = true;

		}

		function releaseMoveEnd () {

			moveEndHeld = false;

			if ( ! moveEndDue ) return;

			// due until it is given: anything that settles or abandons a move before then
			// gives it first - see settlePendingMove() - so that the end of this move is
			// never taken for the end of the next one

			queueMicrotask( giveMoveEndDue );

		}

		function giveMoveEndDue () {

			if ( ! moveEndDue ) return;

			moveEndDue = false;

			if ( renderer !== null ) self.dispatchEvent( moveEndEvent );

		}

		function setScale () {

			const range = survey.combinedLimits.getSize( __v );

			let hScale = Math.min( container.clientWidth / range.x, container.clientHeight / range.y );

			if ( hScale === Infinity ) hScale = 1;

			// scaling to compensate distortion introduced by projection ( x and y coords only ) - approx only
			const vScale = hScale * survey.scaleFactor;

			survey.setScale( hScale, vScale );

			hud.setScale( vScale );

		}

		this.getMouse = function ( x, y ) {

			const boundingRect = container.getBoundingClientRect();

			mouse.set(
				( ( x - boundingRect.left ) / container.clientWidth ) * 2 - 1,
				- ( ( y - boundingRect.top ) / container.clientHeight ) * 2 + 1
			);

			return mouse;

		};

		this.getStationUnderMouse = function ( mouse, station ) {

			if ( survey === null ) return null;

			this.setRaycaster( raycaster, mouse );

			const hit = raycaster.intersectObject( survey.stations, false )[ 0 ];

			return ( hit !== undefined ) ? survey.getWorldPosition( station.copy( hit.station ) ) : null;

		};

		this.setRaycaster = function ( raycaster, mouse ) {

			raycaster.setFromCamera( mouse, cameraManager.activeCamera );

		};

		this.getLegStats = function ( type ) {

			const legs = survey.getFeature( type );

			return ( legs !== undefined ) ? legs.stats : {
				legs: 0,
				legLength: 0,
				minLegLength: 0,
				maxLegLength: 0
			};

		};

		this.getMetadata = function () {

			return survey.metadata;

		};

		this.getGLTFExport = function ( selection, options, callback ) {

			new ExportGltf( ctx, survey, selection, options, callback );

		};

		this.getSurveyTree = function () {

			return survey.surveyTree;

		};

		this.getStation = function ( path ) {

			const node = survey.surveyTree.getByPath( path );

			if ( node && node.isStation() && node.connections > 0 ) {

				return publicFactory.getStation( node );

			} else {

				return null;

			}

		};

		// a reference identifies a station or survey section by name, as a dotted path
		// or as an array of path components - see Tree.getByRef()

		function getNodeByRef ( ref ) {

			return ( survey === null ) ? null : survey.surveyTree.getByRef( ref );

		}

		function refName ( ref ) {

			return Array.isArray( ref ) ? ref.join( '.' ) : String( ref );

		}

		// settle the move a focus call is waiting on, if any. Cancelling a move ends it
		// at its own target, signalling an end that cannot be told from an arrival, so a
		// move that is abandoned part way is settled before anything cancels it.

		function settlePendingMove ( error ) {

			// the end of a move already made, whose signal has yet to be given, is given
			// before anything is done about the next one

			giveMoveEndDue();

			if ( pendingMove !== null ) pendingMove( error );

		}

		function runCameraMove ( moveFunction ) {

			if ( capture !== null ) {

				return Promise.reject( new Error( 'the camera cannot be moved while a capture session is open' ) );

			}

			// an auto rotation, or a move already in flight, stops a new move being
			// prepared, and an auto rotation never ends by itself. Both are stopped
			// before the listener is added below, so that the end of the abandoned
			// move is not mistaken for the end of the new one.

			settlePendingMove( new Error( 'superseded' ) );

			if ( self.autoRotate ) self.autoRotate = false;

			cameraMove.cancel();

			return new Promise( ( resolve, reject ) => {

				let settled = false;

				function settle ( error ) {

					settled = true;
					pendingMove = null;

					self.removeEventListener( 'moved', onMoved );

					if ( error === undefined ) {

						resolve();

					} else {

						reject( error );

					}

				}

				function onMoved () {

					settle();

				}

				// a move short enough to complete in a single frame signals its end
				// before start() returns, so listen before moving

				self.addEventListener( 'moved', onMoved );

				moveFunction();

				if ( settled ) return;

				// a move that is not required - the camera already has the position
				// and orientation asked for - never runs and so never signals an end

				if ( ! cameraMove.isRunning() ) {

					settle();
					return;

				}

				// the move is only now the one in flight: marking it as pending any
				// earlier would let a cancellation made by moveFunction() itself, while
				// preparing this very move, settle it as abandoned

				pendingMove = settle;

			} );

		}

		this.focusStation = function ( ref, options ) {

			if ( survey === null ) return Promise.reject( new Error( 'No survey loaded' ) );

			const node = getNodeByRef( ref );

			if ( node === null || ! node.isStation() ) {

				return Promise.reject( new Error( `No station [${refName( ref )}] in the loaded survey` ) );

			}

			const highlight = ( options?.highlight !== false );
			const popup = options?.popup;
			const animate = ( options?.animate === true );

			// keepView: centre the station without turning the model, so a reader who has
			// chosen a view keeps looking from that direction. Off by default, so every
			// existing caller sees exactly the behaviour it saw before.
			const keepView = ( options?.keepView === true );

			return runCameraMove( () => {

				// the station is selected directly rather than through selectSection(),
				// which in trace edit mode marks a trace station instead of moving

				survey.selectStation( node );

				const focusTarget = survey.getWorldPosition( node.clone() );

				if ( keepView ) {

					cameraMove.preparePointKeepingView( focusTarget );

				} else {

					cameraMove.preparePoint( focusTarget );

				}

				self.highlight = highlight ? node : survey.surveyTree;

				// setting the popup to the survey tree closes any popup that is open, so
				// an unasked for popup is left as it is rather than closed by default

				if ( popup !== undefined ) self.popup = popup ? node : survey.surveyTree;

				cameraMove.start( true, animate );

			} ).then( () => {

				const pStation = publicFactory.getStation( node );

				// the camera has arrived, so the station is where the media strip expects
				// to find it. Media is displayed with the popup rather than instead of it:
				// the popup cannot hold images and the strip cannot hold the station data.

				if ( popup === true && stationMedia !== null ) stationMedia.show( pStation );

				return pStation;

			} );

		};

		this.focusSurvey = function ( ref, options ) {

			if ( survey === null ) return Promise.reject( new Error( 'No survey loaded' ) );

			const node = getNodeByRef( ref );

			if ( node === null || node.isStation() ) {

				return Promise.reject( new Error( `No survey section [${refName( ref )}] in the loaded survey` ) );

			}

			return runCameraMove( () => {

				selectSection( node );

				cameraMove.start( true, options?.animate === true );

			} );

		};

		/**
		 * Mark a station without moving the camera.
		 *
		 * options.popup opens (or closes) the station's popup as well, which matters
		 * after selecting a survey section: selecting a section replaces the station
		 * selection and closes any popup with it, so a caller that frames a section and
		 * then wants the station still marked needs both back, and neither should
		 * disturb a camera move already in flight.
		 */
		this.highlightStation = function ( ref, options ) {

			const node = getNodeByRef( ref );

			if ( node === null || ! node.isStation() ) return null;

			self.highlight = node;

			if ( options?.popup !== undefined ) {

				self.popup = options.popup ? node : survey.surveyTree;

			}

			return publicFactory.getStation( node );

		};

		this.clearHighlight = function () {

			if ( survey === null ) return;

			self.highlight = survey.surveyTree;

		};

		// the screen position of a station, in pixels from the top left of the container.
		// Returns false for a station with no position on the screen to anchor anything
		// to: one behind the camera, or one the view has been moved off. What is anchored
		// to the station then goes off the screen with it, rather than being held against
		// the edge it left by and pointing at nothing.

		function getStationAnchor ( pStation, target ) {

			if ( survey === null ) return false;

			__p.copy( pStation.station ).applyMatrix4( survey.matrixWorld ).project( cameraManager.activeCamera );

			// projection gives normalised device coordinates: the visible volume is the
			// cube between -1 and 1 in each of the three axes

			if (
				__p.x < -1 || __p.x > 1 ||
				__p.y < -1 || __p.y > 1 ||
				__p.z < -1 || __p.z > 1
			) return false;

			target.set(
				( __p.x + 1 ) / 2 * container.clientWidth,
				( 1 - __p.y ) / 2 * container.clientHeight
			);

			return true;

		}

		function onStationHover ( event ) {

			stationMedia.show( event.station );

		}

		function onStationHoverEnd () {

			stationMedia.hoverEnd();

		}

		this.setStationMedia = function ( source ) {

			if ( stationMedia === null ) {

				stationMedia = new StationMediaOverlay( ctx, getStationAnchor );

				self.addEventListener( 'stationHover', onStationHover );
				pointerControls.addEventListener( 'hoverEnd', onStationHoverEnd );

			}

			stationMedia.setSource( source );

		};

		this.clearStationMedia = function () {

			if ( stationMedia === null ) return;

			self.removeEventListener( 'stationHover', onStationHover );
			pointerControls.removeEventListener( 'hoverEnd', onStationHoverEnd );

			stationMedia.dispose();

			stationMedia = null;

		};

		// markers an application maintains over the loaded model, each identified by a
		// name of its own and placed at a station named by a reference. They are added
		// and moved while the model is displayed, without it being rebuilt or reloaded.

		this.addLiveMarker = function ( id, ref, options ) {

			return liveMarkers.add( id, ref, options );

		};

		this.moveLiveMarker = function ( id, ref, options ) {

			return liveMarkers.move( id, ref, options );

		};

		this.removeLiveMarker = function ( id ) {

			return liveMarkers.remove( id );

		};

		this.clearLiveMarkers = function () {

			liveMarkers.clear();

		};

		this.getLiveMarkers = function () {

			return liveMarkers.list();

		};

		this.setLiveMarkerClusterLabel = function ( func ) {

			liveMarkers.setClusterLabel( func );

		};

		// display a marker's second line without the pointer being on it, for an
		// application asked to show a particular one from outside the model.

		this.revealLiveMarker = function ( id ) {

			return liveMarkers.reveal( id );

		};

		this.clearLiveMarkerReveal = function () {

			liveMarkers.clearReveal();

		};

		// move the camera to take in every marker now displayed - a party spread through
		// the model, or the one place they are all standing - as focusSurvey() takes in a
		// section: from the nearest cardinal direction, and animated unless the reader
		// prefers otherwise. Returns false and leaves the camera as it is when no marker is
		// displayed, so a host can call it on every update without asking first; otherwise
		// true, and the end of the move is signalled by the 'moved' event like any other -
		// always after this call has returned, so that a host can call and then listen:
		// also where the move took a single frame, and where the camera already took the
		// markers in and there was no move to make.

		this.frameLiveMarkers = function ( options = {} ) {

			if ( survey === null || capture !== null ) return false;

			const margin = options.margin ?? 0.05;

			if ( typeof margin !== 'number' || ! ( margin >= 0 ) ) {

				throw new Error( 'the margin about the markers is a fraction of the model\'s extent of at least 0' );

			}

			const box = liveMarkers.getBounds();

			if ( box === null ) return false;

			// a single marker, or markers standing together, give a box with no size, and
			// markers at the edge of their box would be at the edge of the view: the box is
			// grown by a fraction of the model's extent on every side

			const extent = survey.getWorldBoundingBox().getSize( __v );

			box.expandByScalar( margin * Math.max( extent.x, extent.y, extent.z ) );

			// as a focus call does: a move in flight, and a focus call waiting on it, give way

			settlePendingMove( new Error( 'superseded' ) );

			if ( self.autoRotate ) self.autoRotate = false;

			cameraMove.cancel();
			cameraMove.prepare( box );

			// the end of a move made in one frame is signalled after this call has returned,
			// when a host that waits for it can be listening. A move that is not required
			// never runs, and is signalled as ended all the same: the host was told to
			// wait for a signal, and would otherwise wait for one that was never coming.

			holdMoveEnd();

			cameraMove.start( true, options.animate === true );

			if ( ! cameraMove.isRunning() ) moveEndDue = true;

			releaseMoveEnd();

			return true;

		};

		// the way somebody went, over the loaded model: an ordered list of station
		// references drawn as the route the survey joins them by, rather than as straight
		// lines between them. Like the markers above, a trail is the application's and is
		// kept as models are cleared and loaded.

		this.addTrail = function ( id, refs, options ) {

			return surveyTrails.add( id, refs, options );

		};

		this.updateTrail = function ( id, refs, options ) {

			return surveyTrails.update( id, refs, options );

		};

		// how much of a trail is drawn, as a fraction of its length. Separate from
		// updateTrail() because a playback changes only this, and re-routing a trail
		// across the survey on every frame of one would be the expensive half of the work
		// done for nothing.

		this.setTrailProgress = function ( id, value ) {

			return surveyTrails.setProgress( id, value );

		};

		this.removeTrail = function ( id ) {

			return surveyTrails.remove( id );

		};

		this.clearTrails = function () {

			surveyTrails.clear();

		};

		this.getTrails = function () {

			return surveyTrails.list();

		};

		this.showImagePopup = function ( event, imageUrl ) {

			pointerControls.showImagePopup( event, imageUrl );

		};

		this.getSnapshot = function ( exportSize, lineScale ) {

			if ( renderer === null ) throw new Error( 'a snapshot cannot be taken: the viewer has been disposed' );
			if ( capture !== null ) throw new Error( 'a snapshot cannot be taken while a capture session is open' );

			return new Snapshot( ctx, renderer ).getSnapshot( exportSize, lineScale );

		};

		// The camera's direction about the point it looks at: the azimuth about the vertical,
		// and the polar angle from looking straight down (0 is a plan view). Setting them
		// moves the camera at once, with no animation, and draws the view once - or, while a
		// capture session is open, leaves it to the next captured frame. An angle not given
		// is left as it is.

		// the angles are worked out from where the camera is, not taken from the controls:
		// those are the angles of the last change the controls made themselves, and a camera
		// moved by an animation - to one of the toolbar's views, to a station, to the view a
		// model is first shown in - leaves them where they were before the move

		this.getCameraAngles = function () {

			return cameraAngles();

		};

		function cameraAngles () {

			const spherical = controls.getCameraSpherical();

			return { azimuth: normalAngle( spherical.theta ), polar: spherical.phi };

		}

		this.setCameraAngles = function ( angles = {} ) {

			const azimuth = angleOption( angles, 'azimuth' );
			const polar = angleOption( angles, 'polar' );

			if ( capture === null ) {

				// a move in flight would carry on from wherever these put the camera, and a
				// focus call waiting on it is told it will not arrive

				if ( cameraMove.isRunning() && ! controls.autoRotate ) {

					settlePendingMove( new Error( 'superseded' ) );
					cameraMove.cancel();

				}

			}

			const required = renderRequired;

			renderRequired = false;
			setAngles( azimuth, polar );
			renderRequired = required;

			if ( capture === null ) renderView( true );

		};

		function normalAngle ( a ) {

			return Math.atan2( Math.sin( a ), Math.cos( a ) );

		}

		function angleOption ( options, name ) {

			const value = options[ name ];

			if ( value === undefined || value === null ) return undefined;

			if ( typeof value !== 'number' || ! isFinite( value ) ) throw new Error( `the camera ${name} must be a finite number of radians` );

			return value;

		}

		// each rotation is applied as the controls apply a drag of the pointer, and each
		// signals a change of the camera that is drawn - unless drawing is held off, as the
		// callers here hold it off, so that both are drawn as one

		function setAngles ( azimuth, polar ) {

			if ( azimuth === undefined && polar === undefined ) return;

			// the angles the controls hold are those of the last change they made, and a
			// camera placed by anything else - the view a model is first shown in, among
			// them - is not reflected in them until they are next updated. The rotations
			// below are differences from those angles, so they are brought up to date first;
			// an auto rotation would take a step of its own in the update, and is left to
			// the angles it keeps up to date itself.

			if ( ! controls.autoRotate ) controls.update();

			if ( polar !== undefined ) controls.rotateUp( controls.getPolarAngle() - polar );
			if ( azimuth !== undefined ) controls.rotateLeft( controls.getAzimuthalAngle() - azimuth );

		}

		// A capture session draws the view into frames of a size given in pixels, one frame
		// at a time and only when asked, for an application recording the viewer - a movie of
		// it, where each frame must be exactly what its place in the movie says and never what
		// the browser happened to be doing while it was drawn.
		//
		// A frame is what the container shows, at the density width / container width: every
		// size given in the pixels of the page (a marker's dot, the gap before its label, the
		// width of a line, an entrance's dot, the indicators) is that many times as many pixels
		// of the frame, as it is on a screen of that density, and what is sized in the pixels
		// of the screen (the text of the model's labels, a station's dot, a popup) keeps the
		// part of the view it takes on the screen. The text of the live markers is the
		// exception, and is drawn at its size in the pixels of the frame, which is the unit
		// the application gives it in (liveMarkerLabelSize); its default of 12 pixels of the
		// page is 12 times that density. The frame must have the container's shape: the
		// application sizes the container to it before the session begins.
		//
		// While a session is open, nothing is drawn except by captureFrame(), which draws
		// synchronously; the pointer and the keyboard move nothing; an auto rotation is
		// suspended and a camera move in flight ends where it was going; and the live markers
		// move only when a frame asks them to advance, by the milliseconds it names, so that a
		// move of a given duration arrives after exactly that much advancing. Frames are
		// opaque. endCapture() puts everything back as it was.

		const MIN_CAPTURE_SIZE = 16;

		this.beginCapture = function ( options = {} ) {

			if ( renderer === null ) throw new Error( 'a capture session cannot begin: the viewer has been disposed' );
			if ( capture !== null ) throw new Error( 'a capture session is already open' );
			if ( survey === null ) throw new Error( 'a capture session needs a loaded survey' );

			const width = options.width;
			const height = options.height;

			const sizeOk = ( n ) => Number.isInteger( n ) && n >= MIN_CAPTURE_SIZE && n % 2 === 0;

			if ( ! sizeOk( width ) || ! sizeOk( height ) ) {

				throw new Error( `a capture size must be two even whole numbers of pixels of at least ${MIN_CAPTURE_SIZE}, not ${width} by ${height}` );

			}

			const maxSize = self.maxSnapshotSize;

			if ( width > maxSize || height > maxSize ) {

				throw new Error( `a capture of ${width} by ${height} is larger than the ${maxSize} pixels this renderer can draw` );

			}

			const cw = container.clientWidth;
			const ch = container.clientHeight;

			if ( cw === 0 || ch === 0 ) throw new Error( 'a capture session needs a container that is displayed' );

			// the container's width and height are each rounded to a whole pixel of the page,
			// so a container of exactly the frame's shape can be off it by half a pixel on each
			// side: measured along the shorter side, by half a pixel of its own and the other
			// side's half pixel scaled down to it

			const shortSide = Math.min( width, height ) / Math.max( width, height );

			const offShape = ( width >= height )
				? Math.abs( ch - cw * height / width )
				: Math.abs( cw - ch * width / height );

			if ( offShape > 0.5 * ( 1 + shortSide ) + 1e-9 ) {

				throw new Error( `a capture of ${width} by ${height} needs a container of that shape, not one of ${cw} by ${ch}` );

			}

			// everything a frame is drawn from - the camera's shape, the resolution lines are
			// drawn at, the size of the labels, the indicators - was sized at the last resize,
			// which the viewer carries out when the window is resized or it is told to. A
			// container restyled since, without the viewer being told, would be captured as a
			// stretched copy of the old view, so the viewer is brought to the container's size
			// first.

			const laidOut = renderer.getSize( new Vector2() );

			if ( laidOut.x !== cw || laidOut.y !== ch ) onResize();

			const background = ( options.background === undefined || options.background === null ) ? null : new Color( options.background );
			const scale = width / cw;

			capture = {
				width: width,
				height: height,
				background: background,
				drawing: false,
				resizePending: false,
				pixelRatioChanged: false,
				pixelRatio: renderer.getPixelRatio(),
				size: renderer.getSize( new Vector2() ),
				clearColor: renderer.getClearColor( new Color() ),
				clearAlpha: renderer.getClearAlpha(),
				autoRotate: controls.autoRotate,
				enabled: true
			};

			// an auto rotation, or a move in flight, is ended: a move at the place it was
			// going to, which is where a focus call waiting on it is told it did not get

			settlePendingMove( new Error( 'cancelled' ) );
			cameraMove.cancel();
			cameraMove.hold( true );

			// a station the pointer was over is let go: its name would otherwise be drawn in
			// the frames until the pointer's own timer took it away, at a frame decided by the
			// clock rather than by the frame's place in the capture

			pointerControls.endPointerHover();

			capture.enabled = controls.enabled;
			controls.enabled = false;

			// the drawing buffer is exactly the frame. The renderer is told a size in the
			// pixels of the page a quarter of a pixel of the frame larger than the frame
			// divided by the density, so that the whole pixels it takes of the product are
			// the frame's whatever the rounding of the division.

			renderer.setPixelRatio( scale );
			renderer.setSize( ( width + 0.25 ) / scale, ( height + 0.25 ) / scale, false );
			renderer.setClearColor( background ?? cfg.themeColor( 'background' ), 1.0 );

			materials.uniforms.points.pointScale.value = scale / capture.pixelRatio;

			liveMarkers.beginCapture( width, height );

			return { width: renderer.domElement.width, height: renderer.domElement.height };

		};

		this.captureFrame = function ( options = {} ) {

			if ( capture === null ) throw new Error( 'captureFrame() needs an open capture session - see beginCapture()' );

			const advance = options.advance ?? 0;
			const azimuth = angleOption( options, 'azimuth' );
			const polar = angleOption( options, 'polar' );
			const into = options.into ?? null;

			if ( typeof advance !== 'number' || ! isFinite( advance ) || advance < 0 ) {

				throw new Error( 'a captured frame advances the markers by a number of milliseconds of at least 0' );

			}

			if ( advance > 0 ) liveMarkers.advance( advance );

			setAngles( azimuth, polar );

			capture.drawing = true;

			try {

				renderView( true );

			} finally {

				capture.drawing = false;

			}

			// the drawing buffer is not preserved, so what was drawn is copied out now, in
			// the task that drew it

			const canvas = renderer.domElement;

			if ( into !== null ) into.drawImage( canvas, 0, 0, into.canvas.width, into.canvas.height );

			const angles = cameraAngles();

			return {
				canvas: canvas,
				azimuth: angles.azimuth,
				polar: angles.polar,
				moving: liveMarkers.isMoving()
			};

		};

		this.endCapture = function () {

			if ( capture === null || renderer === null ) return;

			const saved = capture;

			capture = null;

			renderer.setPixelRatio( saved.pixelRatioChanged ? window.devicePixelRatio : saved.pixelRatio );
			renderer.setSize( saved.size.x, saved.size.y, false );
			renderer.setClearColor( saved.clearColor, saved.clearAlpha );

			materials.uniforms.points.pointScale.value = 1.0;

			liveMarkers.endCapture();

			cameraMove.hold( false );

			controls.enabled = saved.enabled;

			if ( saved.autoRotate ) cameraMove.setAutoRotate( true );

			if ( saved.resizePending ) {

				onResize();

			} else {

				renderView();

			}

		};

		Object.defineProperty( this, 'capturing', {
			get() { return capture !== null; }
		} );

		this.forEachStation = function ( callback ) {

			survey.stations.forEach( station => callback( publicFactory.getStation( station ) ) );

		};

		this.forEachLeg = function ( callback ) {

			const legs = survey.getFeature( LEG_CAVE );
			legs.forEachLeg( legId => callback( publicFactory.getLeg( legId ) ) );

		};

		this.dispose = function () {

			// a second call has nothing left to let go of

			if ( renderer === null ) return;

			// a capture session open as the viewer is disposed ends with it: there is nothing
			// left to restore, and endCapture() called afterwards has nothing to do

			capture = null;

			this.dispatchEvent( { type: 'dispose' } );

			// a survey still being loaded is given up: what is being fetched or read is
			// aborted where it can be, and a load that completes all the same - one waiting
			// on a coordinate system, say - is dropped as it arrives

			caveLoader.reset();

			// the catalogue of the interface's language outlives the viewer

			cfg.dispose();

			ctx.workerPools.dispose();
			scene.remove( survey );
			controls.dispose();
			hud.dispose();

			ctx.glyphStringCache = null;
			ctx.cfg = null;
			ctx.workerPools = null;
			ctx.materials = null;
			ctx.container = null;

			if ( motionQuery !== null ) motionQuery.removeEventListener( 'change', onMotionPreference );

			window.removeEventListener( 'resize', onResize );

			container.removeChild( renderer.domElement );

			container.removeEventListener( 'pointerover', onPointerOver );
			container.removeEventListener( 'pointerleave', onPointerLeave );

			// a class that is covering the page on its own would go on covering it, with
			// no viewer left to be asked to take it off - and it is covering from the
			// moment it is set, not from the browser's refusal

			if ( fullscreenByClassOnly ) {

				fullscreenElement.classList.remove( 'toggle-fullscreen' );
				fullscreenByClassOnly = false;

			}

			if ( fullscreenRequest === REQUEST_NONE ) {

				stopListeningForFullscreen();

			} else {

				// the browser has yet to answer a request: were it to grant it now, there
				// would be no viewer to leave fullscreen again. The listeners stay for
				// that one answer, which either way is what removes them.

				fullscreenRequest = REQUEST_TAKEN_BACK;

			}

			renderer.clear();
			renderer.dispose();

			renderer = null;

		};

	}

}

export { CaveViewer };