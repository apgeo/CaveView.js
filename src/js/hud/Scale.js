import { GlyphString } from '../core/GlyphString';
import { Mesh, Group } from '../Three';


function Scale( hudObject, container, geometry, material ) {

	const materials = hudObject.ctx.materials;
	const width  = container.clientWidth;
	const height = container.clientHeight;

	const stdWidth  = hudObject.stdWidth;
	const stdMargin = hudObject.stdMargin;

	const barOffset = 3 * ( stdWidth + stdMargin );

	const barHeight = ( height - barOffset ) / 2;
	const barWidth  = stdWidth / 2;

	this.ctx = hudObject.ctx;
	this.barHeight = barHeight;
	this.barWidth = barWidth;
	this.barOffset = barOffset;

	this.offsetX = -barWidth / 2 - 5;
	this.offsetY = barHeight / 2;

	Group.call( this );

	// position on left side of container
	this.translateX(  width / 2  - barWidth / 2  - stdMargin );
	this.translateY( -height / 2 + barHeight / 2 + barOffset );

	this.scaleBar = new Mesh( geometry, material );
	this.scaleBar.name = 'scale bar';

	this.textMaterial = materials.getGlyphMaterial( hudObject.atlasSpec, 0 );

	this.add( this.scaleBar );

	this.min = null;
	this.max = null;
	this.caption = null;

}

Scale.prototype = Object.create( Group.prototype );

Scale.prototype.setRange = function ( min, max, caption ) {

	const offsetX = this.offsetX;
	const offsetY = this.offsetY;

	const material = this.textMaterial;

	if ( min !== this.min || max !== this.max ) {

		var i;

		for ( i = this.children.length; i--; ) {

			let obj = this.children[ i ];

			if ( obj.isRange ) this.remove( obj );

		}

		const topLabel = new GlyphString( Math.round( max ) + '\u202fm', material, this.ctx );
		const bottomLabel = new GlyphString( Math.round( min ) + '\u202fm', material, this.ctx );

		topLabel.translateX( offsetX - topLabel.getWidth() );
		bottomLabel.translateX( offsetX - bottomLabel.getWidth() );

		topLabel.translateY( offsetY - topLabel.getHeight() );
		bottomLabel.translateY( -offsetY );

		topLabel.isRange = true;
		bottomLabel.isRange = true;

		this.addStatic( topLabel );
		this.addStatic( bottomLabel );

		this.min = min;
		this.max = max;

	}

	this.setCaption( caption );

	return this;

};

Scale.prototype.setCaption = function ( text ) {

	var caption = this.caption;

	if ( caption !== null ) {

		// already have correct caption
		if ( caption.name === text ) return this;

		this.remove( caption );

	}

	caption = new GlyphString( text, this.textMaterial, this.ctx );
	caption.translateX( this.barWidth / 2 - caption.getWidth() );
	caption.translateY( this.offsetY + this.barWidth / 2 );

	this.addStatic( caption );
	this.caption = caption;

	return this;

};

Scale.prototype.dispose = function () {

	this.traverse( function _dispose ( obj ) {

		const geometry = obj.geometry;

		if ( geometry !== undefined ) geometry.dispose();

	} );

};

export { Scale };

// EOF