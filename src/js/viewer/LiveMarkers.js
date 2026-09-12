import { Group, Raycaster, Vector3 } from '../Three';
import { FEATURE_LIVE_MARKERS } from '../core/constants';
import { MutableGlyphString } from '../core/GlyphString';
import { TapGesture, pointerHovers } from '../ui/PointerGestures';
import { PointIndicator } from './PointIndicator';

// duration of the move between two stations, in milliseconds

const MOVE_TIME = 600;

// a marker is picked by the label as well as by the dot, so a raycast threshold that
// matches the size of the dot on screen is not needed - the label is tested in screen
// space by its own raycast method

const POINT_THRESHOLD = 15;

const __v = new Vector3();

class LiveMarkers {

	constructor ( ctx, domElement ) {

		const viewer = ctx.viewer;
		const container = ctx.container;
		const cfg = ctx.cfg;

		// every marker asked for, whether or not it is in the loaded model. A marker that
		// names a station of a model that is not loaded is kept, and displayed if that
		// model is loaded later - an application that reloads a model does not have to
		// add its markers again.

		const markers = new Map();

		// the objects tested when the pointer moves - the dot and labels of each marker
		// that is displayed

		const targets = [];

		const raycaster = new Raycaster();

		raycaster.layers.enableAll();
		raycaster.params.Points.threshold = POINT_THRESHOLD;

		let survey = null;
		let group = null;
		let labelMaterial = null;

		let hovered = null;
		let tracking = false;

		// a pointer that does not hover reveals a marker by tapping it - see onPointerUp()

		const tap = new TapGesture();

		let rafID = 0;
		let lastTime = 0;

		viewer.addEventListener( 'newSurvey', onNewSurvey );
		viewer.addEventListener( 'clear', onClear );
		viewer.addEventListener( 'dispose', dispose );

		this.dispose = dispose;

		this.add = function ( id, ref, options = {} ) {

			if ( id === undefined || id === null ) {

				console.warn( 'a live marker requires an id' );
				return null;

			}

			// adding a marker that is already displayed replaces it

			const existing = markers.get( id );

			if ( existing !== undefined ) unmount( existing );

			const marker = {
				id: id,
				ref: copyRef( ref ),
				label: String( options.label ?? id ),
				sublabel: options.sublabel,
				color: options.color,
				payload: options.payload,
				node: null,
				object: null,
				point: null,
				labelString: null,
				hoverString: null,
				from: null,
				to: null,
				t: 1
			};

			markers.set( id, marker );

			resolve( marker );
			mount( marker );

			rebuildTargets();

			viewer.renderView();

			return describe( marker );

		};

		this.move = function ( id, ref, options ) {

			const marker = markers.get( id );

			if ( marker === undefined ) return null;

			// where the marker is displayed now, which the move starts from. A marker
			// that is displayed nowhere - its station is not in the loaded model, or
			// there is no model - has nothing to move from, and appears at its new
			// station rather than sliding in from somewhere it was never drawn

			const from = ( marker.object === null ) ? null : new Vector3().copy( marker.object.position );

			if ( options !== undefined ) {

				// the label and the colour are built into the objects of the marker, so
				// changing either means building them again

				assign( marker, options );
				unmount( marker );

			}

			marker.ref = copyRef( ref );

			resolve( marker );

			// a marker moved to a station that is not in the loaded model is displayed
			// nowhere, so what is drawn of it is taken down rather than left behind at
			// the station it has been moved away from

			if ( marker.node === null ) unmount( marker );

			mount( marker );

			if ( from !== null && marker.object !== null ) {

				marker.from = from;
				marker.to = new Vector3().copy( marker.node );
				marker.t = 0;

				place( marker, from );

				startMoving();

			}

			rebuildTargets();

			viewer.renderView();

			return describe( marker );

		};

		this.remove = function ( id ) {

			const marker = markers.get( id );

			if ( marker === undefined ) return false;

			unmount( marker );
			markers.delete( id );

			rebuildTargets();

			viewer.renderView();

			return true;

		};

		this.clear = function () {

			markers.forEach( unmount );
			markers.clear();

			rebuildTargets();

			viewer.renderView();

		};

		this.list = function () {

			const list = [];

			markers.forEach( marker => list.push( describe( marker ) ) );

			return list;

		};

		return;

		// a reference may be given as an array of the components of a station path, which
		// the marker then holds. It is copied on the way in and on the way out again, so
		// that a description of a marker really is a copy of it: neither the application
		// nor the marker can change a reference the other is working from.

		function copyRef ( ref ) {

			return Array.isArray( ref ) ? ref.slice() : ref;

		}

		function describe ( marker ) {

			return {
				id: marker.id,
				ref: copyRef( marker.ref ),
				label: marker.label,
				sublabel: marker.sublabel,
				color: marker.color,
				payload: marker.payload,
				resolved: ( marker.node !== null )
			};

		}

		function assign ( marker, options ) {

			if ( options.label !== undefined ) marker.label = String( options.label );
			if ( options.sublabel !== undefined ) marker.sublabel = options.sublabel;
			if ( options.color !== undefined ) marker.color = options.color;
			if ( options.payload !== undefined ) marker.payload = options.payload;

		}

		function resolve ( marker ) {

			const node = ( survey === null ) ? null : survey.surveyTree.getByRef( marker.ref );

			marker.node = ( node !== null && node.isStation() ) ? node : null;

		}

		function newLabel ( marker, text ) {

			// the text of a marker is chosen by the application and changes as it reports
			// the marker, so a geometry of its own is built for each label rather than one
			// taken from the cache shared between labels of the same text: a cached
			// geometry cannot be freed before the model it was built for is unloaded.
			// The label is spaced away from the dot in the same way an entrance name is.

			const label = new MutableGlyphString( ` ${text} `, labelMaterial );

			label.layers.set( FEATURE_LIVE_MARKERS );
			label.liveMarker = marker;

			return label;

		}

		function mount ( marker ) {

			if ( group === null || marker.node === null || marker.object !== null ) return;

			const object = new Group();

			object.name = 'CV.LiveMarker';
			object.position.copy( marker.node );

			const point = new PointIndicator( ctx, marker.color ?? cfg.themeColor( 'stations.default.marker' ) );

			point.layers.set( FEATURE_LIVE_MARKERS );
			point.liveMarker = marker;

			const labelString = newLabel( marker, marker.label );

			object.addStatic( point );
			object.addStatic( labelString );

			group.addStatic( object );

			marker.object = object;
			marker.point = point;
			marker.labelString = labelString;
			marker.hoverString = null;

		}

		function unmount ( marker ) {

			marker.from = null;
			marker.to = null;
			marker.t = 1;

			if ( hovered === marker ) hovered = null;

			if ( marker.object === null ) return;

			// the label material is shared with the labels of the model and is left alone,
			// but the dot material and the label geometries belong to this marker alone

			marker.point.material.dispose();
			marker.labelString.geometry.dispose();
			marker.hoverString?.geometry.dispose();

			marker.object.removeFromParent();

			marker.object = null;
			marker.point = null;
			marker.labelString = null;
			marker.hoverString = null;

		}

		function place ( marker, position ) {

			// the marker is a static object of the model, so its matrix is maintained
			// here rather than on every frame by the renderer

			marker.object.position.copy( position );
			marker.object.updateMatrix();

		}

		function rebuildTargets () {

			targets.length = 0;

			markers.forEach( marker => {

				if ( marker.object === null ) return;

				targets.push( marker.point, marker.labelString );

				if ( marker.hoverString !== null ) targets.push( marker.hoverString );

			} );

			// the pointer is only tracked while there is a marker to track it over

			const required = ( targets.length > 0 );

			if ( required === tracking ) return;

			tracking = required;

			if ( tracking ) {

				container.addEventListener( 'pointermove', onPointerMove );
				container.addEventListener( 'pointerdown', onPointerDown );
				container.addEventListener( 'pointerup', onPointerUp );
				container.addEventListener( 'pointercancel', onPointerCancel );
				domElement.addEventListener( 'pointerleave', onPointerLeave );

			} else {

				container.removeEventListener( 'pointermove', onPointerMove );
				container.removeEventListener( 'pointerdown', onPointerDown );
				container.removeEventListener( 'pointerup', onPointerUp );
				container.removeEventListener( 'pointercancel', onPointerCancel );
				domElement.removeEventListener( 'pointerleave', onPointerLeave );

				tap.cancel();

				hovered = null;

			}

		}

		function startMoving () {

			if ( rafID !== 0 ) return;

			lastTime = 0;
			rafID = window.requestAnimationFrame( animate );

		}

		function stopMoving () {

			if ( rafID !== 0 ) window.cancelAnimationFrame( rafID );

			rafID = 0;
			lastTime = 0;

		}

		function animate ( time ) {

			rafID = 0;

			if ( lastTime === 0 ) lastTime = time;

			const step = ( time - lastTime ) / MOVE_TIME;

			lastTime = time;

			let moving = false;

			markers.forEach( marker => {

				if ( marker.from === null || marker.object === null ) return;

				marker.t = Math.min( 1, marker.t + step );

				// eased, so that the marker leaves and arrives without a jolt

				const f = marker.t * marker.t * ( 3 - 2 * marker.t );

				place( marker, __v.copy( marker.from ).lerp( marker.to, f ) );

				if ( marker.t < 1 ) {

					moving = true;

				} else {

					marker.from = null;
					marker.to = null;

				}

			} );

			viewer.renderView();

			if ( moving ) {

				rafID = window.requestAnimationFrame( animate );

			} else {

				lastTime = 0;

			}

		}

		function showHoverLabel ( marker, show ) {

			// a marker with nothing more to say displays its label however it is pointed at

			if ( marker.sublabel === undefined || marker.object === null ) return;

			if ( show && marker.hoverString === null ) {

				marker.hoverString = newLabel( marker, `${marker.label} - ${marker.sublabel}` );

				marker.object.addStatic( marker.hoverString );

				rebuildTargets();

			}

			if ( marker.hoverString === null ) return;

			marker.hoverString.visible = show;
			marker.labelString.visible = ! show;

		}

		function hoverAt ( x, y, pointerType ) {

			viewer.setRaycaster( raycaster, viewer.getMouse( x, y ) );

			const hit = raycaster.intersectObjects( targets, false )[ 0 ];
			const marker = hit?.object.liveMarker ?? null;

			if ( marker === hovered ) return;

			if ( hovered !== null ) showHoverLabel( hovered, false );

			hovered = marker;

			if ( marker !== null ) {

				const hoverEvent = {
					type: 'liveMarkerHover',
					id: marker.id,
					payload: marker.payload,
					pointerType: pointerType,
					handled: false
				};

				viewer.dispatchEvent( hoverEvent );

				// a listener displaying its own information for the marker handles the
				// hover, which suppresses the label the marker would display itself

				if ( ! hoverEvent.handled ) showHoverLabel( marker, true );

			}

			viewer.renderView();

		}

		function onPointerMove ( event ) {

			// where the pointer goes while it is down is what tells a tap from the drag
			// that turns the model, and is followed wherever it goes: a gesture that
			// crosses something displayed over the model is still that gesture

			tap.move( event );

			if ( event.target !== domElement ) return;

			// a pointer that does not hover is dragging the model while it is down, which
			// reveals nothing: what a hover would reveal, a tap of the same pointer does

			if ( event.buttons !== 0 && ! pointerHovers( event.pointerType ) ) return;

			hoverAt( event.clientX, event.clientY, event.pointerType );

		}

		function onPointerDown ( event ) {

			if ( event.target !== domElement ) {

				// a gesture begun over something placed over the model is not a tap of a
				// marker, whatever it ends over

				tap.cancel();

				return;

			}

			tap.start( event );

		}

		// what a mouse reveals by being moved onto a marker, a pointer that does not hover
		// reveals by tapping it, and a tap on anything else ends the hover as moving the
		// mouse off the marker does

		function onPointerUp ( event ) {

			if ( ! tap.end( event ) ) return;

			hoverAt( event.clientX, event.clientY, event.pointerType );

		}

		function onPointerCancel () {

			tap.cancel();

		}

		// the pointer leaving the model area ends the hover it was over: no further move is
		// reported there, so a hover left standing would keep a marker showing what it has
		// to say for as long as the pointer is away

		function onPointerLeave ( event ) {

			// a pointer that does not hover ceases to exist as it is lifted, which the
			// browser reports as that pointer leaving the element - immediately after the
			// pointerup that a tap is recognised by. What a tap reveals is left revealed
			// until something else is tapped, exactly as what a hover reveals is left
			// until the pointer is moved off it.

			if ( ! pointerHovers( event.pointerType ) ) return;

			if ( hovered === null ) return;

			showHoverLabel( hovered, false );

			hovered = null;

			viewer.renderView();

		}

		function onNewSurvey ( event ) {

			survey = event.survey;

			// the label material of the model that has gone is not the one to draw with

			labelMaterial = ctx.materials.getLabelMaterial( 'stations.default' );

			group = new Group();
			group.name = 'CV.LiveMarkers';

			survey.addStatic( group );

			// the markers name stations rather than positions, so the set is resolved
			// against the model now loaded and displayed where it names something in it

			markers.forEach( marker => {

				unmount( marker );
				resolve( marker );
				mount( marker );

			} );

			rebuildTargets();

		}

		function onClear () {

			stopMoving();

			markers.forEach( marker => {

				unmount( marker );
				marker.node = null;

			} );

			rebuildTargets();

			survey = null;
			group = null;
			labelMaterial = null;

		}

		function dispose () {

			onClear();

			markers.clear();

			viewer.removeEventListener( 'newSurvey', onNewSurvey );
			viewer.removeEventListener( 'clear', onClear );
			viewer.removeEventListener( 'dispose', dispose );

		}

	}

}

export { LiveMarkers };
