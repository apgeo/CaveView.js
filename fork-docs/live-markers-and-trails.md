# Live markers and trails: people in the cave

Upstream draws a model and its own features. The fork lets an application draw **its** things over
the model while it is displayed: a labelled marker for each person or team, moved from station to
station as reports come in, and a **trail** for the way somebody went. Together they are a live map
of who is underground, or the replay of a trip that is over.

## Markers

```js
viewer.addLiveMarker( 'ana', 'cave.entrance.0', {
  label: 'Ana',                       // one line, or an array of lines
  sublabel: 'since 09:40',            // shown while the marker is hovered or tapped
  color: '#e6194b',                   // CSS colour; the theme's by default
  payload: { caverId: 17 }            // yours, handed back with the marker and its events
} );

viewer.moveLiveMarker( 'ana', 'cave.big_pitch.12' );                 // slides there (600 ms)
viewer.moveLiveMarker( 'ana', 'cave.big_pitch.14', { duration: 0 } ); // placed at once
viewer.removeLiveMarker( 'ana' );
viewer.clearLiveMarkers();
viewer.getLiveMarkers();   // [{ id, ref, label, sublabel, color, resolved, … }]
```

- **A station the model does not have** leaves the marker unresolved: drawn nowhere, reported with
  `resolved: false`, and placed as soon as a model that has the station is loaded. Markers survive
  a model being cleared and loaded again.
- **Several markers at one station** are drawn as one, labelled with how many there are — or with
  what `viewer.setLiveMarkerClusterLabel( markers => … )` returns, a string or an array of lines
  (a team name over its members, say). Markers that set off together between the same two stations
  travel as one.
- **Labels** are drawn smaller than the model's own, on a translucent plate whose colour is worked
  out from the background, with the first line in the marker's colour; neighbouring labels are moved
  apart so they do not overlap. `liveMarkerLabels`, `liveMarkerLabelSize` and
  `liveMarkerLabelBacking` turn labels off, size them, and drop the plate. The label font carries
  the accented letters of European names (ă â î ș ț, ö, ñ, ł …).
- **Pointing at a marker** dispatches `liveMarkerHover` (or `liveMarkerCluster` for a collapsed one)
  with the marker's id and the kind of pointer; set `event.handled = true` to show your own panel.
  The target is 32 px for a mouse and 44 px for a finger.
- **Without a pointer**: `viewer.revealLiveMarker( 'ana' )` shows a marker's sublabel from a link or a
  list beside the model; `viewer.clearLiveMarkerReveal()` hides it.
- **Framing everyone**: `viewer.frameLiveMarkers( { margin: 0.05 } )` moves the camera to take in
  every displayed marker, and returns `false` when there is none.

`viewer.liveMarkerMoveTime` (600 ms) is the default length of a move. A replay running faster than
real time sets it lower, or passes `duration` on each move: a move given while another is in flight
replaces it rather than queueing behind it.

## Trails

```js
const trail = viewer.addTrail( 'ana-route',
  [ 'cave.entrance.0', 'cave.big_pitch.12', 'cave.bivouac.3' ],
  { color: '#e6194b', width: 3, style: 'solid', progress: 1 } );

trail.lengthM;     // metres, along the survey
trail.points;      // each place: ref, resolved, atLength (metres along the route)
trail.gaps;        // pairs of places the survey cannot join

viewer.setTrailProgress( 'ana-route', 0.4 );                 // draw the first 40 % of its length
viewer.updateTrail( 'ana-route', null, { visible: false } ); // options only, no re-routing
viewer.removeTrail( 'ana-route' );
```

A trail is routed **along the survey's own legs** between the places it is given, not as straight
lines through rock. Two places the survey cannot join are drawn straight and dashed, and reported
as a gap. Like markers, trails name stations and are routed again over whatever model is loaded
next.

## Replaying a trip

A log of reports — this person at this station at this time — becomes a replay with these calls and
a clock:

```js
// reports: [{ at: Date, who: 'ana', station: 'cave.big_pitch.12' }, …], in time order
function showAt( instant ) {
  for ( const person of people ) {
    const last = reports.filter( r => r.who === person.id && r.at <= instant ).pop();
    if ( last ) viewer.moveLiveMarker( person.id, last.station, { duration: 0 } );
  }
  for ( const person of people ) {
    viewer.setTrailProgress( person.id + '-route', progressOf( person, instant ) );
  }
}
```

`duration: 0` makes scrubbing exact; while playing, a short duration lets markers glide. The trail's
`points[i].atLength` (how far along the route each place lies, in metres) turns "had reached the fourth reported
place" into a progress fraction. The club pages in [examples.md](examples.md) do exactly this, from
data exported out of SilexGIS.
