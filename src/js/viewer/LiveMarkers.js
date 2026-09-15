import { Box2, Group, Raycaster, Vector2, Vector3 } from '../Three';
import { FEATURE_LIVE_MARKERS } from '../core/constants';
import { MutableGlyphString } from '../core/GlyphString';
import { LabelBacking } from '../core/LabelBacking';
import { maxGlyphAtlasFontSize } from '../materials/GlyphAtlas';
import { LabelBackingMaterial } from '../materials/LabelBackingMaterial';
import { PointIndicator, POINT_INDICATOR_SIZE } from './PointIndicator';

// duration of the move between two stations, in milliseconds

const MOVE_TIME = 600;

// the size the text of a label is drawn at where the application asks for none, in the
// pixels of the page. A marker is labelled with a block of lines - what it stands for, and
// a line for each of the several things that may be at one station - rather than with the
// single name a station is labelled with, so it is drawn smaller than the labels of the
// model are: 12 pixels of the page against the 18 pixels of the screen the theme gives for
// a station, which on a screen of one device pixel to the pixel of the page is the same
// number and on a dense screen is not.
//
// The font sizes of the theme are given in the pixels of the screen, and a size given that
// way is drawn smaller on the page the denser the screen is: on a telephone of 2.6 device
// pixels to the pixel of the page, 12 would be a block of four names about a millimetre of
// cap height, which is not a size anything can be read at and so is not a default. The
// default is therefore stated in the pixels of the page and converted to the screen's, so
// that a marker label is the same size on the page whatever it is displayed on, and an
// application that wants it drawn as the labels of the model are says so.

const LABEL_SIZE = 12;

// the default in the unit the property is given in - the pixels of the screen - held below
// the largest text the glyph atlas can draw, which the conversion would pass on a screen of
// four device pixels to the pixel of the page.

function defaultLabelSize () {

	return Math.min( LABEL_SIZE * ( window.devicePixelRatio || 1 ), maxGlyphAtlasFontSize );

}

// the space, in CSS pixels, left between the text of a label and the edge of the backing
// drawn behind it

const LABEL_PADDING = 3;

// where a label is drawn in the order the model is drawn in. A label is read over the line
// work of the survey and over the markers of its stations, which are drawn over one another
// in an order settled by how far each of them is from the camera, so the label is drawn
// after all of them - and the backing a step before the text it stands behind, since which
// of two objects standing at one point is drawn first is not otherwise settled. Anything an
// application displays over the model, a popup among them, is drawn later still.

const BACKING_RENDER_ORDER = 2;
const LABEL_RENDER_ORDER = 3;

// the distance between the lines of a label, as a multiple of the size of the text. The
// lines of one label are read as one block, so they are spaced by the text they are made
// of rather than by a distance on the screen that the text would not keep step with.

const LINE_SPACING = 1.25;

// the gap, in CSS pixels, between the dot and the label set beside it

const LABEL_GAP = 4;

// how far from its dot, in CSS pixels, a marker is still picked. A pointer that hovers is
// aimed with what can be seen of what it is aimed at, so it is given the dot as it is
// drawn and nothing beyond it. A finger covers the thing it is aiming at and cannot be put
// down as exactly, so it is given the 44 pixel target that is the smallest one a finger
// reaches reliably.

const PICK_RADIUS_FINE = POINT_INDICATOR_SIZE / 2;
const PICK_RADIUS_COARSE = 22;

// the largest movement, in CSS pixels, that still counts as a tap rather than as the drag
// that turns the model: a finger moves a little as it is lifted

const TAP_MOVEMENT = 12;

// the longest a tap lasts, in milliseconds. A contact held for longer is a press, which is
// the gesture the model is turned with whether or not it happened to stay still.

const TAP_DURATION = 750;

// a pointer that hovers reveals what is under it by being moved there. One that does not -
// a finger, and a pen used as one - has to be told where to look, so it reveals the same
// thing by tapping.

