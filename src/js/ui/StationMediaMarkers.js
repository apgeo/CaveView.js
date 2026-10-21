import { Vector2 } from '../Three';

// markers over the model at the stations that hold pictures, so that where the photographs of
// a cave were taken can be seen without hovering every station in turn. A marker is pressed to
// show that station's pictures, which the station media overlay then displays as it does for a
// hover.

const __v = new Vector2();

// a camera, drawn in the marker's own colour

const CAMERA_ICON = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">'
	+ '<path fill="currentColor" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>'
	+ '</svg>';

// appearance from CSS custom properties, as the strip's is, so a host can restyle the markers
// without a stylesheet of its own being required

function markerStyle () {

	return {
		'position': 'absolute',
		'display': 'none',
		'box-sizing': 'border-box',
		'width': 'var( --cv-media-marker-size, 22px )',
		'height': 'var( --cv-media-marker-size, 22px )',
		'padding': '3px',
		'margin': '0',
		'border': 'var( --cv-media-marker-border, 1px solid #ffffff )',
		'border-radius': '50%',
		'background': 'var( --cv-media-marker-background, rgba( 34, 34, 34, 0.85 ) )',
		'color': 'var( --cv-media-marker-color, #ffffff )',
		'cursor': 'pointer',
		'touch-action': 'manipulation',
		// above the model, below the strip and the viewer's own panels
		'z-index': 'var( --cv-media-marker-z-index, 8 )',
		// stands just above its station, so the station itself stays visible and pickable
		'transform': 'translate( -50%, calc( -100% - 4px ) )',
		'pointer-events': 'auto'
	};

}

function countStyle () {

	return {
		'position': 'absolute',
		'top': '-6px',
		'right': '-8px',
		'min-width': '14px',
		'height': '14px',
		'padding': '0 3px',
		'box-sizing': 'border-box',
		'border-radius': '7px',
		'background': 'var( --cv-media-marker-count-background, #d4380d )',
		'color': '#ffffff',
		'font': '10px/14px sans-serif',
		'text-align': 'center'
	};

}

function setStyle ( element, properties ) {

	for ( const name in properties ) element.style.setProperty( name, properties[ name ] );

}

class StationMediaMarkers {

	// getStations: answers [ { station, count } ] - the stations to mark, already resolved
	// getAnchor: the screen position of a station, false when it has none
	// onPress: told the station whose marker was pressed

	constructor ( ctx, getStations, getAnchor, onPress ) {

		const viewer = ctx.viewer;
		const container = ctx.container;

		const layer = document.createElement( 'div' );

		layer.classList.add( 'cv-media-markers' );

		// the layer covers nothing: only the markers in it take the pointer

		setStyle( layer, { 'position': 'absolute', 'left': '0', 'top': '0', 'width': '0', 'height': '0', 'pointer-events': 'none' } );

		container.appendChild( layer );

		let marked = [];

		layer.addEventListener( 'click', onClick );

		viewer.addEventListener( 'clear', clear );
		viewer.addEventListener( 'dispose', dispose );

		this.refresh = refresh;
		this.reposition = reposition;
		this.dispose = dispose;

		refresh();

		return;

		// builds the markers again for whatever the stations are now: called when the pictures
		// change and when a model is loaded

		function refresh () {

			layer.replaceChildren();

			marked = getStations().map( ( { station, count } ) => {

				const marker = document.createElement( 'button' );

				marker.type = 'button';
				marker.classList.add( 'cv-media-marker' );
				marker.innerHTML = CAMERA_ICON;
				marker.title = station.name();
				marker.setAttribute( 'aria-label', station.name() );
				marker.dataset.station = station.name();

				setStyle( marker, markerStyle() );

				if ( count > 1 ) {

					const badge = document.createElement( 'span' );

					setStyle( badge, countStyle() );
					badge.textContent = String( count );

					marker.appendChild( badge );

				}

				layer.appendChild( marker );

				return { station, marker };

			} );

			reposition();

		}

		// placed from the camera of the frame just rendered, as the strip is, so that a marker
		// moves with the model rather than a frame behind it; a station with no position on the
		// screen takes its marker off it

		function reposition () {

			for ( const { station, marker } of marked ) {

				if ( getAnchor( station, __v ) ) {

					marker.style.setProperty( 'left', __v.x + 'px' );
					marker.style.setProperty( 'top', __v.y + 'px' );
					marker.style.setProperty( 'display', 'block' );

				} else {

					marker.style.setProperty( 'display', 'none' );

				}

			}

		}

		function onClick ( event ) {

			const marker = event.target.closest( '.cv-media-marker' );

			if ( marker === null ) return;

			const entry = marked.find( m => m.marker === marker );

			if ( entry !== undefined ) onPress( entry.station );

		}

		function clear () {

			marked = [];
			layer.replaceChildren();

		}

		function dispose () {

			clear();

			layer.removeEventListener( 'click', onClick );

			viewer.removeEventListener( 'clear', clear );
			viewer.removeEventListener( 'dispose', dispose );

			layer.remove();

		}

	}

}

export { StationMediaMarkers };
