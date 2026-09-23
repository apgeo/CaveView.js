import { Group, Vector3 } from '../Three';
import { LineSegments2 } from '../core/LineSegments2';
import { LineSegmentsGeometry } from '../core/LineSegmentsGeometry';
import { Line2Material } from '../materials/Line2Material';
import { LEG_CAVE } from '../core/constants';

// a trail is the way somebody went: an ordered list of places, drawn as the route the
// survey says joins them rather than as straight lines between them. Two stations forty
// metres apart in space may be a hundred and forty metres apart underground, and the
// straight line between them goes through rock - so a trail that joined its points
// directly would draw a passage that does not exist, in a viewer whose whole purpose is
// to say where passages are.
//
// what a trail is NOT: it is not a route in the sense the Routes class means, which is a
// named set of segments stored in a survey's own metadata and edited by the person
// reading it. A trail belongs to the application, is not stored anywhere, and names
// stations rather than segments - the same relationship LiveMarkers has to the markers of
// the model.

const DEFAULT_WIDTH = 4;
const DEFAULT_COLOR = '#ffcc00';
const DEFAULT_DASH_SIZE = 6;
const DEFAULT_GAP_SIZE = 6;

// a pair of places the survey cannot join is drawn as a straight dashed line and reported
// as a gap. It is drawn at all because leaving it out would silently shorten the trail -
// the reader would see two disconnected pieces and no reason for the space between them -
// and it is drawn differently because the viewer does not know that way and must not
// appear to.

function copyRef ( ref ) {

	return Array.isArray( ref ) ? ref.slice() : ref;

}

// a minimum-distance search over the cave legs, with its own distance and predecessor
// maps.
//
// Legs.setShortestPaths() would answer the same question and is not used, deliberately:
// it labels every station in the model with its distance from the target and Survey's
// wrapper around it switches the model to distance shading. Both are what that call is
// for - it exists to colour a cave by how far away things are - and both would be a
// surprising thing for adding a trail to do to a model somebody is looking at. Drawing a
// line must not repaint the cave.

function pathBetween ( legs, from, to ) {

	if ( from === to ) return [ from ];

	const vertices = legs.legVertices;
	const lengths = legs.legLengths;

	if ( vertices === undefined || vertices.length === 0 ) return null;

	const distance = new Map();
	const cameFrom = new Map();

	// a binary heap keyed on distance. A model of any size has tens of thousands of legs
	// and a trail may ask for a dozen paths across it, so the linear scan a smaller graph
	// would forgive is not affordable here.

	const heap = [];

	function push ( station, d ) {

		heap.push( { station: station, d: d } );

		let i = heap.length - 1;

		while ( i > 0 ) {

			const parent = ( i - 1 ) >> 1;

			if ( heap[ parent ].d <= heap[ i ].d ) break;

			const swap = heap[ parent ];
			heap[ parent ] = heap[ i ];
			heap[ i ] = swap;

			i = parent;

		}

	}

	function pop () {

		const top = heap[ 0 ];
		const last = heap.pop();

		if ( heap.length === 0 ) return top;

		heap[ 0 ] = last;

		let i = 0;

		for ( ; ; ) {

			const left = 2 * i + 1;
			const right = left + 1;
			let smallest = i;

			if ( left < heap.length && heap[ left ].d < heap[ smallest ].d ) smallest = left;
			if ( right < heap.length && heap[ right ].d < heap[ smallest ].d ) smallest = right;

			if ( smallest === i ) break;

			const swap = heap[ smallest ];
			heap[ smallest ] = heap[ i ];
			heap[ i ] = swap;

			i = smallest;

		}

		return top;

	}

	distance.set( from, 0 );
	push( from, 0 );

	while ( heap.length > 0 ) {

		const entry = pop();
		const station = entry.station;

		// the heap holds superseded entries rather than being re-keyed, so an entry whose
		// distance is no longer the best known has already been dealt with

		if ( entry.d > ( distance.get( station ) ?? Infinity ) ) continue;

		if ( station === to ) break;

		const stationLegs = station.legs;

		if ( stationLegs === undefined ) continue;

		for ( let i = 0; i < stationLegs.length; i++ ) {

			const leg = stationLegs[ i ];
			const v1 = vertices[ leg ];
			const next = ( v1 === station ) ? vertices[ leg + 1 ] : v1;

			if ( next === undefined ) continue;

			const step = lengths[ leg / 2 ] ?? 0;
			const through = entry.d + step;

			if ( through < ( distance.get( next ) ?? Infinity ) ) {

				distance.set( next, through );
				cameFrom.set( next, station );
				push( next, through );

			}

		}

	}

	if ( ! distance.has( to ) ) return null;

	const path = [ to ];

	let at = to;

	while ( at !== from ) {

		at = cameFrom.get( at );

		if ( at === undefined ) return null;

		path.push( at );

	}

	return path.reverse();

}

