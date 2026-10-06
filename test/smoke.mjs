// A smoke test of the built bundle in a real browser - see README.md in this directory.
//
// It serves build/ on 127.0.0.1, loads the UMD bundle in headless Chromium, loads one of the
// surveys of docs/surveys/, and drives the viewer's public API through the things a host
// application does, asserting counts and verdicts only. Software rendering is expected,
// so every wait is generous.
//
// The page is opened twice in the one browser. The first reader has no preference about
// motion, reads English and is allowed fullscreen. The second prefers reduced motion, reads
// Romanian from a catalogue that arrives late, and is refused fullscreen - which is where
// the behaviours a preference, a slow network and a refusal bring out are asserted, and
// where the viewer is disposed while it is still loading and while it is covering the page.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const buildDir = process.env.SMOKE_BUILD_DIR ?? path.join( root, 'build' );
const surveysDir = path.join( root, 'docs', 'surveys' );
const bundle = path.join( buildDir, 'CaveView', 'js', 'CaveView2.min.js' );

const SURVEY = 'titan.3d';
const TIMEOUT = Number( process.env.SMOKE_TIMEOUT ?? 120000 );

// a survey that names a coordinate system, for a load that has to wait while it is looked up
const SURVEY_WITH_CRS = 'P8_Master.3d';

// the catalogue the second reader's interface is written from
const LANGUAGE = 'ro';
const cataloguePath = path.join( buildDir, 'CaveView', 'lib', `lang-${LANGUAGE}.json` );

const started = Date.now();

if ( ! fs.existsSync( bundle ) ) fail( `no bundle at ${bundle} - run \`npm run build\` first` );
if ( ! fs.existsSync( cataloguePath ) ) fail( `no catalogue at ${cataloguePath}` );

const catalogue = JSON.parse( fs.readFileSync( cataloguePath, 'utf8' ) );

// Playwright is not a dependency of this package: it is resolved from another installation,
// by default the one named in README.md

const playwrightModules = process.env.PLAYWRIGHT_NODE_MODULES ?? '/home/devuser1/projects/silexgis/silexgis/client/node_modules';

let chromium;

try {

	( { chromium } = createRequire( path.join( playwrightModules, 'resolve-from-here.js' ) )( 'playwright' ) );

} catch ( e ) {

	fail( `playwright was not found under ${playwrightModules} - set PLAYWRIGHT_NODE_MODULES (${e.message})` );

}

// --- the page served ----------------------------------------------------------------------

const types = {
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.html': 'text/html',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.3d': 'application/octet-stream',
	'.lox': 'application/octet-stream'
};

// the viewer's container stands in an element of the host's, with a toolbar beside it rather
// than inside it, and that element is the one put into fullscreen. Below it are the host's
// own controls: the fields a key belongs to, and a chooser and a tick box that take no text.
// The class the viewer sets on the fullscreen element covers the page, as a host's stylesheet
// has it do for a browser that refuses fullscreen. One button of the host's stays above
// whatever is covering the page: a press on it runs what the test last gave it to run, as
// something the reader did - which is what the browser asks before it grants fullscreen.

const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="/CaveView/css/caveview.css">
<style>
	body { margin: 0; background: #000; }
	#wrap { width: 800px; background: #000; }
	#bar { position: relative; height: 40px; }
	#scene { width: 800px; height: 600px; position: relative; }
	#wrap.toggle-fullscreen { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 100; }
	#host { margin-top: 8px; }
	#editable { display: inline-block; min-width: 80px; background: #fff; }
	#hostact { position: fixed; right: 0; bottom: 0; z-index: 1000; }
</style>
</head>
<body>
<div id="wrap"><div id="bar"></div><div id="scene"></div></div>
<div id="host">
<input id="field" type="text">
<textarea id="area" rows="1"></textarea>
<span id="editable" contenteditable="true"></span>
<select id="chooser"><option>a</option><option>b</option></select>
<input id="tick" type="checkbox">
<button id="hostfs" type="button" onclick="document.documentElement.requestFullscreen()">host fullscreen</button>
<button id="hostact" type="button" onclick="smoke.act()">host action</button>
</div>
<script src="/CaveView/js/CaveView2.min.js"></script>
</body></html>`;

const server = http.createServer( ( req, res ) => {

	const url = new URL( req.url, 'http://127.0.0.1' );

	if ( url.pathname === '/smoke.html' ) {

		res.writeHead( 200, { 'content-type': 'text/html' } );
		res.end( pageHtml );
		return;

	}

	// the same page, in a document the browser will not give fullscreen to

	if ( url.pathname === '/refused.html' ) {

		res.writeHead( 200, { 'content-type': 'text/html', 'permissions-policy': 'fullscreen=()' } );
		res.end( pageHtml );
		return;

	}

	const file = url.pathname.startsWith( '/surveys/' )
		? path.join( surveysDir, url.pathname.slice( '/surveys/'.length ) )
		: path.join( buildDir, url.pathname );

	fs.readFile( file, ( err, data ) => {

		if ( err ) {

			res.writeHead( 404 );
			res.end();
			return;

		}

		res.writeHead( 200, { 'content-type': types[ path.extname( file ) ] ?? 'application/octet-stream' } );
		res.end( data );

	} );

} );

await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );

const base = `http://127.0.0.1:${server.address().port}`;

// --- the assertions -----------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check ( name, condition, detail ) {

	if ( condition ) {

		passed++;
		console.log( `ok ${passed + failed} - ${name}${detail === undefined ? '' : ` (${detail})`}` );

	} else {

		failed++;
		console.log( `FAIL ${passed + failed} - ${name}${detail === undefined ? '' : ` (${detail})`}` );

	}

}

function fail ( message ) {

	console.error( 'smoke test could not run: ' + message );
	process.exit( 2 );

}

// --- the browser --------------------------------------------------------------------------

const browser = await chromium.launch( {
	headless: true,
	args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ]
} );

// what a page is given before any script of its own runs: a count of the rejections nobody
// handled, a record of every key as it leaves the document with whether something cancelled
// it on the way, and the steps that both readers go through

