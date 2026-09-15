import { ShaderMaterial, Vector2, Vector3 } from '../Three';
import { Shaders } from './shaders/Shaders';

class GlyphMaterial extends ShaderMaterial {

	constructor ( ctx, glyphAtlas, rotation, viewer ) {

		const uniforms = ctx.materials.uniforms;
		const cellScale = glyphAtlas.cellScale;
		const container = viewer.container;
		const realPixels = glyphAtlas.cellSize * 2;
		const pixelRatio = window.devicePixelRatio || 1;

		const cos = Math.cos( -rotation );
		const sin = Math.sin( -rotation );

		const cosR = Math.cos( rotation );
		const sinR = Math.sin( rotation );

		const viewPort = new Vector2( Math.floor( pixelRatio * container.clientWidth ) / 2, Math.floor( pixelRatio * container.clientHeight ) / 2 );

		// the size of a cell of the atlas, as a fraction of the view: the height a glyph is
		// drawn at, and the unit a string is placed and spaced in. It is set here as a resize
		// sets it, so that a material built after the viewer was last resized draws text at
		// the size a material built before it draws it at - which is the size the rest of the
		// viewer takes a cell to be, scaleFactor pixels of the page.

		const scale = new Vector2();

		setScale( scale );

		const rotationMatrix = new Float32Array( [ cos, -sin, sin, cos ] );

		super( {
			vertexShader: Shaders.glyphVertexShader,
			fragmentShader: Shaders.glyphFragmentShader,
			type: 'CV.GlyphMaterial',
			uniforms: Object.assign( {
				cellScale: { value: cellScale },
				atlas: { value: glyphAtlas.getTexture() },
				rotate: { value: rotationMatrix },
				scale: { value: scale },
				viewPort: { value: viewPort }
			}, uniforms.common ),
		} );

		this.rotation = rotation;
		this.alphaTest = 0.9;
		this.depthTest = false;
		this.transparent = true;

		this.type = 'CV.GlyphMaterial';
		this.atlas = glyphAtlas;
		this.scaleFactor = glyphAtlas.cellSize / pixelRatio;
		this.toScreenSpace = new Vector3( container.clientWidth/ 2, container.clientHeight / 2, 1 );

		// the viewer keeps the scale up to date, and so holds the material for as long as it
		// is listened to: both are kept here so that a material freed while the viewer lives
		// can stop being held by it

		this.viewer = viewer;
		this.onResize = _resize;

		viewer.addEventListener( 'resized', _resize );

		const self = this;

		function setScale ( value ) {

			value.set( realPixels / Math.floor( pixelRatio * container.clientWidth ), realPixels/ Math.floor( pixelRatio * container.clientHeight ) );

		}

		function _resize () {

			setScale( self.uniforms.scale.value );
			self.toScreenSpace.set( container.clientWidth/ 2, container.clientHeight / 2, 1 );
			this.scaleFactor = glyphAtlas.cellSize / pixelRatio;

		}

		this.rotateVector = function ( v ) {

			const x = v.x;
			const y = v.y;

			v.x = cosR * x - sinR * y;
			v.y = sinR * x + cosR * y;

		};

	}

	dispose () {

		this.viewer.removeEventListener( 'resized', this.onResize );

		super.dispose();

	}

	getCellSize () {

		return this.atlas.cellSize;

	}

	getAtlas () {

		return this.atlas;

	}

}

export { GlyphMaterial };