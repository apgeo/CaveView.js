// A smoke test of the built bundle in a real browser - see README.md in this directory.
//
// It serves build/ on 127.0.0.1, loads the UMD bundle in headless Chromium, loads one of the
// surveys of docs/surveys/, and drives the viewer's public API through the things a host
// application does, asserting counts and verdicts only. Software rendering is expected,
// so every wait is generous.

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

const started = Date.now();

if ( ! fs.existsSync( bundle ) ) fail( `no bundle at ${bundle} - run \`npm run build\` first` );

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

const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="/CaveView/css/caveview.css">
<style>
	body { margin: 0; background: #000; }
	#wrap { width: 800px; }
	#scene { width: 800px; height: 600px; position: relative; }
	#field { display: block; margin-top: 8px; }
</style>
</head>
<body>
<div id="wrap"><div id="scene"></div></div>
<input id="field" type="text">
<script src="/CaveView/js/CaveView2.min.js"></script>
</body></html>`;

const server = http.createServer( ( req, res ) => {

	const url = new URL( req.url, 'http://127.0.0.1' );

	if ( url.pathname === '/smoke.html' ) {

		res.writeHead( 200, { 'content-type': 'text/html' } );
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

const context = await browser.newContext( { viewport: { width: 1000, height: 760 } } );

// nothing leaves the machine: a survey without a known CRS asks for no terrain, and a
// request to anywhere else would be a defect of the test rather than of the viewer

await context.route( url => ! url.href.startsWith( base ), route => route.abort() );

const page = await context.newPage();

page.setDefaultTimeout( TIMEOUT );

// a viewer in a browser that is online looks for terrain on the web once a survey is loaded,
// and reports the survey complete only when that search has ended; the page is told it is
// offline, so the survey is complete as soon as it is loaded and nothing is asked for

await page.addInitScript( () => { Object.defineProperty( navigator, 'onLine', { get: () => false } ); } );

const pageErrors = [];
const consoleErrors = [];

page.on( 'pageerror', err => pageErrors.push( err.message ) );
page.on( 'console', msg => { if ( msg.type() === 'error' ) consoleErrors.push( msg.text() ); } );

try {

	await page.goto( base + '/smoke.html' );

	// the viewer, the user interface (for its keyboard controls) and the survey

	const loaded = await page.evaluate( async ( { survey, timeout } ) => {

		const wait = ( type, ms ) => new Promise( ( resolve, reject ) => {

			const timer = setTimeout( () => reject( new Error( `no ${type} event within ${ms} ms` ) ), ms );

			viewer.addEventListener( type, function once ( event ) {

				viewer.removeEventListener( type, once );
				clearTimeout( timer );
				resolve( event );

			} );

		} );

		const viewer = new CV2.CaveViewer( 'scene', {
			home: '/CaveView/',
			surveyDirectory: '/surveys/',
			terrainDirectory: '/terrain/',
			fullscreenElement: 'wrap',
			view: { stations: true, stationLabelOver: true }
		} );

		window.viewer = viewer;
		window.ui = new CV2.CaveViewUI( viewer );

		const newSurvey = wait( 'newSurvey', timeout );
		const newCave = wait( 'newCave', timeout );

		// loaded through the user interface, whose pages describe the source they loaded

		window.ui.loadCave( survey );

		await newSurvey;
		await newCave;

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

		return { stations, far: far === null ? null : far.getPath(), leg, version: CV2.VERSION, versionLines };

	}, { survey: SURVEY, timeout: TIMEOUT } );

	check( 'newSurvey and newCave fire and the station count is above zero', loaded.stations > 0, `stations: ${loaded.stations}` );
	check( 'a station and a leg can be resolved from the tree', loaded.far !== null && loaded.leg !== null );
	check( 'the help page names the version from the catalogue', loaded.versionLines === 1, `CaveView ${loaded.version}` );

	// the camera: focusing a station, and framing the live markers

	const focus = await page.evaluate( async ( { far } ) => {

		const controls = viewer.getControls();
		const before = controls.target.clone();

		const station = await viewer.focusStation( far );

		return { ok: station !== null && station.name() === far, moved: before.distanceTo( controls.target ) };

	}, { far: loaded.far } );

	check( 'focusStation() resolves with the station and moves the camera target', focus.ok && focus.moved > 0, `target moved ${focus.moved.toFixed( 1 )} units` );

	const markers = await page.evaluate( async ( { far, leg } ) => {

		const none = viewer.frameLiveMarkers();

		const added = viewer.addLiveMarker( 'smoke', far, { label: 'smoke' } );
		const listed = viewer.getLiveMarkers().length;

		const moved = viewer.moveLiveMarker( 'smoke', leg.end, { duration: 0 } );

		const target = viewer.getControls().target.clone();

		const framed = viewer.frameLiveMarkers();

		const arrived = await new Promise( resolve => {

			const timer = setTimeout( () => resolve( false ), 30000 );

			viewer.addEventListener( 'moved', function once () {

				viewer.removeEventListener( 'moved', once );
				clearTimeout( timer );
				resolve( true );

			} );

		} );

		const removed = viewer.removeLiveMarker( 'smoke' );
		const left = viewer.getLiveMarkers().length;

		return {
			none,
			added: added !== null && added.resolved === true,
			listed,
			moved: moved !== null && moved.resolved === true && moved.ref === leg.end,
			framed,
			arrived,
			targetMoved: target.distanceTo( viewer.getControls().target ),
			removed,
			left
		};

	}, loaded );

	check( 'frameLiveMarkers() returns false with no marker placed', markers.none === false );
	check( 'addLiveMarker() / moveLiveMarker() / removeLiveMarker() round-trip', markers.added && markers.listed === 1 && markers.moved && markers.removed === true && markers.left === 0 );
	check( 'frameLiveMarkers() returns true with a marker placed and the camera moves', markers.framed === true && markers.arrived, `target moved ${markers.targetMoved.toFixed( 1 )} units` );

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

		while ( Date.now() < deadline && ( errors === 0 || strip.childElementCount > 0 ) ) await new Promise( r => setTimeout( r, 100 ) );

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

	const scene = await page.locator( '#scene' ).boundingBox();

	await page.mouse.move( scene.x + 40, scene.y + scene.height / 2 );

	await page.evaluate( () => { viewer.shadingMode = CV2.SHADING_HEIGHT; document.activeElement.blur(); } );
	await page.keyboard.press( '3' );

	const direct = await page.evaluate( () => ( { mouseOver: viewer.mouseOver, shading: viewer.shadingMode, length: CV2.SHADING_LENGTH } ) );

	check( 'a key pressed with the pointer over the model and nothing focused drives the viewer', direct.mouseOver === true && direct.shading === direct.length );

	await page.evaluate( () => { viewer.shadingMode = CV2.SHADING_HEIGHT; } );
	await page.focus( '#field' );
	await page.keyboard.type( '23' );

	const typed = await page.evaluate( () => ( { value: document.getElementById( 'field' ).value, shading: viewer.shadingMode, height: CV2.SHADING_HEIGHT, mouseOver: viewer.mouseOver } ) );

	check( 'keys typed into an input with the pointer over the model reach the input and not the viewer', typed.value === '23' && typed.shading === typed.height && typed.mouseOver === true, `field holds '${typed.value}'` );

	// fullscreen, as far as a headless browser can go

	const fullscreen = await page.evaluate( () => ( {
		element: viewer.fullscreenElement === document.getElementById( 'wrap' ),
		state: viewer.fullscreen,
		reducedMotion: viewer.reducedMotion
	} ) );

	check( 'the fullscreenElement option is reported by the getter and the viewer is not fullscreen', fullscreen.element === true && fullscreen.state === false );
	check( 'the reducedMotion property is reported', fullscreen.reducedMotion === false );

	// dispose, and the calls a host may still make afterwards

	const disposed = await page.evaluate( () => {

		const thrown = [];

		viewer.dispose();

		for ( const call of [ 'renderView', 'resize', 'resetRenderer', 'clearView', 'dispose', 'endCapture' ] ) {

			try { viewer[ call ](); } catch ( e ) { thrown.push( call + ': ' + e.message ); }

		}

		return thrown;

	} );

	check( 'renderView() and the other entry points do not throw after dispose()', disposed.length === 0, disposed.join( '; ' ) || 'nothing thrown' );

	check( 'no uncaught error in the page', pageErrors.length === 0, pageErrors.slice( 0, 3 ).join( '; ' ) || 'none' );

} catch ( e ) {

	failed++;
	console.log( `FAIL ${passed + failed} - the test itself broke: ${e.message}` );

} finally {

	await browser.close();
	server.close();

}

const elapsed = ( ( Date.now() - started ) / 1000 ).toFixed( 1 );
const resourceErrors = consoleErrors.filter( e => /Failed to load resource/.test( e ) ).length;

console.log( `# ${passed + failed} assertions, ${passed} passed, ${failed} failed, in ${elapsed} s (console errors: ${consoleErrors.length}, of which ${resourceErrors} from the missing image asked for)` );

process.exit( failed === 0 ? 0 : 1 );
