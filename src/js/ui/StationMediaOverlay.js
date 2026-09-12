import { Vector2 } from '../Three';
import { coarsePointer } from './PointerGestures';

// screen position of the station the strip is anchored to, in container pixels

const __v = new Vector2();

// gap in pixels between the station and the nearest edge of the strip

const ANCHOR_OFFSET = 12;

// a thumbnail is both what the strip displays and what is tapped or clicked to open the
// image, so how big it has to be depends on what is pointing at it rather than on how big
// the screen is: a phone held sideways is wider than a small laptop and is still driven
// with a finger. Each set below is only what the custom properties fall back to, so a size
// set by the application is still the one used, whichever pointer is in use.

const fineSizes = {
	thumbnail: '64px',
	gap: '4px',
	padding: '4px',
	caption: '11px'
};

const coarseSizes = {
	thumbnail: '88px',
	gap: '8px',
	padding: '8px',
	caption: '13px'
};

// appearance is taken from CSS custom properties, which a host may set on the viewer
// container or on any of its ancestors. The second argument of each var() is the value
// used where the property is not set, so the strip is usable without any stylesheet.

function stripStyle ( sizes ) {

	return {
		'position': 'absolute',
		'display': 'none',
		'box-sizing': 'border-box',
		'gap': `var( --cv-media-gap, ${sizes.gap} )`,
		'padding': `var( --cv-media-padding, ${sizes.padding} )`,
		'background': 'var( --cv-media-background, rgba( 34, 34, 34, 0.85 ) )',
		'border': 'var( --cv-media-border, 1px solid #808080 )',
		'border-radius': 'var( --cv-media-radius, 2px )',
		'font-family': 'var( --cv-media-font, sans-serif )',
		// the side panel of the user interface is above the strip
		'z-index': 'var( --cv-media-z-index, 9 )',
		// the strip covers part of the model: everything but the thumbnails must let
		// pointer events through, or rotating the model near a station stops working
		'pointer-events': 'none'
	};

}

function itemStyle ( sizes ) {

	return {
		'display': 'flex',
		'flex-direction': 'column',
		'align-items': 'center',
		'width': `var( --cv-media-thumbnail-size, ${sizes.thumbnail} )`
	};

}

function thumbnailStyle ( sizes ) {

	return {
		'display': 'block',
		'width': `var( --cv-media-thumbnail-size, ${sizes.thumbnail} )`,
		'height': `var( --cv-media-thumbnail-size, ${sizes.thumbnail} )`,
		'object-fit': 'cover',
		'border-radius': 'var( --cv-media-radius, 2px )',
		'cursor': 'pointer',
		// a tap opens the image as it is made, rather than after the wait for a second tap
		// that would have zoomed the page
		'touch-action': 'manipulation',
		'pointer-events': 'auto'
	};

}

function captionStyle ( sizes ) {

	return {
		'max-width': `var( --cv-media-thumbnail-size, ${sizes.thumbnail} )`,
		'overflow': 'hidden',
		'text-overflow': 'ellipsis',
		'white-space': 'nowrap',
		'text-align': 'center',
		'color': 'var( --cv-media-caption-color, #dddddd )',
		'font-size': `var( --cv-media-caption-size, ${sizes.caption} )`
	};

}

function setStyle ( element, properties ) {

	for ( const name in properties ) element.style.setProperty( name, properties[ name ] );

}

function clamp ( value, max ) {

	return Math.max( 0, Math.min( value, max ) );

}

class StationMediaOverlay {