function instrument () {

	// a viewer in a browser that is online looks for terrain on the web once a survey is
	// loaded, and reports the survey complete only when that search has ended; the page is
	// told it is offline, so the survey is complete as soon as it is loaded and nothing is
	// asked for

	Object.defineProperty( navigator, 'onLine', { get: () => false } );

	const smoke = { rejections: 0, keys: [], fullscreenChanges: 0, act: () => {} };

	window.smoke = smoke;

	window.addEventListener( 'unhandledrejection', () => { smoke.rejections++; } );

	// a fullscreen that is granted and left again at once is over before the test could
	// look: the changes are counted as the document hears of them

	document.addEventListener( 'fullscreenchange', () => { smoke.fullscreenChanges++; } );

	// the viewer listens on the document, which a key reaches before it reaches the window

	window.addEventListener( 'keydown', event => { smoke.keys.push( { key: event.key, cancelled: event.defaultPrevented } ); } );

	smoke.sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );

	// the next event of a type, listened for from now, or an Error when none comes in time

	smoke.wait = ( viewer, type, ms ) => new Promise( ( resolve, reject ) => {

		const timer = setTimeout( () => {

			viewer.removeEventListener( type, once );
			reject( new Error( `no ${type} event within ${ms} ms` ) );

		}, ms );

		function once ( event ) {

			viewer.removeEventListener( type, once );
			clearTimeout( timer );
			resolve( event );

		}

		viewer.addEventListener( type, once );

	} );

	smoke.heard = ( viewer, type, ms ) => smoke.wait( viewer, type, ms ).then( () => true, () => false );

	// a move to a station, with the animation frames that pass before the promise settles
	// and the 'moved' events it signals: a move that is flown takes many frames, and one
	// that jumps is over before the first

	smoke.focus = async ( viewer, ref, options ) => {

		const controls = viewer.getControls();
		const before = controls.target.clone();

		let frames = 0;
		let counting = true;
		let moves = 0;

		const onMoved = () => { moves++; };

		viewer.addEventListener( 'moved', onMoved );

		requestAnimationFrame( function tick () {

			if ( ! counting ) return;

			frames++;
			requestAnimationFrame( tick );

		} );

		const station = await viewer.focusStation( ref, options );

		counting = false;

		viewer.removeEventListener( 'moved', onMoved );

		return { ok: station !== null && station.name() === ref, moved: before.distanceTo( controls.target ), frames, moves };

	};

	// the names the toolbar's chooser lists the shading modes by

	smoke.shadingNames = () => [ ...document.querySelectorAll( '.cv-toolbar select option' ) ].map( option => option.textContent );

	// the viewer, the user interface (for its side panel and its keyboard controls), a
	// survey, and a toolbar built the way a host builds one: as soon as there is a model,
	// without waiting for anything else

	smoke.open = async ( { survey, timeout, language } ) => {

		const viewer = new CV2.CaveViewer( 'scene', {
			home: '/CaveView/',
			surveyDirectory: '/surveys/',
			terrainDirectory: '/terrain/',
			fullscreenElement: 'wrap',
			language: language,
			view: { stations: true, stationLabelOver: true }
		} );

		window.viewer = viewer;
		window.ui = new CV2.CaveViewUI( viewer );

		const newSurvey = smoke.wait( viewer, 'newSurvey', timeout );
		const newCave = smoke.wait( viewer, 'newCave', timeout );

		// loaded through the user interface, whose pages describe the source they loaded

		window.ui.loadCave( survey );

		await newSurvey;
		await newCave;

		// beside the container rather than in it, as a host with a bar of its own has it

		window.toolbar = new CV2.CaveViewToolbar( viewer, 'bar', { buttons: [ 'shadingMode', 'autoRotate', 'fullscreen' ] } );

		const shadingNames = smoke.shadingNames();

		let stations = 0;

		viewer.forEachStation( () => stations++ );

		// the station furthest from the centre of the model, so that focusing it moves
		// the camera's target, and the two ends of a leg, for a trail

		const tree = viewer.getSurveyTree();
		let far = null;

		( function walk ( node ) {

			if ( node.isStation() ) {

				if ( node.connections > 0 && ( far === null || node.x * node.x + node.y * node.y > far.x * far.x + far.y * far.y ) ) far = node;

			} else {

				node.children.forEach( walk );

			}

		} )( tree );

		let leg = null;

		viewer.forEachLeg( l => { if ( leg === null ) leg = { start: l.start().name(), end: l.end().name(), length: l.length() }; } );

		const versionLines = [ ...document.querySelectorAll( '.page p' ) ].filter( p => p.textContent === 'CaveView ' + CV2.VERSION ).length;

		return { stations, far: far === null ? null : far.getPath(), leg, version: CV2.VERSION, versionLines, shadingNames };

	};

}

async function openPage ( context, url ) {

	// nothing leaves the machine: a survey without a known CRS asks for no terrain, and a
	// request to anywhere else would be a defect of the test rather than of the viewer

	await context.route( url => ! url.href.startsWith( base ), route => route.abort() );

	const page = await context.newPage();

	page.setDefaultTimeout( TIMEOUT );

	await page.addInitScript( instrument );

	const seen = { pageErrors: [], consoleErrors: [], dialogs: [] };

	page.on( 'pageerror', err => seen.pageErrors.push( err.message ) );
	page.on( 'console', msg => { if ( msg.type() === 'error' ) seen.consoleErrors.push( msg.text() ); } );

	// an alert stops the page until it is answered

	page.on( 'dialog', dialog => { seen.dialogs.push( dialog.type() ); dialog.dismiss().catch( () => {} ); } );

	await page.goto( base + url );

	return { page, seen };

}

// a press of the mouse on the middle of an element, as a reader makes it: a press is what
// gives a control the focus, and what the browser takes for leave to go fullscreen

async function press ( page, selector ) {

	const box = await page.locator( selector ).first().boundingBox();

	await page.mouse.click( box.x + box.width / 2, box.y + box.height / 2 );

}

// somewhere on the model that nothing of the user interface is displayed over

function clearOfPanel ( page ) {

	return page.evaluate( () => {

		const rect = document.getElementById( 'scene' ).getBoundingClientRect();
		const y = rect.top + rect.height * 0.75;

		for ( let x = rect.left + 20; x < rect.right - 20; x += 20 ) {

			const element = document.elementFromPoint( x, y );

			if ( element !== null && element.tagName === 'CANVAS' ) return { x, y };

		}

		return null;

	} );

}

// the middle of a control of the side panel that is displayed with nothing over it: the one
// on the page already open if there is one, and otherwise each tab is opened in turn until
// one displays it

async function panelControl ( page, selector ) {

	const find = () => page.evaluate( selector => {

		for ( const control of document.querySelectorAll( selector ) ) {

			const rect = control.getBoundingClientRect();

			if ( rect.width === 0 || rect.height === 0 ) continue;

			const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

			if ( document.elementFromPoint( centre.x, centre.y ) === control ) return centre;

		}

		return null;

	}, selector );

	let centre = await find();

	const tabs = page.locator( '.cv-tab-box > *' );
	const tabCount = await tabs.count();

	for ( let i = 0; i < tabCount && centre === null; i++ ) {

		const tabBox = await tabs.nth( i ).boundingBox();

		if ( tabBox === null ) continue;

		await page.mouse.click( tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2 );
		await page.waitForTimeout( 700 );

		centre = await find();

	}

	return centre;

}

// the fullscreen changes the document has heard of, and a wait for it to have heard of a
// number more - which gives up quietly, so that what failed to happen is asserted rather
// than thrown

const fullscreenChanges = page => page.evaluate( () => smoke.fullscreenChanges );

const fullscreenChangesFrom = ( page, count, more ) => page.waitForFunction( target => smoke.fullscreenChanges >= target, count + more, { timeout: 8000 } ).catch( () => {} );

