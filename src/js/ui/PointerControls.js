import {
	LEG_CAVE, SHADING_PATH, SHADING_DISTANCE,
	MOUSE_MODE_ROUTE_EDIT, MOUSE_MODE_NORMAL, MOUSE_MODE_DISTANCE, MOUSE_MODE_TRACE_EDIT, MOUSE_MODE_ENTRANCES, SHADING_CURSOR
} from '../core/constants';

import { StationPopup } from './StationPopup';
import { StationDistancePopup } from './StationDistancePopup';
import { SegmentPopup } from './SegmentPopup';
import { ImagePopup } from './ImagePopup';
import { StationNameLabel } from './StationNameLabel';
import { TapGesture, pointerHovers } from './PointerGestures';
import { EventDispatcher, Raycaster, MOUSE } from '../Three';

class PointerControls extends EventDispatcher {

	constructor ( ctx, domElement ) {

		super();

		const viewer = ctx.viewer;
		const controls = viewer.getControls();
		const container = ctx.container;
		const cameraMove = viewer.cameraMove; // FIXME temp

		const raycaster = new Raycaster();

		raycaster.layers.enableAll();

		const formatters = {};

		let publicFactory = null;

		const mouseUpEvent = { type: 'select', node: null };

		// signals the end of a station hover to the rest of the viewer. The hover itself
		// is reported to applications as an event of the viewer, but its end is of no
		// interest outside, where anything displayed for a station is displayed until
		// something else replaces it.

		const hoverEndEvent = { type: 'hoverEnd' };

		let lastMouseMode = MOUSE_MODE_NORMAL;
		let mouseMode = MOUSE_MODE_NORMAL;
		let mouseTargets = [];
		let clickCount = 0;

		let survey = null;
		let popup = null;

		const self = this;

		let mouseUpFunction = null;

		let hoverLabel = null;
		let hoverStation = null;
		let hoverHandled = false;
		let showStationNameLabel = false;
		let lastStationNameLabel = false;

		let showStationDistances = false;
		let startStation = null;
		let lastPointerOver = 0;
		let activePointerId = null;

		// a pointer that does not hover reveals a station by tapping it - see pointerUp()

		const tap = new TapGesture();

		// event handler

		viewer.addEventListener( 'newSurvey', e => {

			survey = e.survey;
			publicFactory = e.publicFactory;

			mouseTargets = survey.pointTargets;

			container.addEventListener( 'pointerdown', onPointerDown, false );

		} );

		viewer.addEventListener( 'clear', () => {

			survey = null;
			mouseTargets = [];
			mouseMode = MOUSE_MODE_NORMAL;

			endHover();

			container.removeEventListener( 'pointerdown', onPointerDown );

		} );

		viewer.addEventListener( 'dispose', () => {

			document.removeEventListener( 'keyup', endDistanceMode );

			container.removeEventListener( 'pointerup', pointerUp );
			container.removeEventListener( 'pointercancel', pointerCancel );
			container.removeEventListener( 'pointerdown', onPointerDown );
			container.removeEventListener( 'pointermove', onPointerMove );
			container.removeEventListener( 'pointermove', trackTap );

		} );

		viewer.addEventListener( 'change', e => {

			if ( e.name !== 'shadingMode' ) return;

			const shadingMode = e.value;

			if ( shadingMode === SHADING_DISTANCE ) {

				if ( mouseMode !== MOUSE_MODE_DISTANCE ) {

					lastMouseMode = mouseMode;
					mouseMode = MOUSE_MODE_DISTANCE;
					mouseTargets = survey.pointTargets;

				}

			} else {

				mouseMode = lastMouseMode;

			}

		} );

		this.setEditMode = function ( x ) {

			mouseMode = Number( x  );
			lastMouseMode = mouseMode;

			clickCount = 0;
			survey.markers.clear();
			survey.selectSection( survey.surveyTree );

			viewer.renderView();

			raycaster.params.Points.threshold = 3;

			switch ( mouseMode ) {

			case MOUSE_MODE_TRACE_EDIT:

				mouseTargets = survey.pointTargets.concat( [ survey.dyeTraces ] );

				break;

			case MOUSE_MODE_NORMAL:

				mouseTargets = survey.pointTargets;

				break;

			case MOUSE_MODE_ROUTE_EDIT:

				mouseTargets = survey.legTargets;

				break;

			case MOUSE_MODE_ENTRANCES:

				mouseTargets = survey.entranceTargets;
				raycaster.params.Points.threshold = 15;

				break;

			default:

				console.warn( 'invalid mouse mode', x );

			}

		};

		this.getEditMode = function () {

			return mouseMode;

		};

		function showStationImagePopup ( station, imageUrl ) {

			if ( popup !== null ) return;

			popup = new ImagePopup( ctx, station, imageUrl, () => viewer.renderView() );
			survey.addStatic( popup );

			viewer.renderView();

		}

		function showStationPopup ( pStation ) {

			if ( popup !== null ) return;

			popup = new StationPopup( ctx, pStation, survey, formatters.station, ( survey.caveShading === SHADING_DISTANCE ), self.warnings );
			survey.addStatic( popup );

			viewer.renderView();

		}

		function showSegmentPopup ( leg, point ) {

			if ( popup !== null ) return;

			popup = new SegmentPopup( ctx, leg, point );
			survey.addStatic( popup );

			viewer.renderView();

		}

		this.setPopup = function ( station ) {

			closePopup();

			if ( station.isStation() ) showStationPopup( publicFactory.getStation( station ) );

		};

		function closePopup () {

			if ( popup === null ) return;

			popup.close();
			popup = null;

		}

		function endDistanceMode ( event ) {

			if ( event.key != 'Shift' ) return;

			// cancel showStation mode

			showStationDistances = false;

			closePopup();
			self.setStationNameLabelMode( lastStationNameLabel );
			controls.enabled = true;

			document.removeEventListener( 'keyup', endDistanceMode );

		}

		function showStationPopupX ( station, event ) {

			if ( event.shiftKey && ! showStationDistances ) {

				lastStationNameLabel = showStationNameLabel;
				showStationDistances = true;
				startStation = station.station;

				self.setStationNameLabelMode( true );
				controls.enabled = false;

				document.addEventListener( 'keyup', endDistanceMode );

			} else {

				showStationPopup( station );

			}

			mouseUpFunction = closePopup;

			cameraMove.preparePoint( survey.getWorldPosition( station.station.clone() ) );

		}

		function endPointer () {

			container.removeEventListener( 'pointerup', pointerUp );
			container.removeEventListener( 'pointercancel', pointerCancel );
			container.removeEventListener( 'pointermove', trackTap );

			activePointerId = null;

		}

		// where the pointer goes while it is down is what tells a tap from the drag that
		// turns the model, so it is reported to the gesture for as long as it is down.
		// This is not the tracking that displays what is under the pointer: that follows a
		// pointer that hovers, and only while the name label is displayed.

		function trackTap ( event ) {

			tap.move( event );

		}

		function pointerUp ( event ) {

			// trap for event that shouldn't happen
			if ( event.pointerId !== activePointerId ) console.warn( 'wrong pointer up' );

			endPointer();

			if ( mouseUpFunction ) mouseUpFunction();

			// what a mouse reveals by being moved over a station, a pointer that does not
			// hover reveals by tapping it: the same tracking is run where the tap ended,
			// and a tap on anything else dismisses what the last one revealed. Stations
			// are tracked under either pointer only while the name label is displayed.

			if ( tap.end( event ) && showStationNameLabel ) {

				if ( ! hoverAt( event.clientX, event.clientY, event.pointerType ) ) {

					endHover();
					closeHoverLabel();

				}

			}

			viewer.renderView();

			viewer.dispatchEvent( mouseUpEvent );

		}

		// a gesture the browser has taken over ends without a pointerup, so the state the
		// next one starts from is reset here instead

		function pointerCancel ( event ) {

			if ( event.pointerId !== activePointerId ) return;

			endPointer();

			tap.cancel();

		}

		function filterConnectedLegs ( event ) {

			if ( event.filterConnected ) {

				survey.setShadingMode( survey.caveShading, true );
				viewer.renderView();

			}

		}

		this.getStationNameLabelMode = function () {

			return showStationNameLabel;

		};

		this.setStationNameLabelMode = function ( mode ) {

			if ( mode ) {

				container.addEventListener( 'pointermove', onPointerMove );


			} else {

				if ( closeHoverLabel() ) viewer.renderView();

				endHover();

				container.removeEventListener( 'pointermove', onPointerMove );

			}

			showStationNameLabel = mode;

		};

		function checkLegIntersects ( event ) {

			const legs = survey.features.get( LEG_CAVE );
			const legIntersect = raycaster.intersectObject( legs, false )[ 0 ];

			let legIndex = null;
			let segment = null;

			if  ( legIntersect ) {

				legIndex = legIntersect.faceIndex;

				const legInfo = legs.getLegInfo( legIndex );
				const leg = publicFactory.getLeg( legInfo );

				segment = legInfo.segment;

				const e = {
					type: 'leg',
					leg: leg,
					handled: false,
					highlight: false,
					mouseEvent: event
				};

				viewer.dispatchEvent( e );

				if ( e.highlight ) {

					mouseUpFunction = _setLegHighlight;

					_setLegHighlight();
					viewer.renderView();

				}

				if ( ! e.handled ) {

					mouseUpFunction = _setSegmentHighlight;

					_setSegmentHighlight();
					showSegmentPopup( leg );
					viewer.renderView();

				}

				legIndex = null;
				segment = null;

			}

			function _setLegHighlight () {

				legs.setHighlightLeg( legIndex );
				viewer.shadingMode = survey.caveShading;

			}

			function _setSegmentHighlight () {

				legs.setHighlightSegment( segment );
				viewer.shadingMode = survey.caveShading;
				if ( segment === null ) closePopup();

			}

		}

		function selectStation ( station, event ) {

			survey.selectStation( station );

			const pStation = publicFactory.getStation( station );

			const selectEvent = {
				type: 'station',
				node: pStation,
				handled: false,
				mouseEvent: event,
				filterConnected: false
			};

			viewer.dispatchEvent( selectEvent );

			filterConnectedLegs( selectEvent );

			if ( selectEvent.handled ) return;

			if ( event.button === MOUSE.LEFT ) {

				showStationPopupX( pStation, event );

				if ( viewer.shadingMode === SHADING_CURSOR ) viewer.cursorHeight = station.z;

			} else if ( event.button === MOUSE.RIGHT ) {

				if ( ! survey.selection.contains( station.id ) ) {

					survey.selectSection( survey.surveyTree );

				}

				viewer.selectSection( station );

				cameraMove.start( true );
				event.stopPropagation();

				mouseUpFunction = null;

			}

		}

		function endHover () {

			if ( hoverStation === null ) return;

			hoverStation = null;
			hoverHandled = false;

			self.dispatchEvent( hoverEndEvent );

		}

		function closeHoverLabel () {

			if ( hoverLabel === null ) return false;

			hoverLabel.close();
			hoverLabel = null;

			return true;

		}

		// the station at a position of the screen becomes the one being hovered over, and
		// is reported as such to the application. Returns false where there is no station
		// there, which the pointer being moved and the pointer being tapped end the hover
		// differently for - see onPointerMove() and pointerUp().

		function hoverAt ( x, y, pointerType ) {

			viewer.setRaycaster( raycaster, viewer.getMouse( x, y ) );

			const hit = raycaster.intersectObjects( mouseTargets, false )[ 0 ];

			// the mouse targets of an edit mode include geometry that is not a station -
			// dye traces and entrance markers - so a hit alone does not identify a station

			const station = hit?.station;

			if ( station === undefined ) return false;

			if ( hoverLabel !== null && hoverLabel.station !== station ) closeHoverLabel();

			if ( station !== hoverStation ) {

				hoverStation = station;

				const hoverEvent = {
					type: 'stationHover',
					station: publicFactory.getStation( station ),
					pointerType: pointerType,
					handled: false
				};

				viewer.dispatchEvent( hoverEvent );

				// a listener displaying its own station information handles the hover,
				// which suppresses the name label until another station is hovered over

				hoverHandled = hoverEvent.handled;

			}

			if ( hoverLabel === null && ( showStationDistances || ! hoverHandled ) ) {

				if ( showStationDistances ) {

					hoverLabel = new StationDistancePopup( ctx, survey, startStation, station );

				} else {

					hoverLabel = new StationNameLabel( ctx, station );

				}

				survey.addStatic( hoverLabel );

			}

			lastPointerOver = performance.now();

			viewer.renderView();

			return true;

		}

		function onPointerMove( event ) {

			if ( event.target !== domElement ) return;

			// a pointer that does not hover is dragging the model while it is down, which
			// reveals nothing: what a hover would reveal, a tap of the same pointer does

			if ( event.buttons !== 0 && ! pointerHovers( event.pointerType ) ) return;

			if ( hoverAt( event.clientX, event.clientY, event.pointerType ) ) return;

			setTimeout( () => {

				if ( performance.now() - lastPointerOver <= 250 ) return;

				// the pointer has left the station - returning to it is a new hover

				endHover();

				if ( closeHoverLabel() ) viewer.renderView();

			}, 500 );

		}

		function onPointerDown ( event ) {

			if ( activePointerId !== null || event.target !== domElement ) {

				// a gesture of a second pointer, or one begun over something placed over
				// the model, is not a tap of the model

				tap.cancel();

				return;

			}

			viewer.setRaycaster( raycaster, viewer.getMouse( event.clientX, event.clientY ) );

			container.addEventListener( 'pointerup', pointerUp );
			container.addEventListener( 'pointercancel', pointerCancel );
			container.addEventListener( 'pointermove', trackTap );

			activePointerId = event.pointerId;

			tap.start( event );

			if ( event.altKey ) {

				checkLegIntersects( event );
				return;

			}

			if ( self.entrances ) {

				const entrance = raycaster.intersectObjects( survey.entrances.labels, false )[ 0 ];

				if ( entrance !== undefined ) {

					const station = survey.surveyTree.findById( entrance.object.stationID );

					const e = {
						type: 'entrance',
						displayName: entrance.name,
						station: publicFactory.getStation( station ),
						filterConnected: false,
						handled: false,
						mouseEvent: event
					};

					viewer.dispatchEvent( e );

					filterConnectedLegs( e );

					if ( ! e.handled ) {

						selectStation( station, event );

					}

					return;

				}

			}

			const hit = raycaster.intersectObjects( mouseTargets, false )[ 0 ];

			switch ( mouseMode ) {

			case MOUSE_MODE_NORMAL:

				if ( hit === undefined ) break;
				selectStation( hit.station, event );

				break;

			case MOUSE_MODE_ROUTE_EDIT:

				if ( hit === undefined ) break;
				selectSegment( hit );

				break;

			case MOUSE_MODE_DISTANCE:

				selectDistance( hit, event );

				break;

			case MOUSE_MODE_TRACE_EDIT:

				if ( event.button === MOUSE.LEFT && hit ) {

					if ( hit.station ) {

						selectTraceStation( hit.station );

					} else {

						selectTrace( hit );

					}

				}

				break;

			}

		}

		function selectDistance ( hit, event ) {

			if ( ! hit ) {

				if ( event.button === MOUSE.RIGHT ) {

					// default distance shading
					survey.maxDistance = 0;
					viewer.shadingMode = SHADING_DISTANCE;

				}

				return;

			}

			const station = hit.station;

			if ( event.button === MOUSE.LEFT ) {

				survey.showShortestPath( station );

				showStationPopupX( publicFactory.getStation( station ), event );

			} else if ( event.button === MOUSE.RIGHT ) {

				survey.setShortestPaths( station );
				viewer.renderView();

			}

		}

		function selectSegment ( picked ) {

			survey.getRoutes().toggleSegment( picked.index );

			viewer.setShadingMode( SHADING_PATH );

			viewer.renderView();

		}

		function selectTrace ( hit ) {

			const dyeTraces = survey.dyeTraces;
			const traceIndex = hit.faceIndex;

			survey.markers.clear();

			dyeTraces.outlineTrace( traceIndex );

			viewer.dispatchEvent( {
				type: 'selectedTrace',
				trace: dyeTraces.getTraceStations( traceIndex ),
				delete: function _deleteTrace () {
					dyeTraces.deleteTrace( traceIndex );
					viewer.renderView();
				}
			} );

			viewer.renderView();

		}

		function selectTraceStation ( station ) {

			const dyeTraces = survey.dyeTraces;
			const markers = survey.markers;

			dyeTraces.outlineTrace( null );

			if ( ++clickCount === 3 ) {

				markers.clear();
				clickCount = 1;

			}

			markers.mark( station );

			const list = markers.getStations();

			let start, end;

			if ( list[ 0 ] !== undefined ) start = list[ 0 ].getPath();
			if ( list[ 1 ] !== undefined ) end = list[ 1 ].getPath();

			viewer.dispatchEvent( {
				type: 'selectedTrace',
				start: start,
				end: end,
				add: function () {
					if ( list.length !== 2 ) return;

					dyeTraces.addTrace( list[ 0 ], list[ 1 ] );

					markers.clear();
					viewer.renderView();

				}
			} );

			viewer.renderView();

		}

		this.selectTraceStation = selectTraceStation;

		this.showImagePopup = function ( event, imageUrl ) {

			showStationImagePopup( event.node, imageUrl );
			mouseUpFunction = closePopup;

		};

	}

}

export { PointerControls };