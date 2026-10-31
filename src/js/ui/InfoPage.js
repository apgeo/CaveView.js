import { VERSION, LEG_CAVE, LEG_SPLAY, LEG_DUPLICATE, LEG_SURFACE } from '../core/constants';
import { Page } from './Page';

class InfoPage extends Page {

	constructor ( frame, viewer, fileSelector ) {

		super( 'icon_info', 'info' );

		frame.addPage( this );

		this.addHeader( 'header' );

		this.addHeader( 'stats.header' );

		// a model loaded through the viewer rather than through this interface's file
		// selector leaves it with no loaded source, and so with no file name to show

		const loadedSource = fileSelector.loadedSource;
		const names = ( loadedSource === null ) ? [] : loadedSource.getNames();

		if ( names.length === 1 ) {

			this.addText( this.i18n( 'file' ) + ': ' + names[ 0 ] );

		} else if ( names.length > 1 ) {

			this.addText( this.i18n( 'files' ) + ':' );
			names.forEach( name => this.addLine( name ) );

		}

		const stats = viewer.getLegStats( LEG_CAVE );

		this.addBlankLine();

		this.addLine( this.i18n( 'stats.legs' ) + ': ' + stats.legCount );
		this.addLine( this.i18n( 'stats.totalLength' ) + ': ' + stats.legLength.toFixed( 2 ) + '\u202fm' );
		this.addLine( this.i18n( 'stats.minLength' ) + ': ' + stats.minLegLength.toFixed( 2 ) + '\u202fm' );
		this.addLine( this.i18n( 'stats.maxLength' ) + ': ' + stats.maxLegLength.toFixed( 2 ) + '\u202fm' );

		if ( viewer.hasSplays || viewer.hasDuplicateLegs || viewer.hasSurfaceLegs ) {

			this.addBlankLine();
			this.addLine( this.i18n( 'stats.otherLegs' ) );
			this.addBlankLine();

		}

		if ( viewer.hasSplays ) {

			const splayStats = viewer.getLegStats( LEG_SPLAY );
			this.addLine( this.i18n( 'stats.splayCount' ) + ': ' + splayStats.legCount );

		}

		if ( viewer.hasDuplicateLegs ) {

			const duplicateStats = viewer.getLegStats( LEG_DUPLICATE );
			this.addLine( this.i18n( 'stats.duplicateCount' ) + ': ' + duplicateStats.legCount );

		}

		if ( viewer.hasSurfaceLegs ) {

			const surfaceStats = viewer.getLegStats( LEG_SURFACE );
			this.addLine( this.i18n( 'stats.surfaceCount' ) + ': ' + surfaceStats.legCount );

		}

		this.addHeader( 'CaveView v' + VERSION + '.' );

		this.addLogo();
		this.addText( this.i18n( 'summary' ) );

		this.addText( this.i18n( 'more' ) + ': ' );
		this.addLink( 'https://aardgoose.github.io/CaveView.js/', this.i18n( 'github' ) );
		this.addText( '© Angus Sawyer, 2024' );

	}

}

export { InfoPage };