	constructor ( ctx, getAnchor ) {

		const viewer = ctx.viewer;
		const container = ctx.container;

		// the pointer the strip is sized for, which a device may gain or lose while it is
		// displaying one

		const pointerQuery = coarsePointer();

		let sizes = pointerQuery.matches ? coarseSizes : fineSizes;

		const strip = document.createElement( 'div' );

		strip.classList.add( 'cv-media-strip' );

		setStyle( strip, stripStyle( sizes ) );

		container.appendChild( strip );

		let source = null;
		let station = null;
		let entries = null;

		// the strip is placed again for every frame rendered while it is displayed, so
		// nothing done there may read a size back: a read taken after the writes that
		// place the strip forces the layout those writes invalidated, once for every
		// frame the strip is on the screen for. The sizes are measured where they change
		// instead - the strip as it is built, the container as it is resized.

		let stripWidth = 0;
		let stripHeight = 0;

		let containerWidth = container.clientWidth;
		let containerHeight = container.clientHeight;

		// the strip lies between the station and wherever the pointer is moved next, so
		// the hover ends as the thumbnails are being reached for. The strip is kept until
		// the pointer leaves it again.

		let pointerOver = false;
		let hoverEnded = false;

		strip.addEventListener( 'click', onClick );
		strip.addEventListener( 'pointerover', onPointerOver );
		strip.addEventListener( 'pointerout', onPointerOut );

		pointerQuery.addEventListener( 'change', onPointerChange );

		viewer.addEventListener( 'clear', hide );
		viewer.addEventListener( 'resized', onResize );
		viewer.addEventListener( 'dispose', dispose );

		this.hide = hide;
		this.dispose = dispose;

		this.setSource = function ( newSource ) {

			if ( newSource !== null && newSource !== undefined &&
				typeof newSource !== 'function' && typeof newSource.get !== 'function' ) {

				console.warn( 'station media source must be a Map or a function' );
				newSource = null;

			}

			source = newSource ?? null;

			hide();

		};

		this.show = function ( pStation ) {

			const media = lookup( pStation );

			if ( media === null ) {

				hide();
				return;

			}

			station = pStation;
			entries = media;

			build();
			place();

		};

		this.hoverEnd = function () {

			if ( pointerOver ) {

				hoverEnded = true;
				return;

			}

			hide();

		};

		this.reposition = function () {

			if ( station !== null ) place();

		};

		return;

		function lookup ( pStation ) {

			if ( source === null ) return null;

			const media = ( typeof source === 'function' ) ? source( pStation ) : source.get( pStation.name() );

			if ( ! Array.isArray( media ) ) return null;

			// an entry without a URL has nothing to display and nothing to open

			const usable = media.filter( entry => typeof entry?.url === 'string' );

			return ( usable.length === 0 ) ? null : usable;

		}

		function build () {

			strip.replaceChildren();

			entries.forEach( ( entry, index ) => {

				const item = document.createElement( 'div' );
				const thumbnail = document.createElement( 'img' );

				setStyle( item, itemStyle( sizes ) );
				setStyle( thumbnail, thumbnailStyle( sizes ) );

				// only URLs are held - the browser fetches the images as it would any
				// other image of the page

				thumbnail.src = entry.thumbnailUrl ?? entry.url;
				thumbnail.alt = entry.caption ?? '';
				thumbnail.title = entry.caption ?? '';

				// identifies the entry to the single click handler of the strip

				thumbnail.mediaIndex = index;

				item.appendChild( thumbnail );

				if ( entry.caption !== undefined ) {

					const caption = document.createElement( 'div' );

					setStyle( caption, captionStyle( sizes ) );

					caption.textContent = entry.caption;

					item.appendChild( caption );

				}

				strip.appendChild( item );

			} );

			// the size of the strip is fixed by its CSS properties rather than by the
			// images, so it can be measured here, before they have loaded, and is not
			// measured again while this strip is displayed

			strip.style.setProperty( 'visibility', 'hidden' );
			strip.style.setProperty( 'display', 'flex' );

			stripWidth = strip.offsetWidth;
			stripHeight = strip.offsetHeight;

		}

		function place () {

			if ( ! getAnchor( station, __v ) ) {

				strip.style.setProperty( 'display', 'none' );
				return;

			}

			let top = __v.y - stripHeight - ANCHOR_OFFSET;

			// below the station where there is no room above it

			if ( top < 0 ) top = __v.y + ANCHOR_OFFSET;

			strip.style.setProperty( 'left', clamp( __v.x - stripWidth / 2, containerWidth - stripWidth ) + 'px' );
			strip.style.setProperty( 'top', clamp( top, containerHeight - stripHeight ) + 'px' );

			strip.style.setProperty( 'display', 'flex' );
			strip.style.setProperty( 'visibility', 'visible' );

		}

		function onResize ( event ) {

			containerWidth = event.width;
			containerHeight = event.height;

		}

		// a pointer attached to or detached from the device changes what the thumbnails
		// have to be big enough for

		function onPointerChange ( event ) {

			sizes = event.matches ? coarseSizes : fineSizes;

			setStyle( strip, stripStyle( sizes ) );

			if ( station === null ) return;

			// the strip holds thumbnails of the size that has just been replaced, and is
			// measured as it is built, so it is built again rather than laid out again

			build();
			place();

		}

		function hide () {

			strip.style.setProperty( 'display', 'none' );
			strip.replaceChildren();

			station = null;
			entries = null;

			pointerOver = false;
			hoverEnded = false;

		}

		function onPointerOver () {

			pointerOver = true;

		}

		function onPointerOut ( event ) {

			// moving between thumbnails leaves and enters the strip without the pointer
			// ever having left it

			if ( strip.contains( event.relatedTarget ) ) return;

			pointerOver = false;

			if ( hoverEnded ) hide();

		}

		function onClick ( event ) {

			const index = event.target.mediaIndex;

			if ( index === undefined || station === null ) return;

			const mediaEvent = {
				type: 'mediaOpen',
				station: station,
				entry: entries[ index ],
				handled: false
			};

			const url = entries[ index ].url;
			const node = station.station;

			viewer.dispatchEvent( mediaEvent );

			if ( mediaEvent.handled || ! viewer.surveyLoaded ) return;

			// an open popup - a station popup left open by a focus call - stops another
			// being displayed. Setting the popup to a node that is not a station closes
			// the open one without displaying a new one.

			viewer.popup = viewer.getSurveyTree();
			viewer.showImagePopup( { node: node }, url );

		}

		function dispose () {

			hide();

			strip.removeEventListener( 'click', onClick );
			strip.removeEventListener( 'pointerover', onPointerOver );
			strip.removeEventListener( 'pointerout', onPointerOut );

			pointerQuery.removeEventListener( 'change', onPointerChange );

			viewer.removeEventListener( 'clear', hide );
			viewer.removeEventListener( 'resized', onResize );
			viewer.removeEventListener( 'dispose', dispose );

			strip.remove();

			source = null;

		}

	}

}

export { StationMediaOverlay };
