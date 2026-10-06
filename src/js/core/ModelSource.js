// A file of a source is named by a File, or by an object: { name } for a file fetched by
// name, { file } for a File. The object may also carry a label, which gives the file a
// survey of its own in the survey tree - see describeFile() below - and, with a label, a
// color: the colour that survey is drawn in where the model is coloured by survey.

function describeFile ( file ) {

	if ( typeof file === 'string' ) return { name: file };

	if ( file instanceof File ) return file;

	const label = file.label;

	if ( label !== undefined && label !== null ) {

		// the label is the name of a survey, and the path of a station is its surveys'
		// names joined by full stops: one in a name would be read as two names

		if ( typeof label !== 'string' || label === '' || label.includes( '.' ) ) {

			throw new Error( 'the label of a file names a survey: a text of at least one character with no full stop in it' );

		}

	}

	// a File that is given a label keeps its own name, which is what the format of a file
	// is read from

	if ( file.file instanceof File && file.name === undefined ) return Object.assign( {}, file, { name: file.file.name } );

	return file;

}

class ModelSource {

	static lastId = 0;

	name = null;
	files = [];
	local = true;

	constructor ( files, local ) {

		this.files = files.map( describeFile );
		this.local = local;
		this.id = ModelSource.lastId++;

	}

	addFile ( file ) {

		this.files.push( describeFile( file ) );

	}

	getNames () {

		return this.files.map( v => v.name );

	}

	static makeModelSourceFiles( files ) {

		const source = new ModelSource( [], false );

		files.forEach( file => source.addFile( file ) );

		return source;

	}

}

export { ModelSource };