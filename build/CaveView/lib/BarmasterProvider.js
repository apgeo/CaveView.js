

function BarmasterProvider () {

}

BarmasterProvider.prototype.getUrl = function ( x, y, z ) {

	return 'overlays/barmaster/' + z + '/' + x + '/' + y + '.png';

};

BarmasterProvider.prototype.getAttribution = function () {

	var a = document.createElement( 'div' );

	a.textContent = 'Barmaster maps';

	return a;

};