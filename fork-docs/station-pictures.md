# Pictures attached to stations

A host hands the viewer the pictures it holds for each station; the viewer shows them as a strip of
thumbnails when the pointer rests on that station, or when `focusStation()` is called with
`popup: true`, and the full image when a thumbnail is pressed.

```js
viewer.setStationMedia( new Map( [
  [ 'cave.entrance.0', [
    { url: '/pictures/entrance.jpg', thumbnailUrl: '/pictures/tn_entrance.jpg', caption: 'The entrance' }
  ] ],
  [ 'cave.big_pitch.12', [
    { url: '/pictures/pitch-head.jpg', thumbnailUrl: '/pictures/tn_pitch-head.jpg' },
    { url: '/pictures/pitch-foot.jpg', thumbnailUrl: '/pictures/tn_pitch-foot.jpg' }
  ] ]
] ) );

viewer.stationLabelOver = true;    // the strip appears where the station name would, so this is needed
```

The source may also be a function of the `Station` object returning the same array, or `null`.
Only the addresses are held; the browser fetches the images as it fetches any other image of the
page. `viewer.clearStationMedia()` takes the source and any open strip away.

## Where the strip goes

By default the strip is a column at the left edge of the model, where it covers none of the cave.
The configuration option `stationMediaPlacement: 'station'` puts it beside the station instead. Its
look comes from CSS custom properties on the container (`--cv-media-thumbnail-size`,
`--cv-media-background` and others, listed in the reference).

## Showing where the pictures are

```js
viewer.setStationMediaMarkers( true );   // a small camera above every station that has pictures
viewer.addEventListener( 'mediaMarker', ( event ) => { /* event.station was pressed */ } );
```

A station holding several pictures shows how many. This needs a `Map` source: a function names no
stations in advance.

## Opening a picture yourself, and failures

```js
viewer.addEventListener( 'mediaOpen', ( event ) => {
  myLightbox.open( event.entry.url, event.entry.caption );
  event.handled = true;              // instead of the viewer's own popup
} );

viewer.addEventListener( 'mediaError', ( event ) => {
  // event.url failed to load; its thumbnail has already been taken out of the strip
  event.handled = true;              // instead of the console warning
} );
```

A server that is case-sensitive will not answer `Photo.jpg` for `photo.JPG`; `mediaError` is where
such a mismatch shows.