const fullscreenState = page => page.evaluate( () => {

	const wrap = document.getElementById( 'wrap' );

	return {
		enabled: document.fullscreenEnabled,
		element: document.fullscreenElement === wrap,
		anything: document.fullscreenElement !== null,
		marked: wrap.classList.contains( 'toggle-fullscreen' ),
		covering: Math.round( wrap.getBoundingClientRect().width ) === window.innerWidth,
		state: viewer.fullscreen,
		pressed: document.querySelector( '.cv-toolbar-fullscreen' ).getAttribute( 'aria-pressed' ),
		rejections: smoke.rejections
	};

} );

const seenByPage = [];

try {

	// --- the first reader: no preference about motion, English, fullscreen allowed --------

	const context = await browser.newContext( { viewport: { width: 1000, height: 760 } } );
	const { page, seen } = await openPage( context, '/smoke.html' );

	seenByPage.push( seen );

	const loaded = await page.evaluate( options => smoke.open( options ), { survey: SURVEY, timeout: TIMEOUT, language: 'en' } );

	check( 'newSurvey and newCave fire and the station count is above zero', loaded.stations > 0, `stations: ${loaded.stations}` );
	check( 'a station and a leg can be resolved from the tree', loaded.far !== null && loaded.leg !== null );
	check( 'the help page names the version from the catalogue', loaded.versionLines === 1, `CaveView ${loaded.version}` );

	// the camera: focusing a station, and framing the live markers

	const focus = await page.evaluate( ( { far } ) => smoke.focus( viewer, far ), loaded );

	check( 'focusStation() resolves with the station and moves the camera target', focus.ok && focus.moved > 0, `target moved ${focus.moved.toFixed( 1 )} units` );
	check( 'a reader with no preference about motion is flown there: several frames, and one moved event', focus.frames > 1 && focus.moves === 1, `${focus.frames} frames, ${focus.moves} moved` );

	const markers = await page.evaluate( async ( { far, leg } ) => {

		const none = viewer.frameLiveMarkers();

		const added = viewer.addLiveMarker( 'smoke', far, { label: 'smoke' } );
		const listed = viewer.getLiveMarkers().length;

		const moved = viewer.moveLiveMarker( 'smoke', leg.end, { duration: 0 } );

		const target = viewer.getControls().target.clone();

		// the host calls, and then listens for the end of the move

		const framed = viewer.frameLiveMarkers();
		const arrived = await smoke.heard( viewer, 'moved', 30000 );

		const targetMoved = target.distanceTo( viewer.getControls().target );

		// and again, with the camera already where the first call left it

		const framedAgain = viewer.frameLiveMarkers();
		const arrivedAgain = await smoke.heard( viewer, 'moved', 5000 );

		const removed = viewer.removeLiveMarker( 'smoke' );
		const left = viewer.getLiveMarkers().length;

		return {
			none,
			added: added !== null && added.resolved === true,
			listed,
			moved: moved !== null && moved.resolved === true && moved.ref === leg.end,
			framed,
			arrived,
			targetMoved,
			framedAgain,
			arrivedAgain,
			removed,
			left
		};

	}, loaded );

	check( 'frameLiveMarkers() returns false with no marker placed', markers.none === false );
	check( 'addLiveMarker() / moveLiveMarker() / removeLiveMarker() round-trip', markers.added && markers.listed === 1 && markers.moved && markers.removed === true && markers.left === 0 );
	check( 'frameLiveMarkers() returns true with a marker placed and the camera moves', markers.framed === true && markers.arrived, `target moved ${markers.targetMoved.toFixed( 1 )} units` );
	check( 'frameLiveMarkers() signals its end also when the camera already takes the markers in', markers.framedAgain === true && markers.arrivedAgain );

	// a framing that has no move to make owes its signal as it returns, and the host goes
	// straight on to fly somewhere else: the signal owed is given first, and is not taken
	// for the end of the flight

	const overtaken = await page.evaluate( async ( { far, leg } ) => {

		viewer.addLiveMarker( 'smoke', far, { label: 'smoke' } );
		viewer.frameLiveMarkers();

		await smoke.heard( viewer, 'moved', 30000 );

		const framed = viewer.frameLiveMarkers();
		const flight = await smoke.focus( viewer, leg.start );

		viewer.removeLiveMarker( 'smoke' );

		return { framed, flight };

	}, loaded );

	check( 'a focus started in the turn of a framing is flown, with the framing\'s signal given before it', overtaken.framed === true && overtaken.flight.ok && overtaken.flight.frames > 1 && overtaken.flight.moves === 2, `${overtaken.flight.frames} frames, ${overtaken.flight.moves} moved` );

	// a trail along two connected stations

	const trail = await page.evaluate( ( { leg } ) => {

		const added = viewer.addTrail( 'smoke', [ leg.start, leg.end ] );
		const listed = viewer.getTrails().length;
		const removed = viewer.removeTrail( 'smoke' );

		return { resolved: added !== null && added.resolved === true, gaps: added === null ? -1 : added.gaps.length, lengthM: added === null ? 0 : added.lengthM, listed, removed };

	}, loaded );

	check( 'addTrail() along two connected stations draws a trail of some length', trail.resolved && trail.gaps === 0 && trail.lengthM > 0 && trail.listed === 1 && trail.removed === true, `length ${trail.lengthM.toFixed( 2 )} m` );

	// station media whose image cannot be fetched

	const media = await page.evaluate( async ( { far } ) => {

		let errors = 0;
		let errorUrl = null;

		viewer.addEventListener( 'mediaError', event => { errors++; errorUrl = event.url; event.handled = true; } );

		viewer.setStationMedia( new Map( [ [ far, [ { url: '/no-such-image.jpg', caption: 'missing' } ] ] ] ) );

		await viewer.focusStation( far, { popup: true } );

		const strip = viewer.container.querySelector( '.cv-media-strip' );

		// the image fails some time after the strip is displayed

		const deadline = Date.now() + 20000;

		while ( Date.now() < deadline && ( errors === 0 || strip.childElementCount > 0 ) ) await smoke.sleep( 100 );

		const result = { errors, errorUrl, thumbnails: strip.childElementCount, display: strip.style.display };

		viewer.clearStationMedia();
		viewer.popup = viewer.getSurveyTree();

		return result;

	}, loaded );

	check( 'a station media image that 404s is reported and its thumbnail removed, closing the strip', media.errors === 1 && media.errorUrl === '/no-such-image.jpg' && media.thumbnails === 0 && media.display === 'none', `mediaError events: ${media.errors}, thumbnails left: ${media.thumbnails}` );

	// a capture at a size given in pixels

	const capture = await page.evaluate( () => {

		const begun = viewer.beginCapture( { width: 400, height: 300 } );
		const frame = viewer.captureFrame();
		const size = { width: frame.canvas.width, height: frame.canvas.height };

		viewer.endCapture();

		return { begun, size, capturing: viewer.capturing };

	} );

	check( 'beginCapture() / captureFrame() / endCapture() return a frame of the requested size', capture.begun.width === 400 && capture.begun.height === 300 && capture.size.width === 400 && capture.size.height === 300 && capture.capturing === false, `${capture.size.width} x ${capture.size.height}` );

	// the keyboard, with the pointer resting over the model

	const keyState = () => page.evaluate( () => {

		const active = document.activeElement;

		return {
			mouseOver: viewer.mouseOver,
			shading: viewer.shadingMode,
			active: active === null ? '' : active.tagName + ( active.type ? ':' + active.type : '' ),
			ownToolbar: active !== null && active.closest( '.cv-toolbar' ) !== null,
			inContainer: active !== null && viewer.container.contains( active ),
			height: CV2.SHADING_HEIGHT,
			length: CV2.SHADING_LENGTH,
			survey: CV2.SHADING_SURVEY
		};

	} );

	const shadeByHeight = () => page.evaluate( () => { viewer.shadingMode = CV2.SHADING_HEIGHT; } );

	const overModel = async () => {

		const spot = await clearOfPanel( page );

		await page.mouse.move( spot.x, spot.y );

	};

	await overModel();

	await page.evaluate( () => { viewer.shadingMode = CV2.SHADING_HEIGHT; document.activeElement.blur(); } );
	await page.keyboard.press( '3' );

	const direct = await keyState();

	check( 'a key pressed with the pointer over the model and nothing focused drives the viewer', direct.mouseOver === true && direct.shading === direct.length );

	await shadeByHeight();
	await page.focus( '#field' );
	await page.keyboard.type( '23' );

	const typed = await keyState();
	const fieldValue = await page.evaluate( () => document.getElementById( 'field' ).value );

	check( 'keys typed into an input with the pointer over the model reach the input and not the viewer', fieldValue === '23' && typed.shading === typed.height && typed.mouseOver === true, `field holds '${fieldValue}'` );

	await page.focus( '#area' );
	await page.keyboard.type( '23' );
	await page.focus( '#editable' );
	await page.keyboard.type( '23' );

	const written = await keyState();
	const writtenValues = await page.evaluate( () => [ document.getElementById( 'area' ).value, document.getElementById( 'editable' ).textContent ] );

	check( 'keys typed into a textarea and into an editable element reach them and not the viewer', writtenValues[ 0 ] === '23' && writtenValues[ 1 ] === '23' && written.shading === written.height && written.mouseOver === true, `they hold '${writtenValues[ 0 ]}' and '${writtenValues[ 1 ]}'` );

	// a chooser and a tick box take no text, and those of the host page still keep their keys

	await shadeByHeight();
	await page.evaluate( () => { smoke.keys.length = 0; } );
	await page.focus( '#chooser' );
	await page.keyboard.press( '3' );
	await page.focus( '#tick' );
	await page.keyboard.press( '3' );

	const hosted = await keyState();
	const hostedKeys = await page.evaluate( () => smoke.keys.slice() );

	check( 'a key pressed in a chooser or a tick box of the host page is left to it', hostedKeys.length === 2 && hostedKeys.every( key => key.cancelled === false ) && hosted.shading === hosted.height && hosted.mouseOver === true, `${hostedKeys.filter( key => key.cancelled ).length} of ${hostedKeys.length} keys cancelled` );

	// the viewer's own do not: the reader chooses a shading in the toolbar, which leaves the
	// focus on the chooser, goes back to the model and presses a key

	await press( page, '.cv-toolbar select' );
	await page.locator( '.cv-toolbar select' ).selectOption( String( direct.survey ) );
	await page.keyboard.press( 'Escape' );

	const chosen = await keyState();

	await overModel();
	await page.keyboard.press( '3' );

	const afterChooser = await keyState();

	check( 'a key pressed over the model after the toolbar\'s chooser was used drives the viewer', chosen.shading === chosen.survey && afterChooser.active.startsWith( 'SELECT' ) && afterChooser.ownToolbar && afterChooser.mouseOver === true && afterChooser.shading === afterChooser.length, `focus on ${afterChooser.active}` );

	// the keys the chooser is stepped with are still its own: the focus on it and the
	// pointer on the model, an arrow moves it to its next entry, and the viewer follows

	const stepKey = await page.evaluate( () => {

		const select = document.querySelector( '.cv-toolbar select' );

		smoke.keys.length = 0;

		return ( select.selectedIndex < select.options.length - 1 ) ? 'ArrowDown' : 'ArrowUp';

	} );

	await page.keyboard.press( stepKey );

	const stepped = await page.evaluate( () => ( { chosen: Number( document.querySelector( '.cv-toolbar select' ).value ), shading: viewer.shadingMode, keys: smoke.keys.slice() } ) );

	check( 'an arrow key pressed then is left to the chooser, which moves to its next entry', stepped.keys.length === 1 && stepped.keys[ 0 ].cancelled === false && stepped.chosen !== afterChooser.length && stepped.shading === stepped.chosen, `${stepKey} cancelled: ${stepped.keys.length === 1 && stepped.keys[ 0 ].cancelled}` );

	// and the same after a setting of the side panel: a tick box, which is pressed twice
	// so that the setting is left as it was

	const tickBox = await panelControl( page, '#scene input[type=checkbox]' );
	const ticked = ( tickBox !== null );

	if ( ticked ) {

		await page.mouse.click( tickBox.x, tickBox.y );
		await page.mouse.click( tickBox.x, tickBox.y );

	}

	await shadeByHeight();
	await overModel();
	await page.keyboard.press( '3' );

	const afterTick = await keyState();

	check( 'a key pressed over the model after a tick box of the side panel was used drives the viewer', ticked && afterTick.active === 'INPUT:checkbox' && afterTick.inContainer && afterTick.mouseOver === true && afterTick.shading === afterTick.length, `focus on ${afterTick.active}` );

	// a slider of the side panel, pressed and with the pointer left on it, is moved along
	// its range by an arrow. Whichever setting it is, is put back afterwards.

	const settings = await page.evaluate( () => ( { zScale: viewer.zScale, linewidth: viewer.linewidth, autoRotateSpeed: viewer.autoRotateSpeed } ) );
	const slider = await panelControl( page, '#scene input[type=range]' );

	let slid = { found: false, active: '', inContainer: false, mouseOver: false, from: 0, to: 0, keys: [] };

	if ( slider !== null ) {

		await page.mouse.click( slider.x, slider.y );

		const from = await page.evaluate( () => { smoke.keys.length = 0; return Number( document.activeElement.value ); } );

		await page.keyboard.press( 'ArrowRight' );

		slid = await page.evaluate( ( { from, settings } ) => {

			const active = document.activeElement;

			const result = {
				found: true,
				active: active.tagName + ':' + active.type,
				inContainer: viewer.container.contains( active ),
				mouseOver: viewer.mouseOver,
				from,
				to: Number( active.value ),
				keys: smoke.keys.slice()
			};

			Object.assign( viewer, settings );

			return result;

		}, { from, settings } );

	}

	check( 'an arrow key pressed on a slider of the side panel is left to it, and moves it', slid.found && slid.active === 'INPUT:range' && slid.inContainer && slid.mouseOver === true && slid.keys.length === 1 && slid.keys[ 0 ].cancelled === false && slid.to > slid.from, `from ${slid.from} to ${slid.to}` );

	await page.evaluate( () => { document.activeElement.blur(); } );

	// auto rotation, for a reader who has not asked to be spared it

	await press( page, '.cv-toolbar-autoRotate' );

	const rotating = await page.evaluate( () => ( { state: viewer.autoRotate, pressed: document.querySelector( '.cv-toolbar-autoRotate' ).getAttribute( 'aria-pressed' ) } ) );

	await press( page, '.cv-toolbar-autoRotate' );

	const rotated = await page.evaluate( () => ( { state: viewer.autoRotate, pressed: document.querySelector( '.cv-toolbar-autoRotate' ).getAttribute( 'aria-pressed' ), reducedMotion: viewer.reducedMotion } ) );

	check( 'the toolbar\'s rotate button starts an auto rotation and stops it, and shows which', rotating.state === true && rotating.pressed === 'true' && rotated.state === false && rotated.pressed === 'false' );
	check( 'the reducedMotion property is false for a reader with no preference', rotated.reducedMotion === false );

	// fullscreen, which the browser gives to a press of the toolbar's button

	const fullscreenBefore = await page.evaluate( () => ( { element: viewer.fullscreenElement === document.getElementById( 'wrap' ), state: viewer.fullscreen } ) );

	check( 'the fullscreenElement option is reported by the getter and the viewer is not fullscreen', fullscreenBefore.element === true && fullscreenBefore.state === false );

	await press( page, '.cv-toolbar-fullscreen' );
	await page.waitForFunction( () => document.fullscreenElement !== null, null, { timeout: 15000 } ).catch( () => {} );

	const entered = await fullscreenState( page );

	await press( page, '.cv-toolbar-fullscreen' );
	await page.waitForFunction( () => document.fullscreenElement === null, null, { timeout: 15000 } ).catch( () => {} );

	const left = await fullscreenState( page );

	check( 'the toolbar\'s button puts the named element into fullscreen and takes it out again', entered.element && entered.state === true && entered.marked && entered.pressed === 'true' && ! left.anything && left.state === false && ! left.marked && left.pressed === 'false', `in: ${entered.element}, out: ${! left.anything}` );

	// with the host's own page in fullscreen there is nothing for the viewer to ask for

	await press( page, '#hostfs' );
	await page.waitForFunction( () => document.fullscreenElement !== null, null, { timeout: 15000 } ).catch( () => {} );

	const hostFullscreen = await page.evaluate( () => {

		const before = document.fullscreenElement === document.documentElement;

		viewer.fullscreen = true;

		return { before, marked: document.getElementById( 'wrap' ).classList.contains( 'toggle-fullscreen' ), state: viewer.fullscreen };

	} );

	await page.evaluate( () => document.exitFullscreen() ).catch( () => {} );
	await page.waitForFunction( () => document.fullscreenElement === null, null, { timeout: 15000 } ).catch( () => {} );

	check( 'a request made while another element is in fullscreen leaves the page as it is', hostFullscreen.before && ! hostFullscreen.marked && hostFullscreen.state === false );

	// refused once - as a request made with no press behind it is - the class is all there
	// is; the host then obtains fullscreen for the element itself, and from there on it is
	// the document that says whether the viewer is fullscreen

	const refusedOnce = await page.evaluate( async () => {

		const wrap = document.getElementById( 'wrap' );

		wrap.requestFullscreen = () => Promise.reject( new TypeError( 'refused' ) );

		viewer.fullscreen = true;

		await smoke.sleep( 200 );

		delete wrap.requestFullscreen;

		smoke.act = () => { wrap.requestFullscreen(); };

		return { marked: wrap.classList.contains( 'toggle-fullscreen' ), state: viewer.fullscreen, anything: document.fullscreenElement !== null };

	} );

	await press( page, '#hostact' );
	await page.waitForFunction( () => document.fullscreenElement !== null, null, { timeout: 15000 } ).catch( () => {} );

	const takenOver = await fullscreenState( page );

	await page.evaluate( () => document.exitFullscreen() ).catch( () => {} );
	await page.waitForFunction( () => document.fullscreenElement === null, null, { timeout: 15000 } ).catch( () => {} );
	await page.waitForTimeout( 300 );

	const takenOverLeft = await fullscreenState( page );

	check( 'a fullscreen the host obtains after the viewer was refused takes over from the class, and leaving it leaves nothing', refusedOnce.marked && refusedOnce.state === true && ! refusedOnce.anything && takenOver.element && takenOver.state === true && ! takenOverLeft.anything && ! takenOverLeft.marked && takenOverLeft.state === false && takenOverLeft.pressed === 'false', `refused: marked ${refusedOnce.marked}; granted: ${takenOver.element}; left: marked ${takenOverLeft.marked}, fullscreen ${takenOverLeft.state}` );

	// a request taken back in the turn that made it, before the browser can have answered:
	// the class goes at once, and the fullscreen the browser grants all the same is left

	let changes = await fullscreenChanges( page );

	await page.evaluate( () => { smoke.act = () => { viewer.fullscreen = true; viewer.fullscreen = false; }; } );
	await press( page, '#hostact' );
	await fullscreenChangesFrom( page, changes, 2 );
	await page.waitForTimeout( 300 );

	const takenBack = await fullscreenState( page );

	check( 'a request taken back before the browser answered leaves no class, and the fullscreen granted to it is left again', ! takenBack.anything && ! takenBack.marked && takenBack.state === false && takenBack.pressed === 'false', `in fullscreen: ${takenBack.anything}, marked ${takenBack.marked}, fullscreen ${takenBack.state}` );

	if ( takenBack.anything ) {

		// left for the steps that follow, where the viewer did not leave it

		await page.evaluate( () => document.exitFullscreen() ).catch( () => {} );
		await page.waitForFunction( () => document.fullscreenElement === null, null, { timeout: 15000 } ).catch( () => {} );
		await page.evaluate( () => { viewer.fullscreen = false; } );

	}

	// and a viewer disposed in the turn of its request: nothing is left covering the page,
	// and nothing is left in a fullscreen there is no viewer to leave

	changes = await fullscreenChanges( page );

	await page.evaluate( () => { smoke.act = () => { viewer.fullscreen = true; viewer.dispose(); }; } );
	await press( page, '#hostact' );
	await fullscreenChangesFrom( page, changes, 2 );
	await page.waitForTimeout( 300 );

	const disposedAsking = await page.evaluate( () => ( { anything: document.fullscreenElement !== null, marked: document.getElementById( 'wrap' ).classList.contains( 'toggle-fullscreen' ) } ) );

	check( 'a viewer disposed before the browser answered its request leaves no class and no fullscreen', ! disposedAsking.anything && ! disposedAsking.marked, `in fullscreen: ${disposedAsking.anything}, marked ${disposedAsking.marked}` );

	if ( disposedAsking.anything ) {

		await page.evaluate( () => document.exitFullscreen() ).catch( () => {} );
		await page.waitForFunction( () => document.fullscreenElement === null, null, { timeout: 15000 } ).catch( () => {} );

	}

	// the calls a host may still make of a viewer that has been disposed

	const disposed = await page.evaluate( () => {

		const thrown = [];

		viewer.dispose();

		for ( const call of [ 'renderView', 'resize', 'resetRenderer', 'clearView', 'dispose', 'endCapture' ] ) {

			try { viewer[ call ](); } catch ( e ) { thrown.push( call + ': ' + e.message ); }

		}

		let snapshot = 'nothing thrown';

		try { viewer.getSnapshot(); } catch ( e ) { snapshot = e.message; }

		return { thrown, snapshot };

	} );

	check( 'renderView() and the other entry points do not throw after dispose()', disposed.thrown.length === 0, disposed.thrown.join( '; ' ) || 'nothing thrown' );
	check( 'getSnapshot() after dispose() throws an Error that says the viewer was disposed', /disposed/.test( disposed.snapshot ), disposed.snapshot );

	const rejections1 = await page.evaluate( () => smoke.rejections );

	await context.close();

	// --- the second reader: reduced motion, Romanian arriving late, fullscreen refused ----

	const second = await browser.newContext( { viewport: { width: 1000, height: 760 }, reducedMotion: 'reduce' } );

	// the catalogue is held back until the toolbar has been built, as a network slower than
	// the survey is to parse holds it back

	let releaseCatalogue;
	let catalogueStatus = null;

	const catalogueHeld = new Promise( resolve => { releaseCatalogue = resolve; } );

	await second.route( url => url.pathname.endsWith( `/lib/lang-${LANGUAGE}.json` ), async route => {

		await catalogueHeld;

		const response = await route.fetch();

		catalogueStatus = response.status();

		await route.fulfill( { response } );

	} );

	const opened = await openPage( second, '/refused.html' );
	const page2 = opened.page;
	const seen2 = opened.seen;

	seenByPage.push( seen2 );

	const loaded2 = await page2.evaluate( options => smoke.open( options ), { survey: SURVEY, timeout: TIMEOUT, language: LANGUAGE } );

	// the interface as the catalogue has it, once it has arrived: the side panel and the
	// help page are rebuilt from it, and the toolbar's chooser is written again

	const names = catalogue.settings.shading;
	const surveyHeader = catalogue.settings.survey.header;

	releaseCatalogue();

	await page2.waitForFunction( header => [ ...document.querySelectorAll( '.page .header' ) ].some( div => div.textContent === header ), surveyHeader, { timeout: 15000 } ).catch( () => {} );
	await page2.waitForTimeout( 300 );

	const translated = await page2.evaluate( header => ( {
		headers: [ ...document.querySelectorAll( '.page .header' ) ].filter( div => div.textContent === header ).length,
		versionLines: [ ...document.querySelectorAll( '.page p' ) ].filter( p => p.textContent === 'CaveView ' + CV2.VERSION ).length,
		shadingNames: smoke.shadingNames()
	} ), surveyHeader );

	const known = new Set( Object.values( names ) );
	const versionLine = ( catalogue.help.version ?? '' ).replace( '%{version}', loaded2.version );

	check( `the ${LANGUAGE} catalogue is fetched, and the side panel and the help page's version line are written from it`, catalogueStatus === 200 && translated.headers > 0 && versionLine === 'CaveView ' + loaded2.version && translated.versionLines === 1, `status ${catalogueStatus}` );
	check( 'the toolbar\'s chooser, built before the catalogue arrived, lists the shading modes by the catalogue\'s names', loaded2.shadingNames.length > 0 && loaded2.shadingNames.every( name => ! known.has( name ) ) && translated.shadingNames.length === loaded2.shadingNames.length && translated.shadingNames.every( name => known.has( name ) ), `${translated.shadingNames.filter( name => known.has( name ) ).length} of ${translated.shadingNames.length} names from the catalogue` );

	// reduced motion: the same calls, the same events, and no flight

	const jump = await page2.evaluate( async ( { far, leg } ) => {

		const reducedMotion = viewer.reducedMotion;

		const jumped = await smoke.focus( viewer, far );

		// a caller that insists is flown there all the same - without the model being
		// turned, which is a move of a fixed number of frames however near the station is

		const flown = await smoke.focus( viewer, leg.start, { animate: true, keepView: true } );

		return { reducedMotion, jumped, flown };

	}, loaded2 );

	check( 'the reducedMotion property is true for a reader who prefers reduced motion', jump.reducedMotion === true );
	check( 'focusStation() takes that reader there within a frame, and signals one moved event as a flight does', jump.jumped.ok && jump.jumped.moved > 0 && jump.jumped.frames <= 1 && jump.jumped.moves === 1, `${jump.jumped.frames} frames, ${jump.jumped.moves} moved, target moved ${jump.jumped.moved.toFixed( 1 )} units` );
	check( 'focusStation() with animate: true flies there all the same', jump.flown.ok && jump.flown.frames > 1 && jump.flown.moves === 1, `${jump.flown.frames} frames` );

	await press( page2, '.cv-toolbar-autoRotate' );

	const refusedRotation = await page2.evaluate( () => ( { state: viewer.autoRotate, pressed: document.querySelector( '.cv-toolbar-autoRotate' ).getAttribute( 'aria-pressed' ) } ) );

	check( 'the toolbar\'s rotate button starts no auto rotation for that reader, and is not left pressed', refusedRotation.state === false && refusedRotation.pressed === 'false' );

	// the markers framed in a single frame: the host calls, and then listens

	const framing = await page2.evaluate( async ( { far } ) => {

		viewer.addLiveMarker( 'smoke', far, { label: 'smoke' } );

		const target = viewer.getControls().target.clone();

		let during = 0;

		const onMoved = () => { during++; };

		viewer.addEventListener( 'moved', onMoved );

		const framed = viewer.frameLiveMarkers();

		viewer.removeEventListener( 'moved', onMoved );

		const arrived = await smoke.heard( viewer, 'moved', 3000 );

		return { framed, during, arrived, targetMoved: target.distanceTo( viewer.getControls().target ) };

	}, loaded2 );

	check( 'frameLiveMarkers() signals the end of a move of one frame after it has returned', framing.framed === true && framing.during === 0 && framing.arrived && framing.targetMoved > 0, `moved events during the call: ${framing.during}, after it: ${framing.arrived ? 1 : 0}` );

	// markers standing at one station, framed with no margin by an orthographic camera,
	// are a box of no size to fit the view to

	const fitted = await page2.evaluate( async ( { far, leg } ) => {

		viewer.cameraType = CV2.CAMERA_ORTHOGRAPHIC;

		// from somewhere else, so that there is a move to make

		await viewer.focusStation( leg.start );

		viewer.addLiveMarker( 'smoke-2', far, { label: 'smoke 2' } );

		const camera = viewer.getControls().cameraManager.activeCamera;

		const framed = viewer.frameLiveMarkers( { margin: 0, animate: true } );
		const arrived = await smoke.heard( viewer, 'moved', 30000 );

		const zoom = camera.zoom;

		viewer.clearLiveMarkers();
		viewer.cameraType = CV2.CAMERA_PERSPECTIVE;

		return { orthographic: camera.isOrthographicCamera === true, framed, arrived, zoom: String( zoom ), finite: Number.isFinite( zoom ) && zoom > 0 };

	}, loaded2 );

	check( 'frameLiveMarkers() with no margin on markers at one station leaves an orthographic camera a zoom that is a number', fitted.orthographic && fitted.framed === true && fitted.arrived && fitted.finite, `zoom ${fitted.zoom}` );

	// fullscreen refused: the class is all that displays the viewer large, and the next
	// press has to be the one that takes it off

	const refusedBefore = await fullscreenState( page2 );

	await press( page2, '.cv-toolbar-fullscreen' );
	await page2.waitForTimeout( 500 );

	const refusedOn = await fullscreenState( page2 );

	await press( page2, '.cv-toolbar-fullscreen' );
	await page2.waitForTimeout( 500 );

	const refusedOff = await fullscreenState( page2 );

	check( 'where the browser refuses fullscreen the button covers the page with the class, says so, and uncovers it again', refusedBefore.enabled === false && ! refusedOn.anything && refusedOn.marked && refusedOn.covering && refusedOn.state === true && refusedOn.pressed === 'true' && ! refusedOff.marked && ! refusedOff.covering && refusedOff.state === false && refusedOff.pressed === 'false' && refusedOff.rejections === refusedBefore.rejections, `after one press: marked ${refusedOn.marked}, fullscreen ${refusedOn.state}; after two: marked ${refusedOff.marked}; unhandled rejections: ${refusedOff.rejections - refusedBefore.rejections}` );

	// the same request taken back in the turn that made it: the refusal has not arrived,
	// and the class has to go all the same

	const flipped = await page2.evaluate( async () => {

		viewer.fullscreen = true;
		viewer.fullscreen = false;

		await smoke.sleep( 500 );

	} ).then( () => fullscreenState( page2 ) );

	check( 'where it will be refused, a request taken back before the refusal arrives leaves no class', ! flipped.marked && flipped.state === false && flipped.pressed === 'false' && flipped.rejections === refusedBefore.rejections, `marked ${flipped.marked}, fullscreen ${flipped.state}` );

	if ( flipped.marked ) await page2.evaluate( () => { viewer.fullscreen = false; } );

	// covering the page by its class, the viewer is disposed: the class goes with it

	await press( page2, '.cv-toolbar-fullscreen' );
	await page2.waitForTimeout( 500 );

	const coveringThenDisposed = await fullscreenState( page2 );

	const uncovered = await page2.evaluate( () => {

		ui.dispose();

		return ! document.getElementById( 'wrap' ).classList.contains( 'toggle-fullscreen' );

	} );

	check( 'dispose() takes off the class that was covering the page for a viewer refused fullscreen', coveringThenDisposed.marked && coveringThenDisposed.state === true && uncovered, `marked before: ${coveringThenDisposed.marked}, after: ${! uncovered}` );

	// that disposed viewer, and a change of language made by the next one on the page

	const errorsBefore = seen2.pageErrors.length;

	await page2.evaluate( async () => {

		// what follows needs the page uncovered, whether or not the viewer saw to it

		document.getElementById( 'wrap' ).classList.remove( 'toggle-fullscreen' );

		window.smoke.lookups = 0;
		window.smoke.disposedInLookup = false;

		// the definition a host's registry would answer with, after the time a request to
		// it takes - during which the viewer is disposed

		const viewer = new CV2.CaveViewer( 'scene', {
			home: '/CaveView/',
			surveyDirectory: '/surveys/',
			language: 'en',
			crsLookup: async () => {

				smoke.lookups++;

				setTimeout( () => { window.ui.dispose(); smoke.disposedInLookup = true; }, 0 );

				await smoke.sleep( 300 );

				return '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +units=m +no_defs';

			}
		} );

		window.viewer = viewer;
		window.ui = new CV2.CaveViewUI( viewer );

		// the catalogue tells its listeners of a change a moment after it is made

		await smoke.sleep( 500 );

	} );

	const languageErrors = seen2.pageErrors.length - errorsBefore;

	check( 'a disposed viewer is not told of a change of language made by the next viewer on the page', languageErrors === 0, seen2.pageErrors.slice( errorsBefore, errorsBefore + 2 ).join( '; ' ) || 'no uncaught error' );

	// disposed while its survey's coordinate system is being looked up

	const dialogsBefore = seen2.dialogs.length;
	const errorsBeforeLoads = seen2.pageErrors.length;
	const rejectionsBefore = await page2.evaluate( () => smoke.rejections );

	const lookedUp = await page2.evaluate( async ( { survey } ) => {

		const data = new Uint8Array( await ( await fetch( '/surveys/' + survey ) ).arrayBuffer() );

		// the survey names the one coordinate system the viewer knows without asking: the
		// name is changed, to one of the same length, so that it has to ask

		const from = new TextEncoder().encode( 'epsg:27700' );
		const to = new TextEncoder().encode( 'epsg:27701' );

		let renamed = false;

		outer: for ( let i = 0; i <= data.length - from.length; i++ ) {

			for ( let j = 0; j < from.length; j++ ) if ( data[ i + j ] !== from[ j ] ) continue outer;

			data.set( to, i );
			renamed = true;
			break;

		}

		let caves = 0;

		viewer.addEventListener( 'newCave', () => caves++ );

		ui.loadCave( new File( [ data ], survey ) );

		await smoke.sleep( 2000 );

		return { renamed, lookups: smoke.lookups, disposed: smoke.disposedInLookup, caves, rejections: smoke.rejections };

	}, { survey: SURVEY_WITH_CRS } );

	const lookupDialogs = seen2.dialogs.length - dialogsBefore;

	check( 'a load that completes after dispose() ends silently: no alert, no rejection, no model', lookedUp.renamed && lookedUp.lookups === 1 && lookedUp.disposed && lookedUp.caves === 0 && lookupDialogs === 0 && lookedUp.rejections === rejectionsBefore && seen2.pageErrors.length === errorsBeforeLoads, `dialogs: ${lookupDialogs}, unhandled rejections: ${lookedUp.rejections - rejectionsBefore}` );

	// disposed before its survey has been fetched at all. The survey is held back for a
	// moment on its way, so that the request is still open when the viewer is disposed:
	// it is aborted then, where it would otherwise be left to complete for nobody.

	const dialogsBeforeAbort = seen2.dialogs.length;

	const surveyRequests = { asked: 0, completed: 0 };
	const isSurvey = url => new URL( url ).pathname === '/surveys/' + SURVEY;
	const onRequestFinished = request => { if ( isSurvey( request.url() ) ) surveyRequests.completed++; };

	page2.on( 'requestfinished', onRequestFinished );

	await page2.route( url => isSurvey( url.href ), async route => {

		surveyRequests.asked++;

		await new Promise( resolve => setTimeout( resolve, 500 ) );
		await route.continue().catch( () => {} );

	} );

	const aborted = await page2.evaluate( async ( { survey } ) => {

		const viewer = new CV2.CaveViewer( 'scene', { home: '/CaveView/', surveyDirectory: '/surveys/', language: 'en' } );
		const ui = new CV2.CaveViewUI( viewer );

		let caves = 0;

		viewer.addEventListener( 'newCave', () => caves++ );

		ui.loadCave( survey );
		ui.dispose();

		await smoke.sleep( 2000 );

		return { caves, rejections: smoke.rejections };

	}, { survey: SURVEY } );

	const abortDialogs = seen2.dialogs.length - dialogsBeforeAbort;

	check( 'a load given up by dispose() before the survey was fetched ends silently too', aborted.caves === 0 && abortDialogs === 0 && aborted.rejections === rejectionsBefore && seen2.pageErrors.length === errorsBeforeLoads, `dialogs: ${abortDialogs}, unhandled rejections: ${aborted.rejections - rejectionsBefore}` );

	page2.off( 'requestfinished', onRequestFinished );

	await page2.unroute( url => isSurvey( url.href ) ).catch( () => {} );

	check( 'and its request for the survey is aborted rather than left to complete', surveyRequests.asked <= 1 && surveyRequests.completed === 0, `asked: ${surveyRequests.asked}, completed: ${surveyRequests.completed}` );

	// a toolbar the host keeps beside the viewer, whose own container is what goes
	// fullscreen: refused, the container covers the page by its class and would cover the
	// bar with it, so the bar is taken into the container for as long as that lasts

	await page2.evaluate( () => {

		window.viewer = new CV2.CaveViewer( 'scene', { home: '/CaveView/', surveyDirectory: '/surveys/', language: 'en' } );
		window.toolbar = new CV2.CaveViewToolbar( window.viewer, 'bar', { buttons: [ 'fullscreen' ] } );

	} );

	const besideState = () => page2.evaluate( () => {

		const scene = document.getElementById( 'scene' );
		const button = document.querySelector( '.cv-toolbar-fullscreen' );
		const rect = button.getBoundingClientRect();
		const top = document.elementFromPoint( rect.left + rect.width / 2, rect.top + rect.height / 2 );

		return {
			marked: scene.classList.contains( 'toggle-fullscreen' ),
			covering: Math.round( scene.getBoundingClientRect().width ) === window.innerWidth,
			state: viewer.fullscreen,
			pressed: button.getAttribute( 'aria-pressed' ),
			inContainer: scene.contains( button ),
			inBar: document.getElementById( 'bar' ).contains( button ),
			reachable: top !== null && button.contains( top )
		};

	} );

	const besideBefore = await besideState();

	await press( page2, '.cv-toolbar-fullscreen' );
	await page2.waitForTimeout( 500 );

	const besideOn = await besideState();

	// pressed where the button now is - or, under the container, where it no longer is

	await press( page2, '.cv-toolbar-fullscreen' );
	await page2.waitForTimeout( 500 );

	const besideOff = await besideState();

	check( 'a toolbar beside a container that covers the page by its class is taken into it, and its button uncovers the page', besideBefore.inBar && ! besideBefore.inContainer && besideOn.marked && besideOn.covering && besideOn.state === true && besideOn.pressed === 'true' && besideOn.inContainer && besideOn.reachable && ! besideOff.marked && ! besideOff.covering && besideOff.state === false && besideOff.pressed === 'false' && besideOff.inBar && ! besideOff.inContainer, `covering: bar in the container ${besideOn.inContainer}, button reachable ${besideOn.reachable}; after the second press: marked ${besideOff.marked}` );

	// and that viewer disposed in the turn of a request the browser is about to refuse

	const disposedRefused = await page2.evaluate( async () => {

		const scene = document.getElementById( 'scene' );

		scene.classList.remove( 'toggle-fullscreen' );

		if ( viewer.fullscreen ) viewer.fullscreen = false;

		viewer.fullscreen = true;

		const marked = scene.classList.contains( 'toggle-fullscreen' );

		viewer.dispose();

		await smoke.sleep( 500 );

		return { marked, left: scene.classList.contains( 'toggle-fullscreen' ), rejections: smoke.rejections };

	} );

	check( 'a viewer disposed before the refusal of its request arrives leaves no class', disposedRefused.marked && ! disposedRefused.left && disposedRefused.rejections === rejectionsBefore, `marked at the request: ${disposedRefused.marked}, after the dispose: ${disposedRefused.left}` );

	const rejections2 = await page2.evaluate( () => smoke.rejections );

	const uncaught = seenByPage.reduce( ( total, each ) => total + each.pageErrors.length, 0 );
	const dialogs = seenByPage.reduce( ( total, each ) => total + each.dialogs.length, 0 );

	check( 'no uncaught error, no unhandled rejection and no dialog in either page', uncaught === 0 && dialogs === 0 && rejections1 + rejections2 === 0, `uncaught errors: ${uncaught}, unhandled rejections: ${rejections1 + rejections2}, dialogs: ${dialogs}` );

	await second.close();

} catch ( e ) {

	failed++;
	console.log( `FAIL ${passed + failed} - the test itself broke: ${e.message}` );

} finally {

	await browser.close();
	server.close();

}

const elapsed = ( ( Date.now() - started ) / 1000 ).toFixed( 1 );
const consoleErrors = seenByPage.flatMap( each => each.consoleErrors );
const resourceErrors = consoleErrors.filter( e => /Failed to load resource/.test( e ) ).length;
const refusalReports = consoleErrors.filter( e => /Permissions policy violation: fullscreen/.test( e ) ).length;

// what the console held besides the errors the test brings about itself, so that one
// nobody expected is read rather than counted

consoleErrors.filter( e => ! /Failed to load resource|Permissions policy violation: fullscreen/.test( e ) ).forEach( e => console.log( `# console error: ${e.slice( 0, 200 )}` ) );

console.log( `# ${passed + failed} assertions, ${passed} passed, ${failed} failed, in ${elapsed} s (console errors: ${consoleErrors.length}, of which ${resourceErrors} from the missing image asked for and ${refusalReports} the browser's own reports of a fullscreen it refused)` );

process.exit( failed === 0 ? 0 : 1 );
