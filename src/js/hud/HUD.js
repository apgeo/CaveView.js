
import { AmbientLight, DirectionalLight, Group, OrthographicCamera, Scene } from '../Three';
import {
	SHADING_CURSOR, SHADING_DEPTH, SHADING_DEPTH_CURSOR, SHADING_HEIGHT, SHADING_INCLINATION, SHADING_LENGTH, SHADING_DISTANCE, LEG_CAVE
} from '../core/constants';

import { AHI } from './AHI';
import { AHIControl } from './AHIControl';
import { AngleScale } from './AngleScale';
import { Compass } from './Compass';
import { CompassControl } from './CompassControl';
import { CursorScale } from './CursorScale';
import { CursorControl } from './CursorControl';
import { LinearScale } from './LinearScale';
import { ProgressDial } from './ProgressDial';
import { ScaleBar } from './ScaleBar';
import { HudObject } from './HudObject';

function HUD ( viewer, renderer ) {

	const self = this;
	const cfg = viewer.ctx.cfg;

	const container = viewer.container;

	const hHeight = container.clientHeight / 2;
	const hWidth  = container.clientWidth / 2;

	let hScale = 0;

	let linearScale = null;
	let cursorScale = null;
	let scaleBar    = null;
	let cursorControl = null;

	let ahi;
	let compass;
	let angleScale;

	// viewer state

	let isVisible = true;
	let caveLoaded = false;

	// create GL scene and camera for overlay
	const camera = new OrthographicCamera( -hWidth, hWidth, hHeight, -hHeight, 1, 1000 );
	camera.position.z = 600;

	const scene = new Scene();
	scene.name = 'HUD';

	// group to simplyfy resize handling
	const attitudeGroup = new Group();
	attitudeGroup.position.set( hWidth, -hHeight, 0 );

	scene.addStatic( attitudeGroup );

	let hudObject = new HudObject( viewer.ctx );

	const aLight = new AmbientLight( 0x888888, Math.PI );
	const dLight = new DirectionalLight( 0xFFFFFF, Math.PI );
	dLight.position.set( -1, 1, 1 );

	scene.addStatic( aLight );
	scene.addStatic( dLight );

	const progressDials = [
		new ProgressDial( hudObject, true, 0, viewer ),
		new ProgressDial( hudObject, false, 1, viewer )
	];

	const progressDial = progressDials [ 0 ];

	newAttitudeGroup();

	attitudeGroup.addStatic( progressDials[ 0 ] );
	attitudeGroup.addStatic( progressDials[ 1 ] );

	viewer.addEventListener( 'newCave', caveChanged );
	viewer.addEventListener( 'change', viewChanged );
	viewer.addEventListener( 'resized', resize );

	cfg.addEventListener( 'change', cfgChanged );
	cfg.addEventListener( 'colors', cfgColorChanged );

	const controls = viewer.getControls();

	const compassControl = new CompassControl( hudObject, viewer );
	const ahiControl = new AHIControl( hudObject, viewer );

	// The two dials - the compass and the inclination - are drawn at the size the theme
	// gives them where the viewer is displayed large, and smaller where it is not: a dial
	// 80 pixels across is a tenth of a large model and a quarter of one set in a column of
	// an article, where it stands over the cave it is there to orient. They are drawn at
	// half that size in a medium or a small container, and at a quarter on a screen as
	// narrow as a telephone's. The configuration may say otherwise: hudScale is a number
	// for every size, or the three by name ({ medium: 0.5, small: 0.5, mobile: 0.25 }).
	//
	// Everything in the group stands about the corner the group is placed at, so scaling
	// the group keeps the dials in their corner; the regions they are driven through are
	// scaled with them.

	const scaleSetting = cfg.value( 'hudScale', null );
	const scaleBySize = Object.assign( { large: 1, medium: 0.5, small: 0.5, mobile: 0.25 }, ( typeof scaleSetting === 'object' && scaleSetting !== null ) ? scaleSetting : {} );

	function dialScale () {

		if ( typeof scaleSetting === 'number' && scaleSetting > 0 ) return scaleSetting;

		const named = viewer.mobile ? scaleBySize.mobile : scaleBySize[ viewer.sizeClass ];

		return ( typeof named === 'number' && named > 0 ) ? named : 1;

	}

	function scaleDials () {

		const scale = dialScale();

		attitudeGroup.scale.set( scale, scale, 1 );
		attitudeGroup.updateMatrix();

		compassControl.setScale( scale );
		ahiControl.setScale( scale );

	}

	scaleDials();

	function i18n ( text ) {

		const tr = cfg.i18n( 'hud.' + text );

		return ( tr === undefined ) ? text : tr;

	}

	this.setVisibility = function ( visible ) {

		progressDial.setVisibility( visible );

		if ( ! caveLoaded ) return;

		compass.visible = visible;
		ahi.visible = visible;

		if ( scaleBar ) scaleBar.visible = visible;

		isVisible = visible;

		// reset correct disposition of colour keys etc.
		if ( linearScale ) {

			if ( visible ) {

				viewChanged ( { type: 'change', name: 'shadingMode' } );

			} else {

				linearScale.visible = false;
				cursorScale.visible = false;
				angleScale.visible = false;

			}

		}

		viewer.renderView();

	};

	this.getVisibility = function () {

		return isVisible;

	};

	this.getProgressDial = function ( ring ) {

		return progressDials[ ring ];

	};

	this.setScale = function ( scale ) {

		hScale = scale;

	};

	function resize () {

		const hWidth  = container.clientWidth / 2;
		const hHeight = container.clientHeight / 2;

		// adjust cameras to new aspect ratio etc.
		camera.left   = -hWidth;
		camera.right  =  hWidth;
		camera.top    =  hHeight;
		camera.bottom = -hHeight;

		camera.updateProjectionMatrix();

		attitudeGroup.position.set( hWidth, -hHeight, 0 );

		// the size the viewer is displayed at may have changed class with its dimensions
		scaleDials();

		newScales();

	}

	this.renderHUD = function () {

		// update HUD components

		const currentCamera = controls.cameraManager.activeCamera;

		compass.set( currentCamera );
		ahi.set( currentCamera );

		updateScaleBar( currentCamera );

		// render on screen
		renderer.clearDepth();
		renderer.render( scene, camera );

	};

	function cfgColorChanged ( /* event */ ) {

		// refresh common config helper
		hudObject = new HudObject( viewer.ctx );

		newAttitudeGroup();
		caveChanged();
	}

	function cfgChanged ( /* event */ ) {

		// only change controls when a cave has been loaded already
		// prevents flicker when racing with i18n resource loading
		if ( caveLoaded ) caveChanged();

	}

	function caveChanged ( /* event */ ) {

		caveLoaded = true;

		newScales();

		viewChanged ( { type: 'change', name: 'shadingMode' } );

	}

	function newAttitudeGroup() {

		if ( ahi ) attitudeGroup.remove( ahi );
		if ( compass ) attitudeGroup.remove( compass );
		if ( angleScale ) attitudeGroup.remove( angleScale );

		ahi = new AHI( hudObject );
		compass = new Compass( hudObject );
		angleScale = new AngleScale( hudObject, i18n( 'inclination' ) );

		attitudeGroup.addStatic( ahi );
		attitudeGroup.addStatic( compass );
		attitudeGroup.addStatic( angleScale );

	}

	function newScales () {

		const hasLegs = viewer.minHeight !== Infinity && viewer.maxHeight !== -Infinity;

		if ( linearScale ) {

			linearScale.dispose();
			scene.remove( linearScale );

		}

		if ( hasLegs ) {

			linearScale = new LinearScale( hudObject, container );
			scene.addStatic( linearScale );

		}

		if ( cursorScale ) {

			cursorScale.dispose();
			scene.remove( cursorScale );

		}

		if ( hasLegs ) {

			cursorScale = new CursorScale( hudObject, container );

			if ( cursorControl ) cursorControl.dispose();

			cursorControl = new CursorControl( hudObject, viewer, cursorScale );

			scene.addStatic( cursorScale );

		}

		if ( scaleBar ) {

			scene.remove( scaleBar );
			scaleBar = null;

		}

		updateScaleBar( controls.cameraManager.activeCamera );

		self.setVisibility( isVisible );

	}

	function viewChanged ( event ) {

		if ( event.name !== 'shadingMode' || ! isVisible || ! caveLoaded ) return;

		// hide all - and only make required elements visible

		angleScale.visible = false;
		linearScale.visible = false;
		cursorScale.visible = false;

		let stats;

		switch ( viewer.shadingMode ) {

		case SHADING_HEIGHT:

			linearScale.visible = true;

			linearScale.setRange( viewer.minHeight, viewer.maxHeight, i18n( 'height' ) );

			break;

		case SHADING_DEPTH:

			linearScale.visible = true;

			linearScale.setRange( viewer.maxHeight - viewer.minHeight, 0, i18n( 'depth' ) );

			break;

		case SHADING_DISTANCE:

			linearScale.visible = true;

			linearScale.setRange( viewer.maxDistance, 0, i18n( 'distance' ) );

			break;

		case SHADING_CURSOR:

			cursorScale.visible = true;

			cursorScale.setRange( viewer.minHeight, viewer.maxHeight, i18n( 'height' ) );

			cursorChanged( { type: 'change', name: 'cursorHeight' } );

			break;

		case SHADING_DEPTH_CURSOR:

			cursorScale.visible = true;

			cursorScale.setRange( viewer.maxHeight - viewer.minHeight, 0, i18n( 'depth' ) );

			cursorChanged( { type: 'change', name: 'cursorHeight' } );

			break;

		case SHADING_LENGTH:

			linearScale.visible = true;

			stats = viewer.getLegStats( LEG_CAVE );
			linearScale.setRange( stats.minLegLength, stats.maxLegLength, i18n( 'leg_length' ) );

			break;

		case SHADING_INCLINATION:

			angleScale.visible = true;

			break;

		}

		if ( cursorScale.visible ) {

			viewer.addEventListener( 'change', cursorChanged );

		} else {

			viewer.removeEventListener( 'change', cursorChanged );

		}

		viewer.renderView();

	}

	function cursorChanged ( event ) {

		if ( event.name !== 'cursorHeight' ) return;

		const cursorHeight = viewer.cursorHeight;
		const range = viewer.maxHeight - viewer.minHeight;

		let scaledHeight = 0;
		let realHeight = 0;

		if ( viewer.shadingMode === SHADING_CURSOR ) {

			scaledHeight = ( viewer.cursorHeight + range / 2 ) / range;
			realHeight = cursorHeight + range / 2 + viewer.minHeight;

		} else {

			scaledHeight = 1 - cursorHeight / range;
			realHeight = cursorHeight;

		}

		scaledHeight = Math.max( Math.min( scaledHeight, 1 ), 0 );

		cursorScale.setCursor( scaledHeight, Math.round( realHeight ) );

	}

	function updateScaleBar ( camera ) {

		if ( camera.isOrthographicCamera ) {

			if ( scaleBar === null ) {

				scaleBar = new ScaleBar( hudObject, viewer.container, hScale, ( hudObject.stdWidth + hudObject.stdMargin ) * 4 );
				scene.addStatic( scaleBar );

			}

			scaleBar.visible = isVisible;
			scaleBar.setScale( camera.zoom );

		} else {

			if ( scaleBar !== null && scaleBar.visible ) scaleBar.visible = false;

		}

	}

	this.dispose = function () {

		ahiControl.dispose();
		compassControl.dispose();
		cursorControl?.dispose();

	};

}

export { HUD };