import {
	CAMERA_ORTHOGRAPHIC, CAMERA_PERSPECTIVE,
	SHADING_CURSOR, SHADING_DEPTH, SHADING_HEIGHT, SHADING_INCLINATION, SHADING_LENGTH,
	SHADING_SINGLE, SHADING_SURVEY, SHADING_PATH, SHADING_DEPTH_CURSOR, SHADING_DISTANCE,
	VIEW_PLAN,
} from '../core/constants';

import { Page } from './Page';

let lastSign = 1;

function clampedInc( value, inc ) {

	let sign = Math.sign( value );

	if ( sign === 0 ) {

		sign = lastSign;

	} else {

		lastSign = sign;

	}

	return sign * Math.max( Math.abs( value ) + inc, 0 );

}

// the kinds of input element that take no typed text: a key pressed in one of them is not
// a character on its way into a field

const untypedInputs = new Set( [ 'checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image' ] );

// whether a key event belongs to a field that is being typed into

function isTextEntry ( element ) {

	if ( ! element || ! element.tagName ) return false;

	switch ( element.tagName ) {

	case 'TEXTAREA':

		return true;

	case 'INPUT':

		return ! untypedInputs.has( element.type );

	default:

		return element.isContentEditable === true;

	}

}

// whether it belongs to a chooser, a tick box, a slider or the like: a control that takes
// no text and still has uses of its own for a key

function isFormControl ( element ) {

	return !! element && ( element.tagName === 'SELECT' || element.tagName === 'INPUT' );

}

// the keys a chooser is stepped with from one entry to the next, and a slider along its
// range. The viewer has no use of its own for any of them.

