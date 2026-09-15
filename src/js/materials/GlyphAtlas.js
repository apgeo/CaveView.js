import { CanvasTexture, LinearFilter } from '../Three';

// an atlas is a square of a fixed size, divided into a cell for each glyph it holds. The
// cell is the size of the text rounded up to the next power of two, so the larger the text
// the fewer cells there are.

const ATLAS_SIZE = 1024;

const GLYPHS = '\u202f\u00B0\u2610 ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%,.-_/()[]\'"';

function cellSizeForFont ( fontSize ) {

	return Math.pow( 2, Math.round( Math.log2( fontSize ) + 1 ) );

}

function cellsOfSize ( cellSize ) {

	const divisions = ATLAS_SIZE / cellSize;

	return divisions * divisions;

}

// the largest text an atlas can hold its glyphs at. Past it the atlas has fewer cells than
// there are glyphs and is built holding nothing at all - no texture, and no glyph - so it
// is the ceiling of any size the viewer is asked to draw text at. It is worked out from the
// atlas rather than stated, so that a change to the size of the atlas, or to the set of
// glyphs it holds, carries the ceiling with it.

const maxGlyphAtlasFontSize = ( function () {

	let cellSize = 1;

	// the largest cell of which the atlas still holds one for every glyph

	while ( cellSize < ATLAS_SIZE && cellsOfSize( cellSize * 2 ) >= GLYPHS.length ) cellSize *= 2;

	// and the largest text held in a cell of that size: text is held in a cell of 2^n while
	// it is smaller than 2^(n - 0.5), which is that cell divided by the root of two

	return Math.floor( cellSize / Math.SQRT2 );

} )();

class GlyphAtlas {

	constructor ( glyphAtlasSpec ) {

		const atlasSize = ATLAS_SIZE;
		const fontSize = glyphAtlasSpec.size || 18;
		const cellSize = cellSizeForFont( fontSize );
		const baseOffset = ( cellSize - fontSize ) / 2;

		const divisions = atlasSize / cellSize;
		const canvas = document.createElement( 'canvas' );
		const glyphs = GLYPHS;
		const map = {};

		let glyphCount = glyphs.length;

		this.cellScale = cellSize / atlasSize;
		this.cellSize = cellSize;

		// the cell a glyph is held in is rounded up to a power of two and so stands in no
		// fixed relation to the size of the text drawn in it - an 18 pixel font and a 24
		// pixel one are both held in a 32 pixel cell. Text is spaced by the size of the
		// text, so that size is kept.

		this.fontSize = fontSize;

		if ( glyphCount > divisions * divisions ) {

			console.error( 'too many glyphs for atlas' );
			return;

		}

		if ( ! canvas ) console.error( 'creating canvas for glyph atlas failed' );

		canvas.width = atlasSize;
		canvas.height = atlasSize;

		const ctx = canvas.getContext( '2d' );

		if ( ! ctx ) console.error( 'cannot obtain 2D canvas' );

		// set background
		ctx.fillStyle = glyphAtlasSpec.background || 'rgba( 0, 0, 0, 0 )';
		ctx.fillRect( 0, 0, atlasSize, atlasSize );

		// set up text settings
		ctx.textAlign = 'left';
		ctx.font = fontSize + 'px ' + glyphAtlasSpec.font;
		ctx.fillStyle = glyphAtlasSpec.color || '#ffffff';

		// where a line of text sits within the cell it is held in, as a fraction of the cell
		// measured from the bottom of it. The cell is rounded up to a power of two and the
		// text is drawn from a baseline placed to centre the font in it, so a box drawn
		// around the cell is not a box drawn around the text. A browser that does not report
		// the box of the font leaves the proportions of an ordinary sans-serif face.

		const metrics = ctx.measureText( glyphs );

		const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.9;
		const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.2;

		this.textTop = ( baseOffset + ascent ) / cellSize;
		this.textBottom = ( baseOffset - descent ) / cellSize;

		for ( let i = 0; i < glyphCount; i++ ) {

			addGlyphToCanvas( glyphs.charAt( i ), i );

		}

		const texture = new CanvasTexture( canvas );

		texture.minFilter = LinearFilter;
		this.generateMipmaps = false;

		function addGlyphToCanvas ( glyph, i ) {

			const glyphWidth = ctx.measureText( glyph ).width / cellSize;

			const row = Math.floor( i / divisions ) + 1;
			const column = i % divisions;

			const glyphData = {
				row: ( divisions - row ) / divisions,
				column: column / divisions,
				width: glyphWidth
			};

			map[ glyph ] = glyphData;

			ctx.fillText( glyph, cellSize * column, cellSize * row - baseOffset );

			return glyphData;

		}

		this.getTexture = function () {

			return texture;

		};

		// an atlas built for a size an application asked for is held by the material that
		// draws from it alone, and is freed with it: the texture it holds is a megapixel of
		// the graphics card, and the canvas it was drawn from as much again.

		this.dispose = function () {

			texture.dispose();

		};

		this.getGlyph = function ( glyph ) {

			let glyphData = map[ glyph ];

			if ( glyphData === undefined ) {

				if ( glyphCount + 1 > divisions * divisions ) {

					console.warn( `too many glyphs for atlas when adding [${glyph}]` );
					return;

				}

				glyphData = addGlyphToCanvas( glyph, glyphCount++ );

				texture.needsUpdate = true;

			}

			return glyphData;

		};

	}

}

function GlyphAtlasCache () {

	const atlasCache = [];

	this.getAtlas = function ( glyphAtlasSpec ) {

		const key = JSON.stringify( glyphAtlasSpec );

		let atlas = atlasCache[ key ];

		if ( atlas === undefined ) {

			atlas = new GlyphAtlas( glyphAtlasSpec );
			atlasCache[ key ] = atlas;

		}

		return atlas;

	};

}

export { GlyphAtlas, GlyphAtlasCache, maxGlyphAtlasFontSize };