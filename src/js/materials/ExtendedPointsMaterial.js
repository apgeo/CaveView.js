import { Color, PointsMaterial } from '../Three';

class ExtendedPointsMaterial extends PointsMaterial {

	constructor ( ctx ) {

		super();

		const textureCache = ctx.materials.textureCache;

		this.map = textureCache.getTexture( 'disc' );
		this.color = new Color( 0xffffff );
		this.opacity = 1.0;
		this.alphaTest = 0.8;

		this.sizeAttenuation = false;
		this.transparent = true; // to ensure points rendered over lines.
		this.vertexColors = true;

		// a station's dot is sized in the pixels of the screen, which a capture drawing the
		// view at a greater density than the screen's scales, so that the dot keeps the part
		// of the view it has on the screen

		const pointScale = ctx.materials.uniforms.points.pointScale;

		this.onBeforeCompile = function ( shader ) {

			const vertexShader = shader.vertexShader
				.replace( '#include <common>', '\nattribute float pSize;\nuniform float pointScale;\n\n$&' )
				.replace( '\tgl_PointSize = size;', '\tgl_PointSize = pSize * pointScale;' );

			shader.vertexShader = vertexShader;
			shader.uniforms.pointScale = pointScale;

		};

		return this;

	}

}

export { ExtendedPointsMaterial };