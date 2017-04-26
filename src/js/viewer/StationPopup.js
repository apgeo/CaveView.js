import { Popup } from './Popup.js';


function StationPopup ( station, projection ) {

	Popup.call( this, 'station-info' );

	var point = station.p;
	var name = station.getPath();
	var long = false;
	var tmp;

	var originalPoint = { x: point.x, y: point.y };

	// convert to original survey CRS

	if  ( projection !== null ) originalPoint = projection.forward( originalPoint );

	// reduce name length if too long

	while ( name.length > 20 ) {

		tmp = name.split( '.' );
		tmp.shift();

		name = tmp.join( '.' );
		long = true;

	}

	if ( long ) name = '...' + name;

	this.addLine( name );
	this.addLine( 'x: ' + originalPoint.x + ' m' ).addLine( 'y: ' + originalPoint.y + ' m' ).addLine( 'z: ' + point.z + ' m' );

}

StationPopup.prototype = Object.create( Popup.prototype );

StationPopup.prototype.constructor = StationPopup;

export { StationPopup }