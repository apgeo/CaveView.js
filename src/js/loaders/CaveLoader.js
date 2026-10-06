import { EventDispatcher } from '../Three';
import { Svx3dLoader} from './svx3dLoader';
import { loxLoader } from './loxLoader';
import { pltLoader } from './pltLoader';
import { WorkerLoader } from './WorkerLoader';
import { SurveyDataCollector } from './SurveyDataCollector';

const setProgressEvent = { type: 'progress', name: 'set', progress: 0 };

class CaveLoader extends EventDispatcher {

	constructor ( ctx ) {

		super();

		this.ctx = ctx;

		this.reset();

		this.loadingContext = {
			'prefix': ctx.cfg.value( 'surveyDirectory', '' ),
			'loadMetadata': ctx.cfg.value( 'loadMetadata', false )
		};

	}

	reset () {

		this.handlers?.forEach( handler => handler.abort() );
		this.handlers = [];
		this.loading = [];
		this.progress = new Map();

	}

	getHandler ( file ) {

		const extention = file.name.split( '.' ).reverse().shift().toLowerCase();

		switch ( extention ) {

		case '3d':

			return new Svx3dLoader( file );

		case 'lox':

			return new loxLoader( file );

		case 'plt':

			return new pltLoader( file );

		case 'ply':

			return new WorkerLoader( file, this.ctx.cfg.value( 'home', '' ) + 'js/workers/plyLoaderWorker.js' );

		default:

			console.warn( `CaveView: unknown file extension [${extention}]` );
			return false;

		}

	}

	loadSource ( source, section = null ) {

		const surveyDataCollector = new SurveyDataCollector( this.ctx );

		this.loadingContext.section = section;

		this.dispatchEvent( { type: 'progress', name: 'start' } );

		source.files.forEach( file => this.loadFile( file, surveyDataCollector ) );

		// wait for all loaders to complete or fail
		return Promise.all( this.loading )
			.then( loaded => {

				// The legs a file hands back are added here, in the order the files were
				// given rather than the order they happened to be read in - which for files
				// fetched together, or each waiting on a coordinate system to be looked up,
				// is a different order from one load to the next. Legs are drawn in the
				// order they are held, so where two files lie over one another the later
				// file is the one seen, every time.

				const lineSegments = surveyDataCollector.lineSegments;

				loaded.forEach( segments => {

					if ( ! Array.isArray( segments ) ) return;

					for ( let i = 0, l = segments.length; i < l; i++ ) lineSegments.push( segments[ i ] );

				} );

				return surveyDataCollector.getSurvey();

			} )
			.finally( () => {

				this.dispatchEvent( { type: 'progress', name: 'end' } );
				this.reset();

			} );

	}

	loadFile ( file, surveyDataCollector )  {

		const handler = this.getHandler( file );

		if ( ! handler ) return false;

		const _progress = ( event ) => {

			if ( event.total > 0 ) {

				this.progress.set( handler, event );
				this.progressTotal();

			}

		};

		this.handlers.push( handler );
		this.loading.push( handler.load( this.loadingContext, _progress, surveyDataCollector ) );

	}

	progressTotal () {

		let total = 0, loaded = 0;

		// total all active loading events

		this.progress.forEach( event => {

			total += event.total;
			loaded += event.loaded;

		} );

		setProgressEvent.progress = Math.round( 75 * loaded / total );

		this.dispatchEvent( setProgressEvent );

	}

}

export { CaveLoader };