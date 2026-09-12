import {
	CAMERA_ORTHOGRAPHIC, CAMERA_PERSPECTIVE,
	SHADING_CURSOR, SHADING_DEPTH, SHADING_DEPTH_CURSOR, SHADING_DISTANCE, SHADING_HEIGHT,
	SHADING_INCLINATION, SHADING_LENGTH, SHADING_PATH, SHADING_SINGLE, SHADING_SURVEY,
	VIEW_ELEVATION_E, VIEW_ELEVATION_N, VIEW_ELEVATION_S, VIEW_ELEVATION_W, VIEW_PLAN
} from '../core/constants';

import { coarsePointer } from './PointerGestures';

const SVG_NS = 'http://www.w3.org/2000/svg';

// distance in pixels between the toolbar and the edge of the container it is placed
// against, where the application sets none of its own

const EDGE_OFFSET = 8;

// how big a control has to be depends on what is pointing at it and not on how big the
// screen is: a phone held sideways is wider than a small laptop and is still driven with a
// finger, which needs a target a mouse pointer does not. Each set below is only what the
// custom properties fall back to, so a size set by the application is still the one used,
// whichever pointer the viewer is being driven with.

const fineSizes = {
	button: '28px',
	icon: '18',
	gap: '2px',
	padding: '3px',
	selectWidth: '130px',
	fontSize: '12px',
	barWidth: 'auto'
};

// 44px is the smallest target a finger reaches reliably, and a list needs text of at least
// 16px for a browser not to zoom the page in as it is opened

const coarseSizes = {
	button: '44px',
	icon: '24',
	gap: '4px',
	padding: '6px',
	selectWidth: '160px',
	fontSize: '16px',
	// a bar centred by being placed at the middle of the container and pulled back by half
	// of itself is offered only the half of the container it starts at, which is room for
	// a row of controls the size a mouse needs but not for one the size a finger needs -
	// where the rest of the width is the difference between a bar of two rows and a block
	// of six. Sizing to the content rather than to what is offered, capped at the width of
	// the container by the max-width below, lets the wider row wrap across the whole of it.
	barWidth: 'max-content'
};

// appearance is taken from CSS custom properties, which may be set on the container or on
// any of its ancestors. The second argument of each var() is the value used where the
// property is not set, so the toolbar is usable without a stylesheet of its own.

function barStyle ( sizes ) {

	return {
		'position': 'absolute',
		'left': '50%',
		'transform': 'translateX( -50% )',
		'display': 'flex',
		'flex-wrap': 'wrap',
		'justify-content': 'center',
		'align-items': 'center',
		'box-sizing': 'border-box',
		'width': sizes.barWidth,
		'max-width': '100%',
		// a row too wide to wrap - one long control - is scrolled rather than left
		// hanging over the edge of the container
		'overflow-x': 'auto',
		'gap': `var( --cv-toolbar-gap, ${sizes.gap} )`,
		'padding': `var( --cv-toolbar-padding, ${sizes.padding} )`,
		'background': 'var( --cv-toolbar-background, rgba( 34, 34, 34, 0.85 ) )',
		'border': 'var( --cv-toolbar-border, 1px solid #808080 )',
		'border-radius': 'var( --cv-toolbar-radius, 3px )',
		'font-family': 'var( --cv-toolbar-font, sans-serif )',
		// a tap is acted on as it is made, rather than after the wait for a second tap
		// that would have zoomed the page
		'touch-action': 'manipulation',
		// the side panel of the user interface is above the toolbar
		'z-index': 'var( --cv-toolbar-z-index, 8 )'
	};

}

function buttonStyle ( sizes ) {

	return {
		'display': 'flex',
		'align-items': 'center',
		'justify-content': 'center',
		'box-sizing': 'border-box',
		'flex': 'none',
		'width': `var( --cv-toolbar-button-size, ${sizes.button} )`,
		'height': `var( --cv-toolbar-button-size, ${sizes.button} )`,
		'padding': '0',
		'border': 'var( --cv-toolbar-button-border, 1px solid transparent )',
		'border-radius': 'var( --cv-toolbar-radius, 3px )',
		'background': 'var( --cv-toolbar-button-background, transparent )',
		'color': 'var( --cv-toolbar-color, #dddddd )',
		'cursor': 'pointer'
	};

}

