// A mark over one station of the model that cannot be missed - a crosshair, with the station's
// name beside it - for a host that sends a reader to a place: from a list of places, a link in a
// page's text, a search. The viewer's own highlight is a point in the model's colours, which is
// lost among the stations around it once the camera is any distance away.
//
// The mark is HTML laid over the container and placed from the camera of each frame drawn, so it
// rides with the station while the camera flies there and while the reader turns the model, and it
// leaves the screen with the station rather than staying pinned to the edge it left by. It takes
// no pointer events: the station under it can still be picked.

const SVG_NS = 'http://www.w3.org/2000/svg';

// the crosshair is drawn about the origin of a 72 px square: a ring with four ticks
const SIZE = 72;

function svgElement ( name, attributes ) {

	const element = document.createElementNS( SVG_NS, name );

	for ( const key in attributes ) element.setAttribute( key, attributes[ key ] );

	return element;

}

function setStyle ( element, properties ) {

	for ( const name in properties ) element.style.setProperty( name, properties[ name ] );

}

// Each shape is drawn twice, a dark halo under a bright line, so the mark reads over the black
// background, over bright walls and over the white of a print. The colours come from CSS custom
// properties, so a host restyles the mark without a stylesheet of its own being required.

function buildCrosshair () {

	const half = SIZE / 2;
	const svg = svgElement( 'svg', { width: SIZE, height: SIZE, viewBox: `${-half} ${-half} ${SIZE} ${SIZE}`, 'aria-hidden': 'true', focusable: 'false' } );

	setStyle( svg, { 'position': 'absolute', 'left': -half + 'px', 'top': -half + 'px', 'overflow': 'visible' } );

	svg.classList.add( 'cv-station-mark-cross' );

	const shapes = [
		[ 'circle', { cx: 0, cy: 0, r: 15 } ],
		[ 'line', { x1: 0, y1: -34, x2: 0, y2: -19 } ],
		[ 'line', { x1: 0, y1: 19, x2: 0, y2: 34 } ],
		[ 'line', { x1: -34, y1: 0, x2: -19, y2: 0 } ],
		[ 'line', { x1: 19, y1: 0, x2: 34, y2: 0 } ]
	];

	const strokes = [
		{ 'stroke': 'var( --cv-station-mark-halo, rgba( 0, 0, 0, 0.75 ) )', 'stroke-width': '5' },
		{ 'stroke': 'var( --cv-station-mark-color, #ff3b6b )', 'stroke-width': '2.5' }
	];

	for ( const stroke of strokes ) {

		const group = svgElement( 'g', {} );

		setStyle( group, { 'fill': 'none', 'stroke-linecap': 'round', ...stroke } );

		for ( const [ name, attributes ] of shapes ) group.appendChild( svgElement( name, attributes ) );

		svg.appendChild( group );

	}

	return svg;

}

function labelStyle () {

	return {
		'position': 'absolute',
		'left': '22px',
		'top': '18px',
		'white-space': 'nowrap',
		'padding': '1px 6px',
		'font': 'var( --cv-station-mark-font, 12px/1.5 sans-serif )',
		'color': 'var( --cv-station-mark-label-color, #ffffff )',
		'background': 'var( --cv-station-mark-label-background, rgba( 0, 0, 0, 0.72 ) )',
		'border-left': '3px solid var( --cv-station-mark-color, #ff3b6b )',
		'border-radius': '2px'
	};

}

class StationMark {

	// getPosition: the screen position of a station, or of a point offset from it, as
	// getStationScreenPosition() answers it - null when it has none
	// reducedMotion: whether the reader prefers reduced motion, asked as each mark is drawn

	constructor ( ctx, getPosition, reducedMotion ) {

		const viewer = ctx.viewer;
		const container = ctx.container;

		const node = document.createElement( 'div' );

		node.classList.add( 'cv-station-mark' );

		setStyle( node, {
			'position': 'absolute',
			'left': '0',
			'top': '0',
			'width': '0',
			'height': '0',
			'display': 'none',
			'pointer-events': 'none',
			// above the model and the markers, below the viewer's own panels
			'z-index': 'var( --cv-station-mark-z-index, 9 )'
		} );

		const cross = buildCrosshair();
		const label = document.createElement( 'div' );

		label.classList.add( 'cv-station-mark-label' );
		setStyle( label, labelStyle() );

		node.appendChild( cross );
		node.appendChild( label );

		container.appendChild( node );

		// what is marked: null, or { ref, offset, label }
		let marked = null;

		viewer.addEventListener( 'clear', clear );
		viewer.addEventListener( 'dispose', dispose );

		this.mark = mark;
		this.clear = clear;
		this.reposition = reposition;
		this.get = () => marked === null ? null : { ...marked };

		return;

		function mark ( ref, offset, text ) {

			marked = { ref: ref, offset: offset, label: text };

			label.textContent = text;
			label.style.setProperty( 'display', text ? 'block' : 'none' );

			reposition();

			// the crosshair closes in on the station as it is marked, which draws the eye
			// to it; a reader who prefers reduced motion is shown it in place

			if ( ! reducedMotion() && typeof cross.animate === 'function' ) {

				cross.animate( [
					{ transform: 'scale( 2.6 )', opacity: 0 },
					{ transform: 'scale( 1 )', opacity: 1 }
				], { duration: 700, easing: 'ease-out' } );

			}

		}

		// placed from the camera of the frame just drawn, as the viewer's other overlays
		// are, so the mark moves with the model rather than a frame behind it

		function reposition () {

			if ( marked === null ) return;

			const at = getPosition( marked.ref, marked.offset );

			if ( at === null ) {

				node.style.setProperty( 'display', 'none' );

			} else {

				node.style.setProperty( 'transform', `translate( ${at.x}px, ${at.y}px )` );
				node.style.setProperty( 'display', 'block' );

			}

		}

		function clear () {

			marked = null;
			node.style.setProperty( 'display', 'none' );

		}

		function dispose () {

			clear();

			viewer.removeEventListener( 'clear', clear );
			viewer.removeEventListener( 'dispose', dispose );

			node.remove();

		}

	}

}

export { StationMark };
