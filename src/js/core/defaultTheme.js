const defaultTheme = {
	fieldOfView: 50,
	background: 'black',
	sky: 0x106f8d,
	maxPolarAngle: 180,
	saturatedGradient: false,
	lighting: {
		azimuth: 315,
		inclination: 45
	},
	entrance_dot_size: 5,
	hud: {
		font: 'normal Arial, sans-serif',
		text: 'white',
		progress: 'green',
		progressBackground: 'dimgray',
		bezel: 'gray',
		widgetSize: 40,
		scale: {
			bar1: 'white',
			bar2: 'red',
		},
		compass: {
			top1: 0xb03a14,
			top2: 0x1ab4e5,
			bottom1: 0x581d0a,
			bottom2: 0x0c536a
		},
		ahi: {
			sky: 0x106f8d,
			earth: 0x802100,
			bar: 'yellow',
			marks: 'white'
		},
		cursor: 'yellow',
		cursorText: {
			text: 'yellow',
			background: '#444444',
			font: 'bold helvetica,sans-serif'
		}
	},
	box: {
		bounding: 'white',
		select: 'blue',
		highlight: 'red'
	},
	routes: {
		active: 'yellow',
		adjacent: 'red',
		default: 'gray'
	},
	stations: {
		font: 'normal Arial, sans-serif',
		default: {
			text: 'white',
			font: 'normal Arial, sans-serif',
			marker: 'red'
		},
		entrances: {
			text: 'white',
			background: 'darkred',
			font: 'normal helvetica,sans-serif',
			marker: 'white',
			angle: 45,
		},
		junctions: {
			text: 'yellow',
			font: 'normal Arial, sans-serif',
			marker: 'yellow'
		},
		linked: {
			text: 'cyan',
			font: 'normal Arial, sans-serif',
			marker: 'cyan'
		}
	},
	shading: {
		single: 'red',
		surface: 'yellow',
		duplicate: 'white',
		cursor: 'yellow',
		cursorBase: 'gray',
		unselected: 'gray',
		contours: {
			line: 0xe1bba2,
			line10: 0xf29d62,
			interval: 10,
			base: 'white'
		},
		/*
		hypsometric: {
			min: 0,
			max: 400
		},
		*/
		unconnected: 'gray'
	},
	popup: {
		text: 'white',
		border: 'white',
		background: 0x111111
	},
	liveMarkers: {
		// 'auto' derives the plate from the background the viewer is drawing on, and the
		// writing from the plate, so a label has an edge to see whatever the background is.
		// Either may be given a colour instead, and then it is used exactly as written.
		labelBackground: 'auto',
		labelText: 'auto',
		labelBackgroundOpacity: 0.6,
		// The first line of a label is drawn in the colour of the marker it belongs to, where the
		// marker has one, so what that line names is told apart from the lines under it and from
		// the other markers on the model. Off draws every line alike.
		labelHeadingFromMarker: true
	},
	grid: {
		base: 'gray'
	}
};

export { defaultTheme };