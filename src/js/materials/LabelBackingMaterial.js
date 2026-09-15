import { Color, ShaderMaterial } from '../Three';
import { Shaders } from './shaders/Shaders';

class LabelBackingMaterial extends ShaderMaterial {

	constructor ( glyphMaterial, color, opacity ) {

		const uniforms = glyphMaterial.uniforms;

		super( {
			vertexShader: Shaders.labelBackingVertexShader,
			fragmentShader: Shaders.labelBackingFragmentShader,
			type: 'CV.LabelBackingMaterial',
			uniforms: {

				// the backing is placed, scaled and rotated exactly as the text it is drawn
				// behind, so it is given the uniforms of the material that text is drawn
				// with rather than copies of their values: those are maintained as the
				// viewer is resized, and copies would be left behind by it.

				rotate: uniforms.rotate,
				scale: uniforms.scale,
				viewPort: uniforms.viewPort,

				backingColor: { value: new Color( color ) },
				backingOpacity: { value: opacity }
			}
		} );

		this.type = 'CV.LabelBackingMaterial';

		this.transparent = true;

		// the text drawn over the backing is drawn without regard to the depth of the model,
		// and the backing is drawn as the text is. It writes no depth of its own: what is
		// drawn over the model must not stand in front of the rest of it.

		this.depthTest = false;
		this.depthWrite = false;

	}

}

export { LabelBackingMaterial };
