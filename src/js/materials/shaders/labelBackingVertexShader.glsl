// backing drawn behind a block of label text.

// the corners of the backing are held in cells of the glyph atlas the text is drawn from,
// which is the unit the text is placed and spaced in, and are scaled and rotated by the
// values the text is scaled and rotated by: the backing then covers the same part of the
// screen as the text whatever the text is drawn at.

uniform mat2 rotate;
uniform vec2 scale;
uniform vec2 viewPort;

void main() {

	vec2 newPosition = rotate * position.xy;

	// position of the label on screen

	vec4 offset = projectionMatrix * modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );

	newPosition *= scale;

	// move to clip space

	newPosition *= offset.w;

	gl_Position = vec4( newPosition, 0.0, 0.0 ) + offset;

	// snap to screen pixels, as the text is

	vec2 snap = viewPort / gl_Position.w;

	gl_Position.xy = ( trunc( gl_Position.xy * snap ) + 0.5 ) / snap;

}
