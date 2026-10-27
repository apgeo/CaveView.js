# Fitting the viewer into an application

## Coordinate systems, without a third party

To place a survey on the map the viewer resolves the coordinate system it was made in. Upstream
asks a public web service for the definition. A host that must work offline, or keep which surveys
it holds to itself, supplies its own:

```js
new CV2.CaveViewer( 'model', {
  crsLookup: async ( code ) => {          // a numeric EPSG/ESRI code
    const response = await fetch( `/api/crs/${code}.proj4` );
    return response.ok ? response.text() : null;   // a proj4 string, or null when unknown
  }
} );
```

A lookup that throws or answers `null` leaves the survey unplaced, which is the safe failure.

## The interface in the reader's language

`language: 'ro'` loads `lib/lang-ro.json` from the viewer's `home`; English is built in. The fork
carries a complete Romanian catalogue. Pass the language of the application around the viewer rather
than leaving it to the browser's, or the two can disagree on one screen; the catalogue is shared by
every viewer of a page, so give every viewer the same one. Labels built before the catalogue arrives
are written again when it does.

## Disposing of a viewer

`viewer.dispose()` takes the viewer down cleanly: listeners removed (upstream's dispose handler
misspelled `removeEventListener` and stopped half-way), workers' turns given back, a load still in
flight ended silently, and a later `renderView()`, `resize()` or second `dispose()` does nothing
rather than throwing. `getSnapshot()` after disposal throws an Error saying so. An application that
mounts and unmounts viewers — one per model, in a single-page application — needs all of that.

## The keyboard

The viewer's shortcuts listen on the document while the pointer is over the model. A key typed into
a text field, a text area or an editable element of the host page is left to that element, so a form
beside the model works; the viewer's own chooser and sliders keep their arrow keys.

## Other fixes on this branch

- `CaveViewUI.loadCaves()` loads several named files through the interface.
- A viewer resized while its container is hidden keeps its last real size instead of coming back
  with a broken zoom.
- On three.js r183 (upstream `dev`) the height-shaded line shader failed to compile and the survey's
  lines vanished; a three-line fix is on `feature/line-shader-r183`, offered upstream. The `silexgis`
  branch stays on the 2.9.0 release's three.js r171.
