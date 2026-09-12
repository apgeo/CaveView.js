import { Group, Raycaster, Vector3 } from '../Three';
import { FEATURE_LIVE_MARKERS } from '../core/constants';
import { MutableGlyphString } from '../core/GlyphString';
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

		// the collapsed markers displayed, one for each group of markers drawn in a single
		// place. Two markers in one place already write their labels over each other, and a
		// party underground moves together, so more than one marker in one place is the
		// ordinary case rather than an unlucky one.

		const clusters = [];

		// the objects tested when the pointer moves - the dot and labels of each marker
		// that is displayed

		const targets = [];

		const raycaster = new Raycaster();

		raycaster.layers.enableAll();
		raycaster.params.Points.threshold = POINT_THRESHOLD;

		let survey = null;
		let group = null;
		let labelMaterial = null;

		// what a collapsed marker says, decided by the application. The number of markers
		// collapsed is all the viewer knows to say of them.

		let clusterLabel = null;

		let hovered = null;
		let tracking = false;

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
				cluster: null,
				point: null,
				labelString: null,
				hoverString: null,
				from: null,
				to: null,
				t: 1
			};

			markers.set( id, marker );

			resolve( marker );

			draw();

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

			const from = drawnPosition( marker );

			// a move already under way is given up where the marker has reached: the station
			// named last is the one it is going to. A correction arriving before the next
			// frame is drawn - two reports of one position in a single batch, or a report
			// and its correction - must not leave the marker travelling to the station it
			// has just been taken off.

			stopFlight( marker );

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

			// a marker with nowhere to travel - moved to the station it is already at -
			// has no move to animate, and is redrawn where it stands

			if ( from !== null && marker.node !== null && ! from.equals( marker.node ) ) {

				marker.from = from;
				marker.to = new Vector3().copy( marker.node );
				marker.t = 0;

			}

			// whatever is drawn for the marker - its own objects, or the collapsed marker of
			// a group setting off with it - is placed at the start of the move by draw()

			draw();

			if ( marker.from !== null ) startMoving();

			viewer.renderView();

			return describe( marker );

		};

		this.remove = function ( id ) {

			const marker = markers.get( id );

			if ( marker === undefined ) return false;

			unmount( marker );
			markers.delete( id );

			draw();

			viewer.renderView();

			return true;

		};

		this.clear = function () {

			markers.forEach( unmount );
			markers.clear();

			draw();

			viewer.renderView();

		};

		this.list = function () {

			const list = [];

			markers.forEach( marker => list.push( describe( marker ) ) );

			return list;

		};

		this.setClusterLabel = function ( func ) {

			clusterLabel = ( typeof func === 'function' ) ? func : null;

			// the text of a collapsed marker is built into its label, so those displayed
			// are built again to say what the new function says of them

			draw();

			viewer.renderView();

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

		function newLabel ( text ) {

			// the text of a marker is chosen by the application and changes as it reports
			// the marker, so a geometry of its own is built for each label rather than one
			// taken from the cache shared between labels of the same text: a cached
			// geometry cannot be freed before the model it was built for is unloaded.
			// The label is spaced away from the dot in the same way an entrance name is.

			const label = new MutableGlyphString( ` ${text} `, labelMaterial );

			label.layers.set( FEATURE_LIVE_MARKERS );

			return label;

		}

		function mount ( marker ) {

			if ( group === null || marker.node === null || marker.object !== null ) return;

			const object = new Group();

			object.name = 'CV.LiveMarker';
			object.position.copy( currentPosition( marker ) );

			const point = new PointIndicator( ctx, marker.color ?? cfg.themeColor( 'stations.default.marker' ) );

			point.layers.set( FEATURE_LIVE_MARKERS );
			point.liveMarker = marker;

			const labelString = newLabel( marker.label );

			labelString.liveMarker = marker;

			object.addStatic( point );
			object.addStatic( labelString );

			group.addStatic( object );

			marker.object = object;
			marker.point = point;
			marker.labelString = labelString;
			marker.hoverString = null;

		}

		// what is drawn of a marker is taken down without its move being given up: a marker
		// of a group travelling together is taken down as the group is collapsed into the
		// single marker that then travels in its place

		function unmount ( marker ) {

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

		// a move is given up where the marker has reached

		function stopFlight ( marker ) {

			marker.from = null;
			marker.to = null;
			marker.t = 1;

		}

		// the markers drawn in a single place are drawn as a single marker, rather than as
		// labels written over one another. A collapsed marker stands for the set of markers
		// it was built for and says what that set says, so one whose set has changed, or
		// which no longer says what that set says, is built again rather than kept.

		function mountCluster ( members ) {

			if ( group === null ) return null;

			const cluster = {
				isCluster: true,
				markers: members.slice(),
				text: '',
				object: null,
				point: null,
				labelString: null
			};

			// asked for before anything is built, so that a label the application declines
			// to supply leaves nothing behind to be freed

			cluster.text = clusterText( cluster );

			const object = new Group();

			object.name = 'CV.LiveMarkerCluster';

			// markers of one colour are collapsed into a marker of that colour. Markers of
			// several colours have no colour between them to keep, and are collapsed into
			// a marker of the colour one that was given none is drawn in.

			const first = members[ 0 ].color;
			const color = members.every( marker => marker.color === first ) ? first : undefined;

			const point = new PointIndicator( ctx, color ?? cfg.themeColor( 'stations.default.marker' ) );

			point.layers.set( FEATURE_LIVE_MARKERS );
			point.liveCluster = cluster;

			const labelString = newLabel( cluster.text );

			labelString.liveCluster = cluster;

			object.addStatic( point );
			object.addStatic( labelString );

			group.addStatic( object );

			cluster.object = object;
			cluster.point = point;
			cluster.labelString = labelString;

			return cluster;

		}

		function unmountCluster ( cluster ) {

			if ( hovered === cluster ) hovered = null;

			cluster.point.material.dispose();
			cluster.labelString.geometry.dispose();

			cluster.object.removeFromParent();

			cluster.object = null;
			cluster.point = null;
			cluster.labelString = null;

		}

		function clusterText ( cluster ) {

			// what a collapsed marker stands for is the application's to say: it knows
			// what its markers are. How many there are is what the viewer knows.

			let text = null;

			if ( clusterLabel !== null ) {

				try {

					text = clusterLabel( cluster.markers.map( describe ) );

					if ( text !== null && text !== undefined ) text = String( text );

				} catch ( error ) {

					// an application that cannot say what a collapsed marker stands for
					// leaves the viewer saying how many markers it stands for. Whatever
					// went wrong is one label's worth of trouble, and taking the markers
					// off the model instead would lose the application the one thing it
					// asked the viewer to display.

					console.warn( 'CaveView: live marker cluster label: ', error );

					text = null;

				}

			}

			return ( text === null || text === undefined ) ? String( cluster.markers.length ) : text;

		}

		function sameMembers ( a, b ) {

			return a.length === b.length && a.every( ( marker, i ) => marker === b[ i ] );

		}

		function travellingTogether ( a, b ) {

			// two markers of one station are drawn in a single place where both are at it,
			// and where both are the same distance through the same move: a group that sets
			// off together is eased along one path, and so is coincident for the whole of
			// the move rather than only at its ends.

			if ( a.from === null || b.from === null ) return ( a.from === b.from );

			return ( a.t === b.t && a.from.equals( b.from ) );

		}

		function flightPosition ( marker ) {

			// eased, so that the marker leaves and arrives without a jolt

			const f = marker.t * marker.t * ( 3 - 2 * marker.t );

			return __v.copy( marker.from ).lerp( marker.to, f );

		}

		function currentPosition ( marker ) {

			// where the marker is drawn at this moment: at its station, or part of the way
			// between the two stations of a move it is making

			return ( marker.from === null ) ? marker.node : flightPosition( marker );

		}

		function drawnObject ( marker ) {

			// what is drawn for the marker: its own objects where it is drawn on its own,
			// and the collapsed marker of its group where it is one of several

			return marker.object ?? marker.cluster?.object ?? null;

		}

		function drawnPosition ( marker ) {

			const object = drawnObject( marker );

			return ( object === null ) ? null : new Vector3().copy( object.position );

		}

		function draw () {

			// which markers are drawn on their own and which are collapsed together is
			// settled here rather than as markers are added and moved, so that a marker
			// arriving at a station and one leaving it are the same decision made twice.
			// The markers drawn in a single place make a group, and are gathered by their
			// station first: a station holds more than one group only while some of its
			// markers are part of the way through a move and the rest are not.

			const groups = [];

			const stations = new Map();

			markers.forEach( marker => {

				marker.cluster = null;

				if ( marker.node === null ) return;

				let atStation = stations.get( marker.node );

				if ( atStation === undefined ) {

					atStation = [];

					stations.set( marker.node, atStation );

				}

				const group = atStation.find( members => travellingTogether( members[ 0 ], marker ) );

				if ( group === undefined ) {

					const members = [ marker ];

					atStation.push( members );
					groups.push( members );

				} else {

					group.push( marker );

				}

			} );

			// a marker of a group of several is not drawn - the collapsed marker of the
			// group is drawn in its place - and is taken down before that marker is built,
			// so that what is drawn is never both

			groups.forEach( members => {

				if ( members.length > 1 ) members.forEach( unmount ); else mount( members[ 0 ] );

			} );

			// a collapsed marker whose group is unchanged, and which still says what that
			// group says, is kept and moved rather than built again: a group that arrives
			// together at a station is the group that set off

			const spare = clusters.splice( 0 );

			groups.forEach( members => {

				if ( members.length < 2 ) return;

				const index = spare.findIndex( cluster => sameMembers( cluster.markers, members ) );

				let cluster = ( index === -1 ) ? null : spare.splice( index, 1 )[ 0 ];

				if ( cluster !== null && cluster.text !== clusterText( cluster ) ) {

					unmountCluster( cluster );

					cluster = null;

				}

				if ( cluster === null ) cluster = mountCluster( members );

				if ( cluster === null ) return;

				place( cluster.object, currentPosition( members[ 0 ] ) );

				members.forEach( marker => { marker.cluster = cluster; } );

				clusters.push( cluster );

			} );

			spare.forEach( unmountCluster );

			rebuildTargets();

		}

		function place ( object, position ) {

			// a marker is a static object of the model, so its matrix is maintained here
			// rather than on every frame by the renderer

			object.position.copy( position );
			object.updateMatrix();

		}

		function rebuildTargets () {

			targets.length = 0;

			markers.forEach( marker => {

				if ( marker.object === null ) return;

				targets.push( marker.point, marker.labelString );

				if ( marker.hoverString !== null ) targets.push( marker.hoverString );

			} );

			clusters.forEach( cluster => targets.push( cluster.point, cluster.labelString ) );

			// the pointer is only tracked while there is a marker to track it over

			const required = ( targets.length > 0 );

			if ( required === tracking ) return;

			tracking = required;

			if ( tracking ) {

				container.addEventListener( 'pointermove', onPointerMove );
				domElement.addEventListener( 'pointerleave', onPointerLeave );

			} else {

				container.removeEventListener( 'pointermove', onPointerMove );
				domElement.removeEventListener( 'pointerleave', onPointerLeave );

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
			let arrived = false;

			markers.forEach( marker => {

				if ( marker.from === null ) return;

				marker.t = Math.min( 1, marker.t + step );

				// whatever is drawn for the marker moves. A group travelling together is
				// drawn as a single marker, which each of them places at the one position
				// they share.

				const object = drawnObject( marker );

				if ( object !== null ) place( object, flightPosition( marker ) );

				if ( marker.t < 1 ) {

					moving = true;

				} else {

					stopFlight( marker );

					arrived = true;

				}

			} );

			// a marker that has arrived is collapsed with any already at its station

			if ( arrived ) draw();

			viewer.renderView();

			if ( moving ) {

				rafID = window.requestAnimationFrame( animate );

			} else {

				lastTime = 0;

			}

		}

		function showHoverLabel ( target, show ) {

			// a marker with nothing more to say displays its label however it is pointed
			// at, and a collapsed marker has nothing more of the viewer's to say: what it
			// stands for is displayed by the application that knows what that is

			if ( target.isCluster === true || target.sublabel === undefined || target.object === null ) return;

			if ( show && target.hoverString === null ) {

				target.hoverString = newLabel( `${target.label} - ${target.sublabel}` );
				target.hoverString.liveMarker = target;

				target.object.addStatic( target.hoverString );

				rebuildTargets();

			}

			if ( target.hoverString === null ) return;

			target.hoverString.visible = show;
			target.labelString.visible = ! show;

		}

		function hoverAt ( x, y, pointerType ) {

			viewer.setRaycaster( raycaster, viewer.getMouse( x, y ) );

			const hit = raycaster.intersectObjects( targets, false )[ 0 ]?.object;

			// a collapsed marker is pointed at in place of the markers it stands for,
			// which are not drawn while it is

			const target = hit?.liveCluster ?? hit?.liveMarker ?? null;

			if ( target === hovered ) return;

			if ( hovered !== null ) showHoverLabel( hovered, false );

			hovered = target;

			if ( target !== null ) {

				if ( target.isCluster === true ) {

					viewer.dispatchEvent( {
						type: 'liveMarkerCluster',
						markers: target.markers.map( describe ),
						pointerType: pointerType,
						handled: false
					} );

				} else {

					const hoverEvent = {
						type: 'liveMarkerHover',
						id: target.id,
						payload: target.payload,
						handled: false
					};

					viewer.dispatchEvent( hoverEvent );

					// a listener displaying its own information for the marker handles the
					// hover, which suppresses the label the marker would display itself

					if ( ! hoverEvent.handled ) showHoverLabel( target, true );

				}

			}

			viewer.renderView();

		}

		function onPointerMove ( event ) {

			if ( event.target !== domElement ) return;

			hoverAt( event.clientX, event.clientY, event.pointerType );

		}

		// the pointer leaving the model area ends the hover it was over: no further move is
		// reported there, so a hover left standing would keep a marker showing what it has
		// to say for as long as the pointer is away

		function onPointerLeave () {

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

				stopFlight( marker );
				unmount( marker );
				resolve( marker );

			} );

			draw();

		}

		function onClear () {

			stopMoving();

			clusters.forEach( unmountCluster );
			clusters.length = 0;

			markers.forEach( marker => {

				stopFlight( marker );
				unmount( marker );

				marker.cluster = null;
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