const steppingKeys = new Set( [ 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown' ] );

// whether a key is one the control it was pressed in is stepped with: a tick box and a
// button are not stepped at all

function isSteppingKey ( element, key ) {

	if ( ! steppingKeys.has( key ) ) return false;

	return element.tagName === 'SELECT' || element.type === 'range' || element.type === 'radio';

}

function KeyboardControls ( viewer, fileSelector, avenControls ) {

	document.addEventListener( 'keydown', keyDown );

	// the controls that are part of the viewer: those of the side panel, which is
	// displayed in the viewer's container, and those of a toolbar, which the host may
	// have placed in an element of its own outside it

	function isOwnControl ( element ) {

		return viewer.container.contains( element ) || element.closest( '.cv-toolbar' ) !== null;

	}

	function keyDown ( event ) {

		if ( ! viewer.surveyLoaded || ! viewer.mouseOver || viewer.capturing ) return;

		const target = event.target;

		// a key typed into a text field is the field's, whether or not the pointer
		// happens to rest over the model: handling it here would cancel the keystroke
		// and leave the field without the character

		if ( isTextEntry( target ) ) return;

		// a chooser or a tick box of the host page keeps its keys as well. One of the
		// viewer's own does not: it keeps the focus after it has been used, and a press
		// on the model does not take the focus from it, so leaving it its keys would
		// leave the viewer without any of its own for as long as the reader stayed on
		// the model. What it does keep are the keys it is stepped with, which the
		// viewer does nothing with and would only cancel: a slider of the side panel
		// or the toolbar's chooser, once pressed, is still worked with the arrows.

		if ( isFormControl( target ) && ( ! isOwnControl( target ) || isSteppingKey( target, event.key ) ) ) return;

		event.preventDefault(); // enables F5, ctrl+<F5>, ctrl+<F> and other keys on the control's host page

		if ( handleKeyCommon( event ) ) return;

		if ( avenControls ) {

			handleKeyAven( event );

		} else {

			handleKeyDefault( event );

		}

	}

	function handleKeyAven( event ) {

		if ( event.ctrlKey ) {

			switch ( event.key ) {

			case 'b':

				viewer.box = ! viewer.box;
				break;

			case 'e':

				viewer.wheelTilt = ! viewer.wheelTilt;
				break;

			case 'f':

				if ( viewer.hasSurfaceLegs ) viewer.surfaceLegs = ! viewer.surfaceLegs;
				break;

			case 'l':

				if ( viewer.hasLegs ) viewer.legs = ! viewer.legs;
				break;

			case 'n': // (not available in Chrome)

				if ( viewer.hasStationLabels ) viewer.stationLabels = ! viewer.stationLabels;
				break;

			case 'x':

				viewer.stations = ! viewer.stations;
				break;

			}

		} else {

			switch ( event.key ) {

			case 'Delete': // '<delete>' reset view

				viewer.reset = true;
				break;

			case 'Enter':

				viewer.autoRotate = true;
				break;

			case ' ':

				viewer.autoRotate = ! viewer.autoRotate;
				break;

			case 'l': // elevation

				viewer.polarAngle = Math.PI / 2;
				break;

			case 'e': // East

				viewer.azimuthAngle = 3 * Math.PI / 2;
				break;

			case 'n': // North

				viewer.azimuthAngle = 0;
				break;

			case 'p': // plan

				viewer.polarAngle = 0;
				break;

			case 'r': // reverse rotation direction

				viewer.autoRotateSpeed *= -1;
				break;

			case 's': // South

				viewer.azimuthAngle = Math.PI;
				break;

			case 'w': // West

				viewer.azimuthAngle = Math.PI / 2;
				break;

			case 'c': // rotate clockwise

				viewer.autoRotateSpeed = - Math.abs( viewer.autoRotateSpeed );
				break;

			case 'v': // rotate anticlockwise

				viewer.autoRotateSpeed = Math.abs( viewer.autoRotateSpeed );
				break;

			case 'x': // decrease rotation speed

				viewer.autoRotateSpeed = clampedInc( viewer.autoRotateSpeed, -0.1 );
				break;

			case 'z': // increase rotation speed

				viewer.autoRotateSpeed = clampedInc( viewer.autoRotateSpeed, 0.1 );
				break;

			}

		}

	}

	function handleKeyDefault( event ) {

		if ( event.ctrlKey ) return;

		switch ( event.key ) {

		case 'c': // toggle scraps visibility

			if ( viewer.hasScraps ) viewer.scraps = ! viewer.scraps;
			break;

		case 'd': // toggle dye traces visibility

			if ( viewer.hasTraces ) viewer.traces = ! viewer.traces;
			break;

		case 'f': // toggle full screen

			viewer.fullscreen = ! viewer.fullscreen;
			break;

		case 'j': // toggle entrance labels

			if ( viewer.hasStationLabels ) viewer.stationLabels = ! viewer.stationLabels;
			break;

		case 'l': // toggle entrance labels

			if ( viewer.hasEntrances ) viewer.entrances = ! viewer.entrances;
			break;

		case 'n': // load next cave in list

			fileSelector.nextSource();
			break;

		case 'o': // switch view to orthoganal'

			viewer.cameraType = CAMERA_ORTHOGRAPHIC;
			break;

		case 'p': // switch view to perspective

			viewer.cameraType = CAMERA_PERSPECTIVE;
			break;

		case 'q': // switch view to perspective

			if ( viewer.hasSplays ) viewer.splays = ! viewer.splays;
			break;

		case 'r': // reset camera positions and settings to initial plan view

			viewer.view = VIEW_PLAN;
			break;

		case 's': // surface leg visibility

			if ( viewer.hasSurfaceLegs ) viewer.surfaceLegs = ! viewer.surfaceLegs;
			break;

		case 't': // switch terrain on/off

			if ( viewer.hasTerrain ) viewer.terrain = ! viewer.terrain;
			break;

		case 'v': // cut selected survey section

			Page.clear();
			viewer.cut = true;

			break;

		case 'w': // switch walls on/off

			if ( viewer.hasWalls ) viewer.walls = ! viewer.walls;
			break;

		case 'x': // look at last POI

			viewer.setPOI = true; // actual value here is ignored.
			break;

		case 'z': // show station markers

			viewer.stations = ! viewer.stations;
			break;

		case ']':

			viewer.cursorHeight++;
			break;

		case '[':

			viewer.cursorHeight--;
			break;

		}

	}

	function handleKeyCommon( event ) {

		if ( event.ctrlKey ) return false;

		let handled = true;

		if ( event.altKey ) {

			switch ( event.key ) {

			case 's':

				viewer.svxControlMode = ! viewer.svxControlMode;
				break;

			case 'e': // toggle entrance labels

				viewer.entrances = ! viewer.entrances;
				break;

			case 'f':

				viewer.flatShading = ! viewer.flatShading;
				break;

			case 'h':

				viewer.hideMode = ! viewer.hideMode;
				break;

			case 'l':

				viewer.stationLabelOver = ! viewer.stationLabelOver;
				break;

			case 'x':

				viewer.zoomToCursor = ! viewer.zoomToCursor;
				break;

			default:

				handled = false;

			}

		} else {

			switch ( event.key ) {

			case '0': // change colouring scheme to distance

				viewer.shadingMode = SHADING_DISTANCE;
				break;

			case '1': // change colouring scheme to depth

				viewer.shadingMode = SHADING_HEIGHT;
				break;

			case '2': // change colouring scheme to angle

				viewer.shadingMode = SHADING_INCLINATION;
				break;

			case '3': // change colouring scheme to length

				viewer.shadingMode = SHADING_LENGTH;
				break;

			case '4': // change colouring scheme to height cursor

				viewer.shadingMode = SHADING_CURSOR;
				break;

			case '5': // change colouring scheme to white

				viewer.shadingMode = SHADING_SINGLE;
				break;

			case '6': // change colouring scheme to per survey section

				viewer.shadingMode = SHADING_SURVEY;
				break;

			case '7': // change colouring scheme to per survey section

				viewer.shadingMode = SHADING_PATH;
				break;

			case '8': // change colouring scheme to per survey section

				viewer.shadingMode = SHADING_DEPTH;
				break;

			case '9': // change colouring scheme to depth

				viewer.shadingMode = SHADING_DEPTH_CURSOR;
				break;

			case 'f': // toggle full screen

				viewer.fullscreen = ! viewer.fullscreen;
				break;

			case 'j': // toggle entrance labels

				if ( viewer.hasStationLabels ) viewer.stationLabels = ! viewer.stationLabels;
				break;

			case 'o': // switch view to orthoganal

				viewer.cameraType = CAMERA_ORTHOGRAPHIC;
				break;

			case 'q': // toggle splays

				if ( viewer.hasSplays ) viewer.splays = ! viewer.splays;
				break;

			case 't': // switch terrain on/off

				if ( viewer.hasTerrain ) viewer.terrain = ! viewer.terrain;
				break;

			case '+': // increase cursor depth

				viewer.cursorHeight++;
				break;

			case '-': // decrease cursor depth

				viewer.cursorHeight--;
				break;

			case '<': // decrease terrain opacity

				if ( viewer.hasTerrain ) viewer.terrainOpacity = Math.max( viewer.terrainOpacity - 0.05, 0 );
				break;

			case '>': // increase terrain opacity

				if ( viewer.hasTerrain ) viewer.terrainOpacity = Math.min( viewer.terrainOpacity + 0.05, 1 );
				break;

			case '(':

				viewer.focalLength = Math.max( 10, viewer.focalLength - 10 );
				break;

			case ')':

				viewer.focalLength = Math.min( 300, viewer.focalLength + 10 );
				break;

			default:

				handled = false;

			}

		}

		return handled;

	}

	this.dispose = function () {

		document.removeEventListener( 'keydown', keyDown );

	};

}

export { KeyboardControls };