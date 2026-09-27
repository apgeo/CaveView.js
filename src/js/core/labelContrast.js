import { Color } from 'three';

// How a label's plate and its text are coloured when the theme leaves it to the viewer.
//
// The plate exists so a label can be read where it lies over the survey. Given a fixed
// colour it can only do that against one background: a black plate over a black background
// has no edge at all, so the label reads as text floating in space, and the same plate over
// a pale surface photograph disappears the other way. So the default is derived from the
// background the viewer is actually drawing on, and the text is then derived from the plate
// rather than from the theme - a plate chosen for contrast with the background is no use if
// the writing on it has been chosen for contrast with something else.
//
// Grey rather than a tinted colour, deliberately: an application colours its own markers,
// and a plate carrying a hue of its own would compete with whatever it was given.

const LIGHT_PLATE = 0.86;
const DARK_PLATE = 0.11;

// Rec. 709 luminance, which is what "is this dark?" means to an eye rather than to a mean of
// three channels: the same amount of green reads far lighter than the same amount of blue.

function luminance ( color ) {

	return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

}

// The plate for a label drawn over this background: grey, and on the far side of the middle
// from the background, so there is an edge to see wherever the background happens to sit.

function plateAgainst ( background ) {

	const level = luminance( background ) < 0.5 ? LIGHT_PLATE : DARK_PLATE;

	return new Color( level, level, level );

}

// The writing on that plate. Black or white rather than a shade between: the plate is
// translucent, so what is behind it shows through and moves the effective background under
// the text - and of the two, only the extremes stay legible when that happens.

function inkOn ( plate ) {

	return luminance( plate ) < 0.5 ? new Color( 1, 1, 1 ) : new Color( 0, 0, 0 );

}

export { plateAgainst, inkOn, luminance };