function selectStyle ( sizes ) {

	return {
		'box-sizing': 'border-box',
		'height': `var( --cv-toolbar-button-size, ${sizes.button} )`,
		'max-width': `var( --cv-toolbar-select-width, ${sizes.selectWidth} )`,
		// a flex item does not shrink below the width of its content unless it is allowed
		// to, which would widen the whole bar to fit the longest mode name
		'min-width': '0',
		'border': 'var( --cv-toolbar-button-border, 1px solid transparent )',
		'border-radius': 'var( --cv-toolbar-radius, 3px )',
		'background': 'var( --cv-toolbar-button-background, transparent )',
		'color': 'var( --cv-toolbar-color, #dddddd )',
		'font-family': 'inherit',
		'font-size': `var( --cv-toolbar-font-size, ${sizes.fontSize} )`,
		'cursor': 'pointer'
	};

}

// icons are drawn rather than loaded, so that the toolbar needs no font and no file of
// its own. Shapes are stroked in the colour of the button, which changes with its state.

const icons = {
	stations: [
		{ tag: 'circle', cx: 6, cy: 16, r: 1.7, fill: 'currentColor', stroke: 'none' },
		{ tag: 'circle', cx: 12, cy: 8, r: 1.7, fill: 'currentColor', stroke: 'none' },
		{ tag: 'circle', cx: 18, cy: 15, r: 1.7, fill: 'currentColor', stroke: 'none' }
	],
	stationLabels: [
		{ tag: 'circle', cx: 5, cy: 12, r: 1.7, fill: 'currentColor', stroke: 'none' },
		{ tag: 'path', d: 'M10 9h10M10 15h7' }
	],
	stationComments: [
		{ tag: 'path', d: 'M4 5h16v10h-9l-4 4v-4H4z' }
	],
	splays: [
		{ tag: 'circle', cx: 12, cy: 12, r: 1.7, fill: 'currentColor', stroke: 'none' },
		{ tag: 'path', d: 'M12 12L4 6M12 12l8-5M12 12l-7 7M12 12l7 6M12 12V4' }
	],
	walls: [
		{ tag: 'path', d: 'M7 3c-2 6 2 12 0 18M17 3c2 6-2 12 0 18' }
	],
	scraps: [
		{ tag: 'path', d: 'M7 3c-2 6 2 12 0 18h10c-2-6 2-12 0-18z', fill: 'currentColor', 'fill-opacity': '0.35' }
	],
	entrances: [
		{ tag: 'path', d: 'M6 20v-7a6 6 0 0 1 12 0v7M3 20h18' }
	],
	boundingBox: [
		{ tag: 'path', d: 'M4 8h12v12H4zM4 8l4-4h12v12l-4 4M16 8l4-4' }
	],
	viewNorth: [
		{ tag: 'circle', cx: 12, cy: 12, r: 8.5 },
		{ tag: 'path', d: 'M12 5l3.5 7h-7z', fill: 'currentColor' }
	],
	viewEast: [
		{ tag: 'circle', cx: 12, cy: 12, r: 8.5 },
		{ tag: 'path', d: 'M19 12l-7 3.5v-7z', fill: 'currentColor' }
	],
	viewSouth: [
		{ tag: 'circle', cx: 12, cy: 12, r: 8.5 },
		{ tag: 'path', d: 'M12 19l-3.5-7h7z', fill: 'currentColor' }
	],
	viewWest: [
		{ tag: 'circle', cx: 12, cy: 12, r: 8.5 },
		{ tag: 'path', d: 'M5 12l7-3.5v7z', fill: 'currentColor' }
	],
	viewPlan: [
		{ tag: 'rect', x: 4, y: 4, width: 16, height: 16, rx: 1 },
		{ tag: 'path', d: 'M12 4v16M4 12h16' }
	],
	cameraOrthographic: [
		{ tag: 'rect', x: 7, y: 5, width: 10, height: 14 },
		{ tag: 'path', d: 'M2 6h5M2 18h5M17 6h5M17 18h5' }
	],
	cameraPerspective: [
		{ tag: 'path', d: 'M8 5l12 4v6l-12 4z' },
		{ tag: 'path', d: 'M2 12l6-7M2 12l6 7' }
	],
	autoRotate: [
		{ tag: 'path', d: 'M12 4a8 8 0 1 1-8 8' },
		{ tag: 'path', d: 'M9 1l3 3-3 3' }
	],
	fullscreen: [
		{ tag: 'path', d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }
	]
};

