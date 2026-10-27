# The fork's features, and how to use them

These pages describe what this fork adds to CaveView.js, with examples. They assume the viewer is
set up as upstream documents it — the bundle loaded with a `<script>` tag, a configuration object,
a container element — and start from there. The complete reference for every method, property,
event and option, the fork's included, is `docs/reference.html`.

| page | what it covers |
|---|---|
| [navigation.md](navigation.md) | flying the camera to a station or a section by name, highlighting, the hover event, links in a page's text |
| [station-pictures.md](station-pictures.md) | pictures attached to stations, the strip that shows them, camera markers, failures |
| [live-markers-and-trails.md](live-markers-and-trails.md) | markers for people or teams, moving them, collapsing, labels; routes drawn along the survey; replaying a log |
| [toolbar-and-layout.md](toolbar-and-layout.md) | the toolbar; size classes, phones and touch; label size; fullscreen; reduced motion |
| [comparing-surveys.md](comparing-surveys.md) | several files in one viewer, labels and colours, hiding sections, linking two viewers' views |
| [capture.md](capture.md) | rendering the view frame by frame, for a movie |
| [host-integration.md](host-integration.md) | the coordinate-system lookup, the interface language, disposing a viewer, keyboard behaviour, the fixes |
| [examples.md](examples.md) | the club's journal pages, fed from data exported from SilexGIS |

## Setting a viewer up

```html
<link rel="stylesheet" href="/CaveView/css/caveview.css">
<script src="/CaveView/js/CaveView2.min.js"></script>
<div id="model" style="width: 800px; height: 600px; position: relative"></div>
<script>
  const viewer = new CV2.CaveViewer( 'model', {
    home: '/CaveView/',               // where js/workers, css, images and lib are served from
    surveyDirectory: '/surveys/',
    language: 'en'                    // or 'ro'; any other code is fetched as lib/lang-<code>.json
  } );
  viewer.loadCave( 'my-cave.3d' );
  viewer.addEventListener( 'newCave', () => { /* the model is ready: use the API below */ } );
</script>
```

Two habits keep a host simple. **Wait for `newCave`** before calling anything that names a station
— most of the fork's calls accept a station that is not loaded yet and resolve it when it is, but
the camera calls do not. And **name stations by their full dotted path** (`cave.series.3`), or by
an array of its parts (`[ 'cave', 'series', '3' ]`), which is the reliable form when a name contains
a dot of its own.

## Versions

A build reports its version in `CV2.VERSION` and on the viewer's help page. Features are listed
here as they are on the `silexgis` branch; the version a page needs is the one it loads.
