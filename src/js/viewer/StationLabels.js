import { Group, Vector3 } from '../Three';
import { CAMERA_OFFSET, LABEL_STATION, LABEL_STATION_COMMENT } from '../core/constants';
import { GlyphString } from '../core/GlyphString';
import { maxGlyphAtlasFontSize } from '../materials/GlyphAtlas';

const _tmpVector3 = new Vector3();

// the size the name of a station is drawn at where the theme gives none, in the pixels of
// the screen: what the glyph atlas draws at when it is asked for no size

const DEFAULT_FONT_SIZE = 18;

// the smallest text that is still text. A scale that would take the names below it is
// held here rather than refused: what an application asked for is the smallest names the
// viewer draws.

const MIN_FONT_SIZE = 4;

class StationLabels extends Group {

	constructor ( ctx, stations, commentCount ) {

		super();

		this.type = 'CV.StationLabels';
		this.stations = stations;
		this.commentCount = commentCount;
		this.ctx = ctx;

		// the names of the stations and the comments on them are drawn at the size the theme
		// gives for each kind of station, multiplied by a scale the application sets
		// (viewer.stationLabelScale). A material of a scaled size is built for these labels
		// alone and is freed by them; at a scale of 1 the materials are the theme's own,
		// shared with everything else that writes on the model.

		// (not `scale`, which is the scale of the object itself in the scene)

		this.labelScale = 1;
		this.ownedMaterials = [];

		this.setMaterials( ctx.viewer?.stationLabelScale ?? 1 );

	}

	// frees the materials built for a scaled size, and the atlas each was built with. Asked
	// when the scale changes and when the survey these labels belong to is taken down: a
	// material of the theme's own size is the viewer's and is never among them.

	releaseMaterials () {

		const ctx = this.ctx;

		this.ownedMaterials.forEach( material => {

			// the geometry of every label written with a material is cached under it

			ctx.glyphStringCache.delete( material );
			ctx.materials.releaseLabelMaterial( material );

		} );

		this.ownedMaterials = [];

	}

	setMaterials ( scale ) {

		const ctx = this.ctx;
		const materials = ctx.materials;

		this.releaseMaterials();
		this.labelScale = scale;

		const materialFor = type => {

			if ( scale === 1 ) return materials.getLabelMaterial( type );

			const themeSize = ctx.cfg.themeValue( `${type}.fontsize` ) ?? DEFAULT_FONT_SIZE;
			const size = Math.min( Math.max( Math.round( themeSize * scale ), MIN_FONT_SIZE ), maxGlyphAtlasFontSize );

			const material = materials.getLabelMaterial( type, size );

			this.ownedMaterials.push( material );

			return material;

		};

		this.defaultLabelMaterial = materialFor( 'stations.default' );
		this.splayLabelMaterial = this.defaultLabelMaterial;
		this.junctionLabelMaterial = materialFor( 'stations.junctions' );
		this.linkedLabelMaterial = materialFor( 'stations.linked' );

	}

	// the labels displayed are taken down, and are written again at the new size the next
	// time the view is drawn: which of them are displayed depends on where the camera is,
	// which is what update() is asked on every frame.

	setScale ( scale ) {

		if ( scale === this.labelScale ) return;

		const points = this.stations.vertices;

		for ( let i = 0; i < points.length; i++ ) {

			const station = points[ i ];

			if ( station.label ) {

				this.remove( station.label );
				station.label = null;

			}

		}

		this.setMaterials( scale );

	}

	update ( camera, target, inverseWorld ) {

		const cameraPosition = _tmpVector3.copy( camera.position );

		if ( camera.isOrthographicCamera ) {

			// if orthographic, calculate 'virtual' camera position

			cameraPosition.sub( target ); // now vector from target

			cameraPosition.setLength( CAMERA_OFFSET / camera.zoom ); // scale for zoom factor
			cameraPosition.add( target ); // relocate in world space

		}

		// transform camera position into model coordinate system

		cameraPosition.applyMatrix4( inverseWorld );

		const stations = this.stations;
		const points = stations.vertices;
		const l = points.length;

		const showName = ( ( camera.layers.mask & 1 << LABEL_STATION ) !== 0 );
		const showComments = ( ( camera.layers.mask & 1 << LABEL_STATION_COMMENT ) !== 0 );
		const commentRatio = l / this.commentCount;

		for ( let i = 0; i < l; i++ ) {

			const station = points[ i ];
			const comment = station.comment;
			const label = station.label;

			const showComment = showComments && comment !== undefined;

			if ( ! stations.isStationVisible( station ) ) {

				if ( label ) label.visible = false;
				continue;

			}

			const connections = station.effectiveConnections();
			let d2 = 40000;

			if ( label?.visible ) {

				if ( connections === 0 ) {

					d2 = 600;

				} else if ( connections < 3 ) {

					d2 = 10000;

				} else {

					d2 = 50000;

				}

			} else {

				if ( connections === 0 ) {

					d2 = 250;

				} else if ( connections < 3 ) {

					d2 = 5000;

				}

			}

			// eager display of comments scaled by density of comments in survey
			if ( showComment ) d2 *= commentRatio;

			// show labels for network vertices at greater distance than intermediate stations
			const visible = ( station.distanceToSquared( cameraPosition ) < d2 );

			if ( visible ) {

				let name = '';

				if ( showName ) name += station.name;
				if ( showName && showComment ) name += ' ';
				if ( showComment ) name += comment;

				if ( label && label.name !== name ) {

					// remove label with the wrong text
					this.remove( label );
					station.label = null;

				}

				if ( ! station.label ) {

					this.addLabel( station, name, connections );

				}

				if ( station.label ) station.label.visible = true;

			} else {

				if ( label ) label.visible = false;

			}

		}

	}

	addLabel ( station, name, connections ) {

		let material;

		if ( station.next !== null ) {

			let next = station.next;

			// skip labels for all expect lowest id station
			while ( next !== station ) {

				if ( Math.abs( station.id ) > Math.abs( next.id ) ) return;
				next = next.next;

			}

			material = this.linkedLabelMaterial;

		} else if ( connections === 0 ) {

			material = this.splayLabelMaterial;

		} else if ( connections < 3 ) {

			material = this.defaultLabelMaterial;

		} else {

			material = this.junctionLabelMaterial;

		}

		const label = new GlyphString( name, material, this.ctx );

		label.layers.mask = this.layers.mask;
		label.position.copy( station );

		station.label = label;

		this.addStatic( label );

	}

}

export { StationLabels };