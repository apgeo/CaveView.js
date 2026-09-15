import { BufferGeometry, Float32BufferAttribute, Mesh } from '../Three';
import { CommonAttributes } from './CommonAttributes';

class LabelBackingGeometry extends BufferGeometry {

	constructor () {

		super();

		this.type = 'LabelBackingGeometry';

		this.setIndex( CommonAttributes.index );
		this.setAttribute( 'position', new Float32BufferAttribute( new Float32Array( 12 ), 3 ) );

	}

	// the corners of the backing, in cells of the glyph atlas the text is drawn from - the
	// unit the shader places and scales it in. They are given in the order the shared index
	// of a unit square names them.

	setBox ( box ) {

		const position = this.getAttribute( 'position' );

		const min = box.min;
		const max = box.max;

		position.setXY( 0, min.x, min.y );
		position.setXY( 1, min.x, max.y );
		position.setXY( 2, max.x, max.y );
		position.setXY( 3, max.x, min.y );

		position.needsUpdate = true;

		this.computeBoundingSphere();

	}

	dispose () {

		// the index is shared with everything else drawn from a unit square, and is dropped
		// here so that freeing this geometry does not take the index from them

		this.setIndex( null );

		super.dispose();

	}

}

// a translucent panel drawn behind a block of label text, so that the text can be read over
// whatever the model draws beneath it.

class LabelBacking extends Mesh {

	constructor ( material ) {

		super( new LabelBackingGeometry(), material );

		this.type = 'CV.LabelBacking';

	}

	setBox ( box ) {

		this.geometry.setBox( box );

		return this;

	}

	// the backing adds nothing to what can be pointed at. The text it is drawn behind is
	// picked over the area it covers, and a pointer that is over the backing but not over
	// the text reaches whatever is drawn behind them both.

	raycast () {}

}

export { LabelBacking };
