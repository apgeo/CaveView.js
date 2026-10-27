# Comparing surveys

Two surveys of one cave — this year's and last year's, a resurvey and the original, two teams'
work before it is joined — are best seen together. The fork lets one viewer hold several files and
tell them apart, and two viewers share one view.

## Several files in one viewer

```js
viewer.loadCaves( [
  { name: 'cave-2024.lox', label: 'survey 2024', color: '#1f78b4' },
  { name: 'cave-2025.lox', label: 'survey 2025', color: '#e31a1c' }
] );
```

Each **file description** names its file (`name`, or a `File` as `file`), a **label** — the name of
a survey the file's own surveys are placed under, so two files that name their surveys alike stay
apart — and a **colour** used when the model is shaded by section (`CV2.SHADING_SURVEY`). Files are
drawn in the order given, the later on top. `loadCave()` takes a single description as well.

## Hiding and showing sections

```js
viewer.setSectionVisible( 'survey 2024', false );     // the 2024 file hidden, the rest untouched
viewer.showAllSections();                             // everything back
viewer.getHiddenSections();                           // [[ 'survey 2024' ], …]
viewer.addEventListener( 'change', ( e ) => { if ( e.name === 'hiddenSections' ) refreshLegend(); } );
```

A hidden section takes its legs, stations, labels, entrances, walls and scraps with it, and is not
picked by the pointer. Any section can be hidden, not only a file's.

## Asking about a section

```js
viewer.getSectionColor( 'survey 2025' );   // '#e31a1c' — for a legend that matches the model
viewer.getSectionBounds( 'survey 2025' );  // { min: {x,y,z}, max: {x,y,z} } in the survey's coordinates
```

The bounds tell an application whether two files lie over one another or were surveyed in
coordinate systems that have nothing to do with each other.

## Two viewers, one view

```js
left.addEventListener( 'viewpoint', () => right.setViewpoint( left.getViewpoint() ) );
right.addEventListener( 'viewpoint', () => left.setViewpoint( right.getViewpoint() ) );
```

A viewpoint is `{ azimuth, polar, zoom, target, cameraType }`, each in units that mean the same for
another model in a container of another size, so two surveys side by side are seen from the same
direction at the same scale relative to their extent. `setViewpoint()` dispatches no `viewpoint`
event, so the two listeners above do not echo each other.
