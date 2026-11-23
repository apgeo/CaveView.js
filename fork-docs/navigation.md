# Navigation: flying to a place by name

Upstream lets a host select a section with `viewer.sectionByName` and point the camera with
`setPOI`; there is no single call that finds a station, frames it and says when it got there. The
fork adds them, and a mark that shows the reader which station they were sent to.

## Flying to a station or a section

```js
await viewer.focusStation( 'cave.big_pitch.12' );                 // camera centred on the station
await viewer.focusStation( 'cave.big_pitch.12', { popup: true } ); // and its popup shown
await viewer.focusSurvey( 'cave.big_pitch' );                      // a whole section framed
```

Both return a Promise that resolves when the camera has arrived — with the station's `Station`
object, for `focusStation()` — and rejects when the name matches nothing in the loaded model, no
model is loaded, or the move was superseded by another focus or cancelled by the reader. Options of
`focusStation()`:

| option | default | effect |
|---|---|---|
| `highlight` | `true` | mark the station; `false` removes a highlight |
| `popup` | unset | `true` shows the station's popup, `false` closes an open one |
| `animate` | `false` | animate even for a reader who asked for reduced motion (see [toolbar-and-layout.md](toolbar-and-layout.md)) |
| `keepView` | `false` | move the camera with the station instead of swinging it round to face it, so a reader who chose a direction to look from keeps it |

A **close-up** of the station is `span`: the width of the survey, in metres, to take in about it.
The camera is moved as `keepView` moves it and only ever comes nearer, so a reader already looking
more closely is left where they are:

```js
await viewer.focusStation( 'cave.big_pitch.12', { span: 30 } );   // centred, about 30 m across
```

## Highlighting without moving

```js
viewer.highlightStation( 'cave.big_pitch.12' );   // returns the Station, or null
viewer.clearHighlight();
```

## Sending a reader to a place: the station mark

The viewer's highlight is a point in the model's own colours, lost among the stations about it once
the camera is any distance away. `markStation()` draws a crosshair over a station instead, with its
name beside it. It rides with the station while the camera flies and the reader turns the model,
leaves the screen with it, takes no pointer (the station under it can still be picked) and goes when
another model is loaded:

```js
viewer.markStation( 'cave.big_pitch.12' );                          // labelled with the name
viewer.markStation( 'cave.big_pitch.12', { label: 'Big pitch' } );  // '' for no label
viewer.markStation( 'cave.big_pitch.12', { offset: { x: 1, y: 2, z: -0.5 } } );   // a splay's end
viewer.getStationMark();     // { ref, offset, label } or null
viewer.clearStationMark();
```

`markStation()` returns the `Station`, or `null` (and takes any mark away) for a name the model does
not have. It does not move the camera. `showStation()` is the one call behind a list of places or a
link in a page's text: it resolves the name, flies there and marks it.

```js
const r = await viewer.showStation( 'big_pitch.12', { closeUp: true, label: 'Big pitch' } );
// r.kind: 'station' | 'survey' | 'none' | 'cancelled'
```

| option | default | effect |
|---|---|---|
| `closeUp` | `false` | a close-up of the station; otherwise it is centred at the camera's distance, keeping the direction it looks from |
| `span` | `30` | the width of the close-up, in metres |
| `splay` | unset | `{ length, compass, clino }` of a splay shot from the station: the mark goes on the far end of the model's splay that best matches it |
| `label` | the name | as for `markStation()` |
| `popup` | `false` | as for `focusStation()` |

It never rejects for a name: a section is framed by `focusSurvey()` with no mark (`'survey'`), a name
of nothing answers `'none'`, and a flight replaced by another move `'cancelled'`. For a station the
answer carries `name` (the dotted name the model has for it), `station`, and `splay`: `null`,
`'matched'`, `'closest'` (the nearest splay is more than 25° off) or `'missing'` (the station has no
splays), with `angle` in degrees. Only a `span` that is not a number of metres above 0 rejects.

Two helpers it uses are public too:

- `resolveStationName( name )` - the name the model has for a station named by a source that sees
  the survey from another level: a model compiled from a parent survey adds a level to every name,
  one compiled from inside it drops one. The name itself when the model has it; otherwise the one
  station whose path ends with it, or that it ends with, as an Array of path components; `null` when
  none fits or more than one does - it never guesses between two.
- `matchStationSplay( station, { length, compass, clino } )` - the splay of a station that best
  matches one measured from it: `{ offset, angle, matched }`, or `null` when it has none.

Its colours, font and stacking come from CSS custom properties, so no stylesheet is needed to restyle
it: `--cv-station-mark-color` (`#ff3b6b`), `--cv-station-mark-halo`, `--cv-station-mark-label-color`,
`--cv-station-mark-label-background`, `--cv-station-mark-font` and `--cv-station-mark-z-index` (`9`).
The crosshair closes in on the station as it is marked, except for a reader who prefers reduced
motion. A build that has all this says so with `CV2.STATION_MARK === true`.

## Marking a station with something of your own

A host wanting a mark of its own design - a callout, a picture - draws it over the container and asks,
for each frame, where the station is:

```js
const crosshair = document.getElementById( 'crosshair' );   // absolutely placed in the container

function follow () {
  const at = viewer.getStationScreenPosition( 'cave.big_pitch.12' );   // { x, y } or null
  crosshair.hidden = ( at === null );                                   // off the screen
  if ( at ) crosshair.style.transform = `translate(${at.x}px, ${at.y}px)`;
  requestAnimationFrame( follow );
}
requestAnimationFrame( follow );
```

A splay has no name to ask for. `getStationSplays( station )` gives the far end of each splay shot
from a station, as an offset from it in metres east, north and up; the host picks the one it means
(by its direction, say) and passes that offset as the second argument of
`getStationScreenPosition()`.

## Knowing what the pointer is over

```js
viewer.addEventListener( 'stationHover', ( event ) => {
  // event.station    the Station object (name(), coordinates(), depth() …)
  // event.pointerType 'mouse', 'touch' or 'pen'
  event.handled = true;   // set it to draw your own label instead of the viewer's
} );
```

On a touch screen a tap does what a hover does, so the same listener serves both.

## Links in a page's text

A page that tells the story of a cave can make the place names in its text fly the model there. The
station goes in a data attribute — WordPress and other editors strip `onclick` and `javascript:`
links from content — and one listener does the rest:

```html
<p>We rigged <a href="#model" data-station="cave.big_pitch.12">the big pitch</a> on day two.</p>
```

```js
document.addEventListener( 'click', ( event ) => {
  const link = event.target.closest( 'a[data-station]' );
  if ( !link ) return;
  event.preventDefault();
  viewer.focusStation( link.dataset.station, { popup: true } ).catch( () => {} );
} );
```

A survey names its stations as the surveyors did, so the stations worth linking to are usually the
ones they commented: walking the survey tree for nodes with a comment gives the surveyors' own
names for places, each with its station path.