// each control drives a documented property of the viewer. A toggle inverts a boolean
// property, a value sets the property to one of its constants and is displayed as active
// while the property holds it, and an action sets the property without a state of its own
// to display - a viewpoint is a move the camera makes rather than a mode it stays in.
// Where the viewer also reports whether the loaded model holds what the property displays,
// the control is disabled while it holds none of it - see featureTest() below.

const definitions = {
	stations: { property: 'stations', type: 'toggle' },
	stationLabels: { property: 'stationLabels', type: 'toggle' },
	stationComments: { property: 'stationComments', type: 'toggle' },
	splays: { property: 'splays', type: 'toggle' },
	walls: { property: 'walls', type: 'toggle' },
	scraps: { property: 'scraps', type: 'toggle' },
	entrances: { property: 'entrances', type: 'toggle' },
	boundingBox: { property: 'box', type: 'toggle' },
	viewNorth: { property: 'view', type: 'action', value: VIEW_ELEVATION_N, constant: 'VIEW_ELEVATION_N' },
	viewEast: { property: 'view', type: 'action', value: VIEW_ELEVATION_E, constant: 'VIEW_ELEVATION_E' },
	viewSouth: { property: 'view', type: 'action', value: VIEW_ELEVATION_S, constant: 'VIEW_ELEVATION_S' },
	viewWest: { property: 'view', type: 'action', value: VIEW_ELEVATION_W, constant: 'VIEW_ELEVATION_W' },
	viewPlan: { property: 'view', type: 'action', value: VIEW_PLAN, constant: 'VIEW_PLAN' },
	cameraOrthographic: { property: 'cameraType', type: 'value', value: CAMERA_ORTHOGRAPHIC, constant: 'CAMERA_ORTHOGRAPHIC' },
	cameraPerspective: { property: 'cameraType', type: 'value', value: CAMERA_PERSPECTIVE, constant: 'CAMERA_PERSPECTIVE' },
	shadingMode: { property: 'shadingMode', type: 'shading' },
	autoRotate: { property: 'autoRotate', type: 'toggle' },
	fullscreen: { property: 'fullscreen', type: 'toggle', needsSurvey: false }
};

const defaultButtons = Object.keys( definitions );

// the shading modes of the cave, as the settings page offers them. The depth modes are
// only offered where the model has a terrain to measure depth from.
//
// each mode is named by the string the settings page displays for it. A translation is
// looked up by its whole path from the root of the dictionary, where these strings are
// held under the name of that page, so the prefix belongs in the lookup below.

const SHADING_TEXT_PREFIX = 'settings.';

const legShadingModes = [
	{ key: 'shading.height', constant: 'SHADING_HEIGHT', value: SHADING_HEIGHT },
	{ key: 'shading.length', constant: 'SHADING_LENGTH', value: SHADING_LENGTH, legs: true },
	{ key: 'shading.inclination', constant: 'SHADING_INCLINATION', value: SHADING_INCLINATION, legs: true },
	{ key: 'shading.height_cursor', constant: 'SHADING_CURSOR', value: SHADING_CURSOR },
	{ key: 'shading.fixed', constant: 'SHADING_SINGLE', value: SHADING_SINGLE },
	{ key: 'shading.survey', constant: 'SHADING_SURVEY', value: SHADING_SURVEY, legs: true },
	{ key: 'shading.route', constant: 'SHADING_PATH', value: SHADING_PATH, legs: true },
	{ key: 'shading.distance', constant: 'SHADING_DISTANCE', value: SHADING_DISTANCE, legs: true },
	{ key: 'shading.depth', constant: 'SHADING_DEPTH', value: SHADING_DEPTH, terrain: true },
	{ key: 'shading.depth_cursor', constant: 'SHADING_DEPTH_CURSOR', value: SHADING_DEPTH_CURSOR, terrain: true }
];

