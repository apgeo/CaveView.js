import { BufferGeometry, Float32BufferAttribute, Mesh } from '../../Three';

class Walls extends Mesh {

	ready = true;
	flat = false;
	flatGeometry = null;
	indexedGeometry = null;

	constructor ( ctx ) {

		const geometry = new BufferGeometry();

		super( geometry, ctx.materials.getUnselectedWallMaterial() );

		this.ctx = ctx;
		this.type = 'Walls';

	}

	addWalls ( vertices, indices, indexRuns ) {

		const geometry = this.geometry;
		const positions = new Float32BufferAttribute( vertices.length * 3, 3 );

		vertices.forEach( ( v, i ) => {  positions.setXYZ( i, v.x, v.y, v.z ); } );

		geometry.setAttribute( 'position', positions );

		geometry.setIndex( indices );

		geometry.computeVertexNormals();
		geometry.computeBoundingBox();

		this.indexRuns = indexRuns;

		return this;

	}

	setShading ( idSet, selectedMaterial ) {

		const geometry = this.geometry;
		const indexRuns = this.indexRuns;
		const materials = this.ctx.materials;

		geometry.clearGroups();

		this.visible = this.ready;

		if ( idSet.length > 0 && indexRuns ) {

			this.material = [ selectedMaterial, materials.getUnselectedWallMaterial() ];

			let indexRun = indexRuns[ 0 ];

			let start = indexRun.start;
			let count = indexRun.count;

			let currentMaterial;
			let lastMaterial = idSet.has( indexRun.survey ) ? 0 : 1;

			// merge adjacent runs with shared material.

			for ( let run = 1, l = indexRuns.length; run < l; run++ ) {

				indexRun = indexRuns[ run ];

				currentMaterial = idSet.has( indexRun.survey ) ? 0 : 1;

				if ( currentMaterial === lastMaterial && indexRun.start === start + count ) {

					count += indexRun.count;

				} else {

					geometry.addGroup( start, count, lastMaterial );

					start = indexRun.start;
					count = indexRun.count;

					lastMaterial = currentMaterial;

				}

			}

			geometry.addGroup( start, count, lastMaterial );

		} else if ( this.hasHiddenRuns() ) {

			// drawn run by run, the runs of the sections that are hidden being left out:
			// a mesh with a list of materials draws its groups and nothing else

			const hiddenIds = this.ctx.survey.hiddenIds;

			this.material = [ selectedMaterial ];

			let start = 0;
			let count = 0;

			for ( let run = 0, l = indexRuns.length; run < l; run++ ) {

				const indexRun = indexRuns[ run ];

				if ( hiddenIds.has( indexRun.survey ) ) continue;

				if ( count > 0 && indexRun.start === start + count ) {

					count += indexRun.count;

				} else {

					if ( count > 0 ) geometry.addGroup( start, count, 0 );

					start = indexRun.start;
					count = indexRun.count;

				}

			}

			if ( count > 0 ) geometry.addGroup( start, count, 0 );

		} else {

			this.material = selectedMaterial;

		}

	}

	// whether any of the runs the mesh is made of belongs to a section that is hidden

	hasHiddenRuns () {

		const hiddenIds = this.ctx.survey?.hiddenIds;
		const indexRuns = this.indexRuns;

		if ( hiddenIds === undefined || hiddenIds.size === 0 || ! indexRuns ) return false;

		return indexRuns.some( indexRun => hiddenIds.has( indexRun.survey ) );

	}

	cutRuns ( survey, selection ) {

		const wasFlat = this.flat;

		this.setFlat( false );

		if ( this.flatGeometry ) {

			this.flatGeometry.dispose();
			this.flatGeometry = null;

		}

		const geometry = this.geometry;

		const vertices = geometry.getAttribute( 'position' );
		const indices = geometry.index;

		const idSet = selection.getIds();
		const indexRuns = this.indexRuns;

		const newIndices = [];
		const newVertices = [];

		const newIndexRuns = [];

		// map old vertex index values to new index values
		const vMap = new Map();

		const l = indexRuns.length;

		let run, newVertexIndex = 0, fp = 0;

		for ( run = 0; run < l; run++ ) {

			const indexRun = indexRuns[ run ];

			if ( idSet.has( indexRun.survey ) ) {

				const start = indexRun.start;
				const count = indexRun.count;

				const end = start + count;

				const itemSize = vertices.itemSize;
				const oldVertices = vertices.array;

				for ( let i = start; i < end; i++ ) {

					const index = indices.getX( i );

					let newIndex = vMap.get( index );

					if ( newIndex === undefined ) {

						const offset = index * itemSize;

						newIndex = newVertexIndex++;

						vMap.set( index, newIndex );

						newVertices.push( oldVertices[ offset ], oldVertices[ offset + 1 ], oldVertices[ offset + 2 ] );

					}

					newIndices.push( newIndex );

				}

				indexRun.start = fp;

				fp += count;

				newIndexRuns.push( indexRun );

			}

		}

		if ( newIndices.length === 0 ) return false;

		// replace position and index attributes - dispose of old attributes
		geometry.index = new indices.constructor( newIndices );
		geometry.setAttribute( 'position', new Float32BufferAttribute( newVertices, 3 ) );

		geometry.computeVertexNormals();
		geometry.computeBoundingBox();

		this.indexRuns = newIndexRuns;

		this.setFlat( wasFlat );

		return true;

	}

	setFlat ( flat ) {

		if ( flat === this.flat ) return;

		const geometry = this.geometry;
		let flatGeometry = this.flatGeometry;

		if ( flat ) {

			if ( flatGeometry === null ) {

				flatGeometry = geometry.toNonIndexed();

				flatGeometry.computeVertexNormals();
				flatGeometry.computeBoundingBox();

			}

			this.indexedGeometry = geometry;
			this.geometry = flatGeometry;

			this.dropBuffers();

		} else {

			this.flatGeometry = geometry;
			this.geometry = this.indexedGeometry;

		}

		// the groups the mesh is drawn by are those of the geometry displayed until now:
		// each vertex of the flat geometry stands for one index of the other, so a group
		// is the same range of either

		if ( this.geometry !== geometry ) {

			this.geometry.clearGroups();

			geometry.groups.forEach( group => this.geometry.addGroup( group.start, group.count, group.materialIndex ) );

		}

		this.flat = flat;

	}

}

export { Walls };