function pointerHovers ( pointerType ) {

	return ( pointerType === 'mouse' );

}

const __v = new Vector3();
const __marker = new Vector3();
const __pointer = new Vector3();

// The dot of a marker is picked where it is drawn on the screen rather than where the ray
// of the pointer passes near it in the model. A Points object is otherwise picked by a
// threshold that is a distance in the model, while the dot is drawn at a fixed size in
// pixels whatever the view - so one distance is a target too small to hit at one zoom and
// swallows everything near the marker at another. The label of a marker is already tested
// in screen space, so both halves of a marker are now aimed at in the same space and in
// the same units, and the size of the target is not a threshold that anything else picked
// in the scene shares.

class LiveMarkerPoint extends PointIndicator {

	constructor ( ctx, color ) {

		super( ctx, color );

		this.container = ctx.container;

	}

	raycast ( raycaster, intersects ) {

		if ( ! this.visible ) return intersects;

		// the size of the target is a property of the pointer being used rather than of the
		// marker, so it is carried on the raycaster as the thresholds of the standard object
		// types are. A raycast that does not name one is not a raycast for the markers.

		const params = raycaster.params.LiveMarkers;

		if ( params === undefined ) return intersects;

		const camera = raycaster.camera;
		const container = this.container;

		this.getWorldPosition( __marker );

		const distance = raycaster.ray.origin.distanceTo( __marker );

		// a marker behind the camera is projected onto the screen as one in front of it,
		// and is not on the screen at all

		__pointer.copy( __marker ).applyMatrix4( camera.matrixWorldInverse );

		if ( __pointer.z >= 0 ) return intersects;

		__marker.project( camera );

		// where the pointer is, taken from the ray rather than from the event that set it,
		// so that a perspective and an orthographic view are handled alike

		raycaster.ray.at( 1, __pointer ).project( camera );

		const dx = ( __marker.x - __pointer.x ) * container.clientWidth / 2;
		const dy = ( __marker.y - __pointer.y ) * container.clientHeight / 2;

		if ( dx * dx + dy * dy > params.radius * params.radius ) return intersects;

		intersects.push( { object: this, distance: distance } );

		return intersects;

	}

}

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

		// the markers are picked by a pass of their own, over their own objects, so the
		// size of the target a marker offers is not imposed on anything else in the scene

		const raycaster = new Raycaster();

		raycaster.layers.enableAll();
		raycaster.params.LiveMarkers = { radius: PICK_RADIUS_FINE };

		let survey = null;
		let group = null;
		let labelMaterial = null;
		let backingMaterial = null;

		// what a collapsed marker says, decided by the application. The number of markers
		// collapsed is all the viewer knows to say of them.

		let clusterLabel = null;

		// whether the markers are labelled. Turning the labels off leaves the markers
		// displayed and pointed at exactly as they were - it is a crowded screen that is
		// being cleared, not the markers that are being taken off it.

		let labelsShown = true;

		// how the labels are drawn: the size of their text, and whether a backing is drawn
		// behind each block of it. An application that wants its labels drawn at the size
		// the labels of the model are drawn at asks for a size of null.

		let labelSize = defaultLabelSize();
		let labelBacking = true;

		let hovered = null;
		let tracking = false;

		// the gesture a pointer that does not hover is making, while it is making it

		let tapPointer = null;
		let tapX = 0;
		let tapY = 0;
		let tapTime = 0;
		let tapMoved = 0;

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
				ref: copyValue( ref ),
				label: labelValue( options.label ?? id ),
				sublabel: ( options.sublabel === undefined ) ? undefined : labelValue( options.sublabel ),
				color: options.color,
				payload: options.payload,
				node: null,
				object: null,
				cluster: null,
				point: null,
				labelBlock: emptyBlock(),
				hoverBlock: null,
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

			marker.ref = copyValue( ref );

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

		this.setLabels = function ( show ) {

			show = !! show;

			if ( show === labelsShown ) return;

			labelsShown = show;

			rebuildLabels();

		};

		this.getLabels = function () {

			return labelsShown;

		};

		// the size of the text of a label, in the unit the font sizes of the theme are given
		// in. A size of null is the size the labels of the model are drawn at, which is what
		// an application that wants its markers labelled as the model is asks for.
		//
		// A size the text cannot be drawn at is refused and the labels are left as they are.
		// It is taken as the number it is rather than as the number it can be read as, so
		// that a value which is not a size - a boolean, a string, nothing at all - is
		// refused rather than drawn as whatever it converts to. The largest is the largest
		// the glyph atlas can hold its glyphs at: past that the atlas is built holding
		// nothing, and the labels would be asked to draw from an atlas with no text in it.

		this.setLabelSize = function ( size ) {

			if ( size !== null ) {

				if ( typeof size !== 'number' || ! ( size > 0 ) ) {

					console.warn( 'a live marker label size must be a positive number, or null' );
					return;

				}

				if ( size > maxGlyphAtlasFontSize ) {

					console.warn( `a live marker label size of ${size} is larger than the largest text available (${maxGlyphAtlasFontSize})` );
					return;

				}

			}

			if ( size === labelSize ) return;

			labelSize = size;

			rebuildLabels();

		};

		this.getLabelSize = function () {

			return labelSize;

		};

		this.setLabelBacking = function ( show ) {

			show = !! show;

			if ( show === labelBacking ) return;

			labelBacking = show;

			rebuildLabels();

		};

		this.getLabelBacking = function () {

			return labelBacking;

		};

		return;

		// a reference may be given as an array of the components of a station path, and a
		// label as an array of its lines. Either is copied on the way in and on the way out
		// again, so that a description of a marker really is a copy of it: neither the
		// application nor the marker can change what the other is working from.

		function copyValue ( value ) {

			return Array.isArray( value ) ? value.slice() : value;

		}

		// a label is a string, or an array of the strings its lines are. It is held in the
		// form it was given in, so that a marker is described as it was asked for.

		function labelValue ( value ) {

			return Array.isArray( value ) ? value.map( String ) : String( value );

		}

		function toLines ( value ) {

			return Array.isArray( value ) ? value : [ value ];

		}

		function describe ( marker ) {

			return {
				id: marker.id,
				ref: copyValue( marker.ref ),
				label: copyValue( marker.label ),
				sublabel: copyValue( marker.sublabel ),
				color: marker.color,
				payload: marker.payload,
				resolved: ( marker.node !== null )
			};

		}

		function assign ( marker, options ) {

			if ( options.label !== undefined ) marker.label = labelValue( options.label );
			if ( options.sublabel !== undefined ) marker.sublabel = labelValue( options.sublabel );
			if ( options.color !== undefined ) marker.color = options.color;
			if ( options.payload !== undefined ) marker.payload = options.payload;

		}

		function resolve ( marker ) {

			const node = ( survey === null ) ? null : survey.surveyTree.getByRef( marker.ref );

			marker.node = ( node !== null && node.isStation() ) ? node : null;

		}

		// the objects one label is drawn with: one for each of its lines, drawn one below
		// the other with the first of them on the line of the dot. A label grows downwards
		// as lines are added to it, so that the dot stays where it is and what a marker is
		// first called stays on the line the dot is on. The lines are all placed from the
		// same point, so they are ranged left, which is also how a list of names reads.
		//
		// The whole block is set to the right of the dot, clear of it. A dot is drawn at a
		// size fixed in CSS pixels, the same on any screen, while a glyph is drawn at a
		// size fixed in the pixels of the screen and so is that many times smaller in CSS
		// pixels on a dense one: text placed by the width of a space is beside the dot on
		// one screen and inside it on another, and a block of lines spaced by the size of
		// the text is drawn wholly within the dot on a telephone. The clearance is
		// therefore stated in the units the dot is drawn in, and converted to the cells of
		// the glyph atlas the string is shifted in - a cell is scaleFactor CSS pixels.
		//
		// A backing is drawn behind the whole block rather than behind each line, so that a
		// block of text is read as a block, and covers the text with a little room around
		// it: the lines of a label are drawn over the line work of the survey, which a
		// stroke of text is easily lost in.
		//
		// The text of a marker is chosen by the application and changes as it reports the
		// marker, so a geometry of its own is built for each line rather than one taken
		// from the cache shared between labels of the same text: a cached geometry cannot
		// be freed before the model it was built for is unloaded.
		//
		// Nothing at all is built while the labels are turned off, so a marker that is not
		// labelled holds no geometry for text that is not drawn.

		function mountLabel ( object, lines ) {

			if ( ! labelsShown || lines.length === 0 ) return emptyBlock();

			const atlas = labelMaterial.getAtlas();
			const lineHeight = LINE_SPACING * atlas.fontSize;
			const indent = ( POINT_INDICATOR_SIZE / 2 + LABEL_GAP ) * atlas.cellSize / labelMaterial.scaleFactor;

			const strings = lines.map( ( text, line ) => {

				const glyph = new MutableGlyphString( ` ${text} `, labelMaterial, - line * lineHeight, indent );

				glyph.layers.set( FEATURE_LIVE_MARKERS );
				glyph.renderOrder = LABEL_RENDER_ORDER;

				object.addStatic( glyph );

				return glyph;

			} );

			return { strings: strings, backing: mountBacking( object, strings, atlas ) };

		}

		// the backing is sized to the text once the lines of it are built, which is when how
		// much room they take is known

		function mountBacking ( object, strings, atlas ) {

			if ( ! labelBacking ) return null;

			const backing = new LabelBacking( getBackingMaterial() );

			backing.setBox( textBox( strings, atlas ) );
			backing.layers.set( FEATURE_LIVE_MARKERS );
			backing.renderOrder = BACKING_RENDER_ORDER;

			object.addStatic( backing );

			return backing;

		}

		// a label that is drawn with nothing - the labels are turned off, or the marker has
		// nothing to say - is described as the labels that are

		function emptyBlock () {

			return { strings: [], backing: null };

		}

		// the room the lines of a label take, in the cells of the glyph atlas that the text
		// is placed and spaced in: from the text of the first line down to the text of the
		// last, across the widest of them, with a little space left around it. The lines are
		// all placed from the same point, so they share a left edge.

		function textBox ( strings, atlas ) {

			const padding = LABEL_PADDING / labelMaterial.scaleFactor;

			const first = strings[ 0 ].geometry;
			const last = strings[ strings.length - 1 ].geometry;

			let width = 0;

			strings.forEach( glyph => { width = Math.max( width, glyph.geometry.width ); } );

			return new Box2(
				new Vector2( first.xOffset - padding, last.yOffset + atlas.textBottom - padding ),
				new Vector2( first.xOffset + width + padding, first.yOffset + atlas.textTop + padding )
			);

		}

		// the colour of the backing is the theme's, as the colours of the viewer are, and one
		// material serves every label drawn: it is built when a label first needs it, and is
		// freed when the model the labels were drawn on is cleared.

		function getBackingMaterial () {

			if ( backingMaterial === null ) {

				backingMaterial = new LabelBackingMaterial(
					labelMaterial,
					cfg.themeColor( 'liveMarkers.labelBackground' ),
					cfg.themeValue( 'liveMarkers.labelBackgroundOpacity' )
				);

			}

			return backingMaterial;

		}

		// the geometry of each line, and of the backing behind them, belongs to the marker it
		// was built for and is freed with it. The material of the backing is shared by every
		// label and is not.

		function unmountLabel ( block ) {

			block.strings.forEach( glyph => glyph.geometry.dispose() );

			if ( block.backing !== null ) block.backing.geometry.dispose();

		}

		function showLabel ( block, show ) {

			block.strings.forEach( glyph => { glyph.visible = show; } );

			if ( block.backing !== null ) block.backing.visible = show;

		}

		// how a label is drawn is built into the objects drawn for it, so what is drawn is
		// built again - without the labels, with them, or with them drawn differently. The
		// markers themselves are untouched: the set is what it was, and each marker is where
		// it was.

		function rebuildLabels () {

			markers.forEach( unmount );
			clusters.forEach( unmountCluster );
			clusters.length = 0;

			// the material the text is drawn with belongs to the size it is drawn at, and
			// the material of the backing to the material of the text

			disposeBackingMaterial();
			setLabelMaterial();

			draw();

			viewer.renderView();

		}

		// the material the text of the labels is drawn with. A material built for a size the
		// application asked for is this object's own, and is freed here as soon as nothing is
		// drawn from it - an application that steps or animates the size would otherwise
		// leave an atlas, a texture and a material behind at every step. A material of the
		// theme's own size is shared with the labels of the model and is left alone.
		//
		// There is none while there is nothing to draw with it: no model is displayed, or the
		// labels are turned off, which is a screen being cleared and not a size being chosen.

		function setLabelMaterial () {

			releaseLabelMaterial();

			if ( group === null || ! labelsShown ) return;

			labelMaterial = ctx.materials.getLabelMaterial( 'stations.default', labelSize );

		}

		function releaseLabelMaterial () {

			ctx.materials.releaseLabelMaterial( labelMaterial );

			labelMaterial = null;

		}

		function disposeBackingMaterial () {

			if ( backingMaterial !== null ) backingMaterial.dispose();

			backingMaterial = null;

		}

		function mount ( marker ) {

			if ( group === null || marker.node === null || marker.object !== null ) return;

			const object = new Group();

			object.name = 'CV.LiveMarker';
			object.position.copy( currentPosition( marker ) );

			const point = new LiveMarkerPoint( ctx, marker.color ?? cfg.themeColor( 'stations.default.marker' ) );

			point.layers.set( FEATURE_LIVE_MARKERS );
			point.liveMarker = marker;

			object.addStatic( point );

			const labelBlock = mountLabel( object, toLines( marker.label ) );

			labelBlock.strings.forEach( glyph => { glyph.liveMarker = marker; } );

			group.addStatic( object );

			marker.object = object;
			marker.point = point;
			marker.labelBlock = labelBlock;
			marker.hoverBlock = null;

		}

		// what is drawn of a marker is taken down without its move being given up: a marker
		// of a group travelling together is taken down as the group is collapsed into the
		// single marker that then travels in its place

		function unmount ( marker ) {

			if ( hovered === marker ) hovered = null;

			if ( marker.object === null ) return;

			// the label materials are shared between the markers, and are left alone; the dot
			// material and the geometries of the label belong to this marker alone

			marker.point.material.dispose();

			unmountLabel( marker.labelBlock );

			if ( marker.hoverBlock !== null ) unmountLabel( marker.hoverBlock );

			marker.object.removeFromParent();

			marker.object = null;
			marker.point = null;
			marker.labelBlock = emptyBlock();
			marker.hoverBlock = null;

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
				labelBlock: emptyBlock()
			};

			// asked for before anything is built, so that a label the application declines
			// to supply leaves nothing behind to be freed

			const lines = clusterLines( cluster );

			cluster.text = lines.join( '\n' );

			const object = new Group();

			object.name = 'CV.LiveMarkerCluster';

			// markers of one colour are collapsed into a marker of that colour. Markers of
			// several colours have no colour between them to keep, and are collapsed into
			// a marker of the colour one that was given none is drawn in.

			const first = members[ 0 ].color;
			const color = members.every( marker => marker.color === first ) ? first : undefined;

			const point = new LiveMarkerPoint( ctx, color ?? cfg.themeColor( 'stations.default.marker' ) );

			point.layers.set( FEATURE_LIVE_MARKERS );
			point.liveCluster = cluster;

			object.addStatic( point );

			const labelBlock = mountLabel( object, lines );

			labelBlock.strings.forEach( glyph => { glyph.liveCluster = cluster; } );

			group.addStatic( object );

			cluster.object = object;
			cluster.point = point;
			cluster.labelBlock = labelBlock;

			return cluster;

		}

		function unmountCluster ( cluster ) {

			if ( hovered === cluster ) hovered = null;

			cluster.point.material.dispose();

			unmountLabel( cluster.labelBlock );

			cluster.object.removeFromParent();

			cluster.object = null;
			cluster.point = null;
			cluster.labelBlock = emptyBlock();

		}

		// the lines a collapsed marker is labelled with. What it stands for is the
		// application's to say: it knows what its markers are, and may want a line for each
		// of them as well as a name for the set. How many there are is what the viewer
		// knows, and is what is displayed where the application says nothing.

		function clusterLines ( cluster ) {

			let lines = null;

			if ( clusterLabel !== null ) {

				try {

					const text = clusterLabel( cluster.markers.map( describe ) );

					if ( text !== null && text !== undefined ) lines = toLines( text ).map( String );

				} catch ( error ) {

					// an application that cannot say what a collapsed marker stands for
					// leaves the viewer saying how many markers it stands for. Whatever
					// went wrong is one label's worth of trouble, and taking the markers
					// off the model instead would lose the application the one thing it
					// asked the viewer to display.

					console.warn( 'CaveView: live marker cluster label: ', error );

					lines = null;

				}

			}

			return ( lines === null ) ? [ String( cluster.markers.length ) ] : lines;

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

				if ( cluster !== null && cluster.text !== clusterLines( cluster ).join( '\n' ) ) {

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

				targets.push( marker.point, ...marker.labelBlock.strings );

				if ( marker.hoverBlock !== null ) targets.push( ...marker.hoverBlock.strings );

			} );

			clusters.forEach( cluster => targets.push( cluster.point, ...cluster.labelBlock.strings ) );

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

				tapPointer = null;
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

		// what a marker says of itself while it is pointed at: its label, and its sublabel
		// below that. A label and a sublabel that are each a single line are drawn on one
		// line, which is what a marker with nothing more than a name and a note has always
		// displayed; either of them given as several lines is drawn as those lines.

		function hoverLines ( marker ) {

			const label = toLines( marker.label );
			const sublabel = toLines( marker.sublabel );

			return ( label.length === 1 && sublabel.length === 1 )
				? [ `${label[ 0 ]} - ${sublabel[ 0 ]}` ]
				: label.concat( sublabel );

		}

		function showHoverLabel ( target, show ) {

			// a marker with nothing more to say displays its label however it is pointed
			// at, and a collapsed marker has nothing more of the viewer's to say: what it
			// stands for is displayed by the application that knows what that is

			if ( target.isCluster === true || target.sublabel === undefined || target.object === null || ! labelsShown ) return;

			if ( show && target.hoverBlock === null ) {

				target.hoverBlock = mountLabel( target.object, hoverLines( target ) );

				target.hoverBlock.strings.forEach( glyph => { glyph.liveMarker = target; } );

				rebuildTargets();

			}

			if ( target.hoverBlock === null ) return;

			showLabel( target.hoverBlock, show );
			showLabel( target.labelBlock, ! show );

		}

		function hoverAt ( x, y, pointerType ) {

			// a pointer that is not a mouse is a finger, or a pen used as one: it is aimed
			// by covering what it is aimed at, and reaches a larger target more reliably

			raycaster.params.LiveMarkers.radius = pointerHovers( pointerType ) ? PICK_RADIUS_FINE : PICK_RADIUS_COARSE;

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
						pointerType: pointerType,
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

		// how far the pointer has been taken from where it went down. It is the furthest it
		// reached that tells a tap from a drag and not where it happened to be lifted: the
		// model is commonly turned by a gesture that goes round and comes back, which ends
		// where it began without ever having been still.

		function trackTap ( event ) {

			if ( tapPointer === null || event.pointerId !== tapPointer ) return;

			tapMoved = Math.max(
				tapMoved,
				Math.abs( event.clientX - tapX ),
				Math.abs( event.clientY - tapY )
			);

		}

		function onPointerMove ( event ) {

			// where the pointer goes while it is down is what tells a tap from the drag
			// that turns the model, and is followed wherever it goes: a gesture that
			// crosses something displayed over the model is still that gesture

			trackTap( event );

			if ( event.target !== domElement ) return;

			// a pointer that does not hover is turning the model while it is down, which
			// reveals nothing - a marker reached in passing was not the one being aimed
			// at. What a hover reveals, a tap of the same pointer reveals.

			if ( event.buttons !== 0 && ! pointerHovers( event.pointerType ) ) return;

			hoverAt( event.clientX, event.clientY, event.pointerType );

		}

		// a pointer that does not hover is never moved onto a marker to point at it, so
		// there is no hover of it to report and the target sized for it would be offered to
		// nothing. It aims by tapping, which is one gesture among the several made over the
		// same element - the drag that turns the model, and the two-pointer gesture it is
		// zoomed and panned with - and is told from them here so that the controls are left
		// to read them as they always have: nothing is consumed, and nothing is prevented.

		function onPointerDown ( event ) {

			// a second pointer put down makes a gesture of two, which is not a tap and does
			// not become one as the pointers are lifted from it one at a time

			if ( tapPointer !== null ) {

				tapPointer = null;
				return;

			}

			// a gesture begun over something displayed over the model is not a tap of a
			// marker, whatever it ends over

			if ( pointerHovers( event.pointerType ) || event.target !== domElement ) return;

			tapPointer = event.pointerId;
			tapX = event.clientX;
			tapY = event.clientY;
			tapTime = event.timeStamp;
			tapMoved = 0;

		}

		// what a mouse reveals by being moved onto a marker, a pointer that does not hover
		// reveals by tapping it, and a tap on anything else ends the hover as moving the
		// mouse off the marker does

		function onPointerUp ( event ) {

			if ( tapPointer === null || event.pointerId !== tapPointer ) return;

			// where the pointer was lifted counts as much as anywhere it was reported on
			// the way, and a gesture may end without a move having been reported at all

			trackTap( event );

			const tapped = ( tapMoved <= TAP_MOVEMENT && event.timeStamp - tapTime <= TAP_DURATION );

			tapPointer = null;

			if ( tapped ) hoverAt( event.clientX, event.clientY, event.pointerType );

		}

		// a gesture the browser takes over ends without a pointerup, and is not a tap

		function onPointerCancel () {

			tapPointer = null;

		}

		// the pointer leaving the model area ends the hover it was over: no further move is
		// reported there, so a hover left standing would keep a marker showing what it has
		// to say for as long as the pointer is away

		function onPointerLeave ( event ) {

			// a pointer that does not hover ceases to exist as it is lifted, which the
			// browser reports as that pointer leaving the element - immediately after the
			// event a tap is recognised by. What a tap reveals is therefore left revealed
			// until something else is tapped, exactly as what a hover reveals is left until
			// the pointer is moved off it.

			if ( ! pointerHovers( event.pointerType ) ) return;

			if ( hovered === null ) return;

			showHoverLabel( hovered, false );

			hovered = null;

			viewer.renderView();

		}

		function onNewSurvey ( event ) {

			survey = event.survey;

			group = new Group();
			group.name = 'CV.LiveMarkers';

			survey.addStatic( group );

			// the label materials of the model that has gone are not the ones to draw with

			disposeBackingMaterial();
			setLabelMaterial();

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

			disposeBackingMaterial();
			releaseLabelMaterial();

			survey = null;
			group = null;

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
