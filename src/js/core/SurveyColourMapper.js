function SurveyColourMapper ( ctx ) {

	let map = [];
	let selectedSection = 0;

	this.getColour = function ( section ) {

		const colourCache = ctx.materials.colourCache;

		// a colour given to a section - to the survey of a file with a label - is the
		// colour of everything in that section, at whatever depth the tree is coloured

		for ( let node = section; node !== null && node !== undefined; node = node.parent ) {

			if ( node.colour !== undefined ) return colourCache.getColour( node.colour );

		}

		const surveyColours = colourCache.getColorSet( 'survey' );

		return surveyColours[ section.id % surveyColours.length ];

	};

	this.getColourMap = function ( newSelectedSection ) {

		if ( selectedSection === newSelectedSection && map.length > 0 ) {

			// use cached mapping
			return map;

		}

		map = [];
		selectedSection = newSelectedSection;

		// create mapping of survey id to colour
		// map each child id _and_ all its lower level survey ids to the same colour

		let subTree = selectedSection;
		let colour = this.getColour( selectedSection );

		_addMapping( subTree );

		let children = subTree.children;

		while ( children.length === 1 ) {

			subTree = children[ 0 ];
			_addMapping( subTree );
			children = subTree.children;

		}

		for ( let i = 0, l = children.length; i < l; i++ ) {

			const node = children[ i ];

			colour = this.getColour( node );

			node.traverse( _addMapping );

		}

		return map;

		function _addMapping ( node ) {

			// only add values for sections - not stations
			if ( ! node.isStation() ) map[ node.id ] = colour;

		}

	};

}

export { SurveyColourMapper };