class SurveyTrails {

	constructor ( ctx ) {

		const viewer = ctx.viewer;

		// every trail asked for, whether or not the loaded model contains the places it
		// names. A trail is kept when a model is cleared and drawn again if a model
		// holding its stations is loaded - the same promise LiveMarkers makes, so an
		// application that reloads a survey does not have to add its trails again.

		const trails = new Map();

		let survey = null;
		let group = null;

		viewer.addEventListener( 'newSurvey', onNewSurvey );
		viewer.addEventListener( 'clear', onClear );
		viewer.addEventListener( 'dispose', dispose );

		this.dispose = dispose;

		this.add = function ( id, refs, options = {} ) {

			if ( id === undefined || id === null ) {

				console.warn( 'a trail requires an id' );
				return null;

			}

			const existing = trails.get( id );

			if ( existing !== undefined ) unmount( existing );

			const trail = {
				id: id,
				refs: ( refs ?? [] ).map( copyRef ),
				color: options.color ?? DEFAULT_COLOR,
				width: options.width ?? DEFAULT_WIDTH,
				style: ( options.style === 'dashed' ) ? 'dashed' : 'solid',
				visible: options.visible !== false,
				progress: clampProgress( options.progress ),
				payload: options.payload,
				// filled by build()
				points: [],
				segments: [],
				lengthM: 0,
				gaps: [],
				solid: null,
				dashed: null
			};

			trails.set( id, trail );

			build( trail );
			draw( trail );

			viewer.renderView();

			return describe( trail );

		};

		this.update = function ( id, refs, options ) {

			const trail = trails.get( id );

			if ( trail === undefined ) return null;

			if ( refs !== undefined && refs !== null ) trail.refs = refs.map( copyRef );

			if ( options !== undefined ) {

				if ( options.color !== undefined ) trail.color = options.color;
				if ( options.width !== undefined ) trail.width = options.width;
				if ( options.style !== undefined ) trail.style = ( options.style === 'dashed' ) ? 'dashed' : 'solid';
				if ( options.visible !== undefined ) trail.visible = options.visible !== false;
				if ( options.payload !== undefined ) trail.payload = options.payload;
				if ( options.progress !== undefined ) trail.progress = clampProgress( options.progress );

			}

			// the geometry is rebuilt only when what it draws has changed. Colour, width
			// and visibility are properties of the objects already built, and a playback
			// that changed only how much of the trail is drawn must not re-route it
			// across the survey on every frame.

			if ( refs !== undefined && refs !== null ) {

				unmount( trail );
				build( trail );

			}

			draw( trail );

			viewer.renderView();

			return describe( trail );

		};

		// how much of the trail is drawn, as a fraction of its length.
		//
		// Length rather than count of places, so that a playback moves at the speed the
		// party did: an hour spent crossing one long pitch is one point of the log and a
		// great deal of the cave. getTrails() reports each place's distance along the
		// trail, which is what turns "they have reached the fourth place reported" into
		// a fraction.

		this.setProgress = function ( id, value ) {

			const trail = trails.get( id );

			if ( trail === undefined ) return null;

			trail.progress = clampProgress( value );

			applyProgress( trail );

			viewer.renderView();

			return describe( trail );

		};

		this.remove = function ( id ) {

			const trail = trails.get( id );

			if ( trail === undefined ) return false;

			unmount( trail );
			trails.delete( id );

			viewer.renderView();

			return true;

		};

		this.clear = function () {

			trails.forEach( unmount );
			trails.clear();

			viewer.renderView();

		};

		this.list = function () {

			const list = [];

			trails.forEach( trail => list.push( describe( trail ) ) );

			return list;

		};

		// ---- what the application is told ----------------------------------------

		// a trail reports every place it was given and what became of it, so that an
		// application can say which of them the loaded survey does not contain rather
		// than drawing a shorter line and leaving the reader to wonder. The same stance
		// as an unresolved marker: kept in the set, reported, drawn nowhere.

		function describe ( trail ) {

			return {
				id: trail.id,
				resolved: trail.points.every( p => p.resolved ),
				points: trail.points.map( p => ( {
					ref: copyRef( p.ref ),
					resolved: p.resolved,
					atLength: p.atLength
				} ) ),
				gaps: trail.gaps.slice(),
				lengthM: trail.lengthM,
				progress: trail.progress,
				visible: trail.visible,
				payload: trail.payload
			};

		}

		function clampProgress ( value ) {

			if ( value === undefined || value === null ) return 1;

			const n = Number( value );

			if ( ! isFinite( n ) ) return 1;

			return Math.min( 1, Math.max( 0, n ) );

		}

		// ---- building the line ---------------------------------------------------

		function build ( trail ) {

			trail.points = [];
			trail.segments = [];
			trail.gaps = [];
			trail.lengthM = 0;

			const tree = ( survey === null ) ? null : survey.surveyTree;
			const legs = ( survey === null ) ? null : survey.getFeature( LEG_CAVE );

			// a station of the reference, or null. A reference that names a survey
			// section rather than a station is not a place somebody can be, so it is
			// reported unresolved rather than being framed - a trail is a line through
			// places, and a section is not one.

			const nodes = trail.refs.map( ref => {

				const node = ( tree === null ) ? null : tree.getByRef( ref );

				return ( node !== null && node !== undefined && node.isStation() ) ? node : null;

			} );

			let previous = null;
			let previousIndex = -1;

			nodes.forEach( ( node, i ) => {

				trail.points.push( {
					ref: trail.refs[ i ],
					resolved: node !== null,
					atLength: null
				} );

				if ( node === null ) return;

				if ( previous === null ) {

					trail.points[ i ].atLength = 0;
					previous = node;
					previousIndex = i;
					return;

				}

				// two reports of the same place - a party who stayed put - contribute no
				// line and no length, but the place still sits where the last one did

				if ( previous === node ) {

					trail.points[ i ].atLength = trail.lengthM;
					previousIndex = i;
					return;

				}

				const path = ( legs === null ) ? null : pathBetween( legs, previous, node );

				if ( path === null ) {

					// the survey does not join these two. Drawn straight and dashed, and
					// named in the report: the line has to be continuous or the trail
					// reads as two trails, but it must not claim to be a passage.

					trail.gaps.push( {
						from: copyRef( trail.refs[ previousIndex ] ),
						to: copyRef( trail.refs[ i ] )
					} );

					addSegment( trail, previous, node, true );

				} else {

					for ( let p = 1; p < path.length; p++ ) {

						addSegment( trail, path[ p - 1 ], path[ p ], false );

					}

				}

				trail.points[ i ].atLength = trail.lengthM;
				previous = node;
				previousIndex = i;

			} );

		}

		const __a = new Vector3();
		const __b = new Vector3();

		function addSegment ( trail, from, to, isGap ) {

			// the geographical distance, so that a trail's length is measured the way the
			// survey's own lengths are - the model's coordinates are not metres in every
			// projection, and a length used to pace a playback must be the real one

			__a.set( from.x, from.y, from.z );
			__b.set( to.x, to.y, to.z );

			const length = ( survey !== null && survey.getGeographicalDistance !== undefined )
				? survey.getGeographicalDistance( from, to )
				: __a.distanceTo( __b );

			trail.lengthM += length;

			trail.segments.push( {
				ax: from.x, ay: from.y, az: from.z,
				bx: to.x, by: to.y, bz: to.z,
				gap: isGap,
				atLength: trail.lengthM
			} );

		}

		// ---- drawing -------------------------------------------------------------

		function draw ( trail ) {

			unmount( trail );

			if ( group === null || trail.segments.length === 0 ) return;

			// two objects, because a gap is drawn dashed and a dash pattern is a property
			// of the material rather than of the segment. Either may be empty.

			const routed = trail.segments.filter( s => ! s.gap );
			const gapped = trail.segments.filter( s => s.gap );

			trail.solid = ( routed.length > 0 )
				? lineFor( routed, trail, trail.style === 'dashed' )
				: null;

			trail.dashed = ( gapped.length > 0 ) ? lineFor( gapped, trail, true ) : null;

			if ( trail.solid !== null ) group.add( trail.solid );
			if ( trail.dashed !== null ) group.add( trail.dashed );

			applyProgress( trail );

		}

		function lineFor ( segments, trail, dashed ) {

			const positions = [];

			segments.forEach( s => {

				positions.push( s.ax, s.ay, s.az, s.bx, s.by, s.bz );

			} );

			const geometry = new LineSegmentsGeometry();

			geometry.setPositions( positions );

			const defines = { CV_BASIC: true };

			if ( dashed ) defines.USE_DASH = true;

			const material = new Line2Material( ctx, {
				color: trail.color,
				linewidth: trail.width,
				dashSize: DEFAULT_DASH_SIZE,
				gapSize: DEFAULT_GAP_SIZE
			}, defines );

			// the line is drawn over the survey rather than fighting it for the same
			// depth: a trail follows legs the model has already drawn, so without this
			// the two flicker against each other wherever they coincide

			material.depthTest = false;
			material.transparent = true;

			const line = new LineSegments2( geometry, material );

			line.name = 'CV.SurveyTrail.' + trail.id;
			line.renderOrder = 1;
			line.visible = trail.visible;
			line.userData.segments = segments;

			return line;

		}

		// how much of the line is drawn. Whole segments: the exact position between two
		// stations is what a marker is for, and rewriting geometry on every frame of a
		// playback to shave a few metres off a line would cost far more than it shows.

		function applyProgress ( trail ) {

			const shown = trail.lengthM * trail.progress;

			[ trail.solid, trail.dashed ].forEach( line => {

				if ( line === null ) return;

				line.visible = trail.visible;

				const segments = line.userData.segments;
				const hide = new Float32Array( segments.length );

				for ( let i = 0; i < segments.length; i++ ) {

					// 1 hides, 0 draws - the fragment shader discards where the attribute
					// is above zero

					hide[ i ] = ( segments[ i ].atLength <= shown ) ? 0 : 1;

				}

				line.geometry.setHide( hide );

			} );

		}

		function unmount ( trail ) {

			[ 'solid', 'dashed' ].forEach( which => {

				const line = trail[ which ];

				if ( line === null || line === undefined ) return;

				if ( line.parent !== null ) line.parent.remove( line );

				line.geometry.dispose();
				line.material.dispose();

				trail[ which ] = null;

			} );

		}

		// ---- the model coming and going ------------------------------------------

		function onNewSurvey ( event ) {

			survey = event.survey;

			group = new Group();
			group.name = 'CV.SurveyTrails';

			survey.addStatic( group );

			// the trails name stations rather than positions, so the set is routed again
			// across the model now loaded: the same names may be a different way round a
			// corrected survey, or absent from it altogether

			trails.forEach( trail => {

				unmount( trail );
				build( trail );
				draw( trail );

			} );

		}

		function onClear () {

			trails.forEach( trail => {

				unmount( trail );
				trail.points = trail.refs.map( ref => ( { ref: copyRef( ref ), resolved: false, atLength: null } ) );
				trail.segments = [];
				trail.gaps = [];
				trail.lengthM = 0;

			} );

			survey = null;
			group = null;

		}

		function dispose () {

			trails.forEach( unmount );
			trails.clear();

			viewer.removeEventListener( 'newSurvey', onNewSurvey );
			viewer.removeEventListener( 'clear', onClear );
			viewer.removeEventListener( 'dispose', dispose );

			survey = null;
			group = null;

		}

	}

}

export { SurveyTrails };