function setStyle ( element, properties ) {

	for ( const name in properties ) element.style.setProperty( name, properties[ name ] );

}

function icon ( shapes, size ) {

	const svg = document.createElementNS( SVG_NS, 'svg' );

	svg.setAttribute( 'viewBox', '0 0 24 24' );
	svg.setAttribute( 'width', size );
	svg.setAttribute( 'height', size );
	svg.setAttribute( 'fill', 'none' );
	svg.setAttribute( 'stroke', 'currentColor' );
	svg.setAttribute( 'stroke-width', '1.5' );
	svg.setAttribute( 'stroke-linecap', 'round' );
	svg.setAttribute( 'stroke-linejoin', 'round' );

	shapes.forEach( shape => {

		const element = document.createElementNS( SVG_NS, shape.tag );

		for ( const name in shape ) {

			if ( name !== 'tag' ) element.setAttribute( name, shape[ name ] );

		}

		svg.appendChild( element );

	} );

	return svg;

}

class CaveViewToolbar {

	constructor ( viewer, container, options = {} ) {

		const target = ( typeof container === 'string' ) ? document.getElementById( container ) : container;

		if ( ! target ) throw new Error( `No container DOM object [${container}] available` );

		const cfg = viewer.ctx.cfg;

		// the pointer the toolbar is sized for, which a device may gain or lose while it
		// is displaying one

		const pointerQuery = coarsePointer();

		let sizes = pointerQuery.matches ? coarseSizes : fineSizes;

		const bar = document.createElement( 'div' );

		bar.classList.add( 'cv-toolbar' );

		setStyle( bar, barStyle( sizes ) );

		// the toolbar is placed against one edge of the container, which must be a
		// positioned element - the container of a viewer is

		const edge = ( options.placement === 'bottom' ) ? 'bottom' : 'top';

		const controls = [];
		const listeners = [];
		const iconElements = [];

		// only the viewer container is displayed fullscreen, so a toolbar added to an element
		// outside it is not on screen for as long as that lasts. It is moved into the container
		// for the duration and returned to where it was afterwards; where it was is held here,
		// and is null whenever the toolbar is in the place the application put it.

		const viewerContainer = viewer.container;

		let displaced = null;
		let shadingSelect = null;

		( options.buttons ?? defaultButtons ).forEach( addControl );

		target.appendChild( bar );

		placeAgainstEdge();

		viewer.addEventListener( 'change', onChange );
		viewer.addEventListener( 'newCave', onModelChange );
		viewer.addEventListener( 'clear', onModelChange );
		viewer.addEventListener( 'resized', placeAgainstEdge );
		viewer.addEventListener( 'dispose', dispose );

		// the fullscreen events reach the document whichever element was displayed

		addListener( document, 'fullscreenchange', onFullscreenChange );
		addListener( document, 'webkitfullscreenchange', onFullscreenChange );

		addListener( pointerQuery, 'change', onPointerChange );

		onModelChange();

		this.dispose = dispose;

		return;

		// the tab strip of the user interface stands above the toolbar, which is what keeps
		// the side panel reachable while a toolbar is displayed over the model. On a narrow
		// screen that strip lies right across the top of the container rather than down one
		// side of it, where it would cover a toolbar placed against the same edge. What is
		// there is measured rather than assumed, so a bar at the top clears it whether or
		// not the side panel is in use, and is placed as it always was where it is not.

		function edgeClearance () {

			// a toolbar added to an element outside the viewer is not over the model, and
			// so has nothing of the viewer to clear

			if ( edge === 'bottom' || ! viewerContainer.contains( bar ) ) return 0;

			const tabs = viewerContainer.querySelector( '.cv-tab-box' );

			if ( tabs === null ) return 0;

			const tabsRect = tabs.getBoundingClientRect();
			const containerRect = viewerContainer.getBoundingClientRect();

			// the bar is centred in the container, so only something reaching from one
			// edge of it to the other cannot be avoided by staying where it is

			if ( tabsRect.left > containerRect.left + 1 || tabsRect.right < containerRect.right - 1 ) return 0;

			return Math.max( 0, tabsRect.bottom - containerRect.top );

		}

		function placeAgainstEdge () {

			bar.style.setProperty( edge, `var( --cv-toolbar-offset, ${EDGE_OFFSET + edgeClearance()}px )` );

		}

		function addListener ( element, type, handler ) {

			element.addEventListener( type, handler );

			listeners.push( { element: element, type: type, handler: handler } );

		}

		function addControl ( id ) {

			const definition = definitions[ id ];

			if ( definition === undefined ) {

				console.warn( 'unknown toolbar button', id );
				return;

			}

			if ( definition.type === 'shading' ) {

				addShadingSelect( id, definition );

			} else {

				addButton( id, definition );

			}

		}

		function controlTitle ( definition ) {

			// the property a control drives is named, rather than described: what the
			// button does is then the same question as what the documented property does

			return ( definition.constant === undefined )
				? definition.property
				: `${definition.property} = CV2.${definition.constant}`;

		}

		// the viewer reports what the loaded model holds as a property named after the one
		// that displays it, so both the name of the test and whether there is one to make
		// are taken from the viewer, rather than from a list a later control can be left
		// off. A property that displays nothing a model may lack has no such test.

		function featureTest ( definition ) {

			const property = definition.property;
			const name = `has${property.charAt( 0 ).toUpperCase()}${property.slice( 1 )}`;

			return ( name in viewer ) ? name : null;

		}

		function addButton ( id, definition ) {

			const button = document.createElement( 'button' );
			const title = controlTitle( definition );

			button.type = 'button';
			button.title = title;

			button.classList.add( 'cv-toolbar-button', `cv-toolbar-${id}` );
			button.setAttribute( 'aria-label', title );

			setStyle( button, buttonStyle( sizes ) );

			const image = icon( icons[ id ], sizes.icon );

			iconElements.push( image );

			button.appendChild( image );

			addListener( button, 'click', () => {

				if ( button.disabled ) return;

				viewer[ definition.property ] = ( definition.type === 'toggle' )
					? ! viewer[ definition.property ]
					: definition.value;

			} );

			bar.appendChild( button );

			controls.push( {
				property: definition.property,
				element: button,
				style: buttonStyle,
				needsSurvey: definition.needsSurvey !== false,
				featureTest: featureTest( definition ),
				update: () => {

					if ( definition.type === 'action' ) return;

					setActive( button, ( definition.type === 'toggle' )
						? !! viewer[ definition.property ]
						: viewer[ definition.property ] === definition.value );

				}
			} );

		}

		function addShadingSelect ( id, definition ) {

			const select = document.createElement( 'select' );

			select.title = definition.property;

			select.classList.add( 'cv-toolbar-select', `cv-toolbar-${id}` );
			select.setAttribute( 'aria-label', definition.property );

			setStyle( select, selectStyle( sizes ) );

			addListener( select, 'change', () => { viewer.shadingMode = Number( select.value ); } );

			bar.appendChild( select );

			shadingSelect = select;

			controls.push( {
				property: definition.property,
				element: select,
				style: selectStyle,
				needsSurvey: true,
				featureTest: featureTest( definition ),
				update: () => { select.value = viewer.shadingMode ?? ''; }
			} );

		}

		function buildShadingOptions () {

			if ( shadingSelect === null ) return;

			const hasLegs = viewer.hasLegs;
			const hasRealTerrain = viewer.hasRealTerrain;

			shadingSelect.replaceChildren();

			legShadingModes.forEach( mode => {

				if ( mode.legs === true && ! hasLegs ) return;
				if ( mode.terrain === true && ! hasRealTerrain ) return;

				const option = document.createElement( 'option' );
				const name = cfg.i18n( SHADING_TEXT_PREFIX + mode.key );

				option.value = mode.value;
				option.textContent = ( name === undefined ) ? mode.constant : name;
				option.title = `CV2.${mode.constant}`;

				shadingSelect.appendChild( option );

			} );

		}

		function setActive ( button, active ) {

			button.style.setProperty( 'background', active
				? 'var( --cv-toolbar-active-background, #1ab4e5 )'
				: 'var( --cv-toolbar-button-background, transparent )' );

			button.style.setProperty( 'color', active
				? 'var( --cv-toolbar-active-color, #ffffff )'
				: 'var( --cv-toolbar-color, #dddddd )' );

			button.setAttribute( 'aria-pressed', active ? 'true' : 'false' );

		}

		function setDisabled ( element, disabled ) {

			element.disabled = disabled;

			element.style.setProperty( 'opacity', disabled ? '0.4' : '1' );
			element.style.setProperty( 'cursor', disabled ? 'default' : 'pointer' );

		}

		// the state of the controls is taken from the viewer as it reports a change,
		// rather than read back at a rate of its own

		function refresh ( name ) {

			const surveyLoaded = viewer.surveyLoaded;

			controls.forEach( control => {

				const missing = ( control.featureTest !== null && ! viewer[ control.featureTest ] );

				if ( control.needsSurvey ) setDisabled( control.element, ! surveyLoaded || missing );

				if ( name === undefined || name === control.property ) control.update();

			} );

		}

		function onChange ( event ) {

			refresh( event.name );

		}

		// a pointer attached to or detached from the device changes what the controls have
		// to be big enough for

		function onPointerChange ( event ) {

			sizes = event.matches ? coarseSizes : fineSizes;

			setStyle( bar, barStyle( sizes ) );

			controls.forEach( control => setStyle( control.element, control.style( sizes ) ) );

			iconElements.forEach( image => {

				image.setAttribute( 'width', sizes.icon );
				image.setAttribute( 'height', sizes.icon );

			} );

			// the styles just applied include the ones that display the state of a control

			refresh();

		}

		function onModelChange () {

			// which shading modes a model can be displayed with depends on what it holds

			buildShadingOptions();
			refresh();

			// the side panel is built with the first model loaded, so what the bar has to
			// clear may only now be there

			placeAgainstEdge();

		}

		function onFullscreenChange () {

			const fullscreenElement = document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

			if ( fullscreenElement !== viewerContainer ) {

				replace();

			} else if ( displaced === null && bar.parentNode !== null && ! viewerContainer.contains( bar ) ) {

				displaced = { parent: bar.parentNode, next: bar.nextSibling };

				viewerContainer.appendChild( bar );

			}

			// a container displayed fullscreen is a different size, and the user interface
			// it holds is laid out for that size

			placeAgainstEdge();

		}

		function replace () {

			if ( displaced === null ) return;

			const parent = displaced.parent;
			const next = displaced.next;

			displaced = null;

			// the element the toolbar stood before may itself have been removed meanwhile,
			// in which case it goes back at the end of what its parent now holds

			parent.insertBefore( bar, ( next !== null && next.parentNode === parent ) ? next : null );

		}

		function dispose () {

			replace();

			listeners.forEach( listener => listener.element.removeEventListener( listener.type, listener.handler ) );

			viewer.removeEventListener( 'change', onChange );
			viewer.removeEventListener( 'newCave', onModelChange );
			viewer.removeEventListener( 'clear', onModelChange );
			viewer.removeEventListener( 'resized', placeAgainstEdge );
			viewer.removeEventListener( 'dispose', dispose );

			bar.remove();

			controls.length = 0;
			listeners.length = 0;
			iconElements.length = 0;

		}

	}

}

export { CaveViewToolbar };
