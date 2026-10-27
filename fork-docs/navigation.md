# Navigation: flying to a place by name

Upstream lets a host select a section with `viewer.sectionByName` and point the camera with
`setPOI`; there is no single call that finds a station, frames it and says when it got there. The
fork adds four.

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

## Highlighting without moving

```js
viewer.highlightStation( 'cave.big_pitch.12' );   // returns the Station, or null
viewer.clearHighlight();
```

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
