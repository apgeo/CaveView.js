class Control {

	constructor ( container, width, height, onEnter ) {

		this.hitRegion = this.createHitRegion( width, height, onEnter );
		this.container = container;

		// the region as it is at the full size of the dials, and the part of that size the
		// dials are being drawn at - see setScale()

		this.fullWidth = width;
		this.fullHeight = height;
		this.fullRight = 0;
		this.fullBottom = 0;
		this.scale = 1;

	}

	createHitRegion ( width, height, onEnter ) {

		const div = document.createElement( 'div' );

		div.style.width = width + 'px';
		div.style.height = height + 'px';
		div.style.position = 'absolute';

		// named, for a stylesheet of the application and for whoever inspects the page
		div.classList.add( 'cv-hud-control' );

		div.setAttribute( 'draggable', 'false' );
		div.addEventListener( 'dragstart', e => e.preventDefault() );

		div.addEventListener( 'pointerenter', onEnter );

		return div;

	}

	positionHitRegion ( right, bottom ) {

		const hr = this.hitRegion;

		this.fullRight = right;
		this.fullBottom = bottom;

		hr.style.right = right * this.scale + 'px';
		hr.style.bottom = bottom * this.scale + 'px';

		this.container.appendChild( hr );

	}

	// the dials are drawn smaller where the viewer is displayed small, about the corner
	// they stand in, and the region each is driven through is kept over what is drawn

	setScale ( scale ) {

		const hr = this.hitRegion;

		this.scale = scale;

		hr.style.width = this.fullWidth * scale + 'px';
		hr.style.height = this.fullHeight * scale + 'px';
		hr.style.right = this.fullRight * scale + 'px';
		hr.style.bottom = this.fullBottom * scale + 'px';

	}

	commonEnter ( target, handlers ) {

		for ( const event in handlers ) {

			target.addEventListener( event, handlers[ event ] );

		}

		this.rect = this.hitRegion.getBoundingClientRect();
		this.hitRegion.style.cursor = 'pointer';

	}

	commonLeave ( target, handlers ) {

		for ( const event in handlers ) {

			target.removeEventListener( event, handlers[ event ] );

		}

		this.hitRegion.style.cursor = 'default';

	}

	dispose () {

		const hr = this.hitRegion;
		hr.parentNode.removeChild( hr );

	}

}

export { Control };