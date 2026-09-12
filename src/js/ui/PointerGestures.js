// Which gestures are available is a property of the pointer being used, not of the device
// or of the size of its screen: a tablet with a mouse attached reports both kinds, and a
// phone held sideways is wider than a small laptop while still being driven with a finger.
// Everything below therefore asks about a pointer.

// a pointer that hovers reveals what is under it by being moved there. One that does not -
// a finger, and a pen used as one - has to be told where to look, so it reveals the same
// thing by tapping.

function pointerHovers ( pointerType ) {

	return ( pointerType === 'mouse' );

}

// the kind of pointer in use where there is no event to take it from - sizing a control
// before anything has been pointed at. The query is returned rather than its result, so
// that a caller can also follow a change: the answer is not fixed for the life of a page,
// as a pointer may be attached to or detached from a device that is already displaying one.

function coarsePointer () {

	return window.matchMedia( '( pointer: coarse )' );

}

// the largest movement, in CSS pixels, that still counts as a tap rather than as the drag
// that turns the model: a finger moves a little as it is lifted

const TAP_MOVEMENT = 12;

// the longest a tap lasts, in milliseconds. A contact held for longer is a press, which is
// the gesture the model is turned with whether or not it happened to stay still

const TAP_DURATION = 750;

// One tap of a pointer that does not hover, told from the drag and pinch gestures that the
// same pointer makes over the same element. The caller reports each pointer event of the
// element to it, and acts on the gesture where end() says it was a tap.

class TapGesture {

	constructor () {

		this.pointerId = null;
		this.x = 0;
		this.y = 0;
		this.time = 0;
		this.moved = 0;

	}

	start ( event ) {

		// a second pointer put down makes a gesture of two - the one the model is zoomed
		// and panned with - which is not a tap, and does not become one as the fingers are
		// lifted from it one at a time

		if ( this.pointerId !== null ) {

			this.pointerId = null;
			return;

		}

		if ( pointerHovers( event.pointerType ) ) return;

		this.pointerId = event.pointerId;
		this.x = event.clientX;
		this.y = event.clientY;
		this.time = event.timeStamp;
		this.moved = 0;

	}

	// how far the pointer has been taken from where it went down. It is the furthest it
	// reached that tells a tap from a drag and not where it happened to be lifted: the
	// model is commonly turned by a gesture that goes round and comes back, which ends
	// where it began without ever having been still.

	move ( event ) {

		if ( this.pointerId === null || event.pointerId !== this.pointerId ) return;

		this.moved = Math.max(
			this.moved,
			Math.abs( event.clientX - this.x ),
			Math.abs( event.clientY - this.y )
		);

	}

	cancel () {

		this.pointerId = null;

	}

	// true where the gesture ended by this event was a tap. The gesture is ended either
	// way, so that the pointer going down again starts a new one.

	end ( event ) {

		if ( this.pointerId === null || event.pointerId !== this.pointerId ) return false;

		// where the pointer was lifted counts as much as anywhere it was reported on the
		// way, and a gesture may end without a move having been reported at all

		this.move( event );

		this.pointerId = null;

		return ( this.moved <= TAP_MOVEMENT && event.timeStamp - this.time <= TAP_DURATION );

	}

}

export { TapGesture, pointerHovers, coarsePointer };
