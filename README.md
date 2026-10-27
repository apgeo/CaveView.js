# CaveView.js — the SilexGIS fork

Web native 3d cave survey viewer.

This is a fork of [aardgoose/CaveView.js](https://github.com/aardgoose/CaveView.js), the viewer
for Survex `.3d`, Therion `.lox` and Compass `.plt` surveys. It adds what an application needs to
build on the viewer rather than only show a model in it: an API to drive the camera and to draw
on the model, people moving through a cave live or in a replay, pictures attached to stations, a
toolbar, layouts that work on a phone, and a way to render the view into a movie. Everything the
original viewer does, it still does; its documentation at
<https://aardgoose.github.io/CaveView.js/> applies unchanged.

The fork exists for [SilexGIS](https://github.com/apgeo/silexgis), a web GIS for cave and karst
data, and for the cave pages of the Silex caving club's website, which show trips recorded in
SilexGIS on a 3D model of the cave.

## Seen in use

- **<https://speosilex.ro/grind-2026-jurnal/>** — the journal of the club's 2026 expedition to
  Avenul de sub Vârful Grind. The model of the cave sits beside the day-by-day account: the places
  named in the text fly the camera there, the photographs of a station show when it is hovered,
  and the trips of the expedition can be replayed — each caver a marker moving through the survey
  along the passages they took, with a clock, a scrubber and a choice of whom to follow.
- **<https://speosilex.ro/grind-explo-2026-romanian-expedition/>** — an English-language account of
  the same expedition, built the same way.

Both pages are fed from data **exported from SilexGIS**: the trips, the reports of where each caver
was and when, and the pictures, as the club's SilexGIS installation publishes them, written out as
a file the website serves itself. The pages draw them with the API this fork adds —
`focusStation()`, `setStationMedia()`, `addLiveMarker()` / `moveLiveMarker()`, `addTrail()` and
`setTrailProgress()` — and with its toolbar. How they are put together is in
[fork-docs/examples.md](fork-docs/examples.md).

## What the fork adds

The documentation is in **[fork-docs/](fork-docs/README.md)**, one page per area with examples.
Every method, property, event and option is also described in the API reference,
`docs/reference.html` (open it from a checkout in a browser).

| area | what | details |
|---|---|---|
| **Navigation** | fly to a station or a survey section by name, highlight a station, a `stationHover` event | [navigation.md](fork-docs/navigation.md) |
| **Station pictures** | images held for a station, shown as a strip over the model on hover or focus; a camera marker on every station that has pictures; load failures reported | [station-pictures.md](fork-docs/station-pictures.md) |
| **Live markers** | labelled markers an application adds, moves (animated, over a set duration) and removes; collapsed per station under a label the application chooses; label plates readable over any background; the accented letters of European names | [live-markers-and-trails.md](fork-docs/live-markers-and-trails.md) |
| **Trails** | the way somebody went, routed along the survey's own legs rather than as straight lines, drawn up to a fraction of its length for replays | [live-markers-and-trails.md](fork-docs/live-markers-and-trails.md) |
| **Toolbar** | `CV2.CaveViewToolbar`: a bar of viewer controls over the model or beside it, its buttons chosen by the host | [toolbar-and-layout.md](fork-docs/toolbar-and-layout.md) |
| **Layout and devices** | size classes for the container (`cv-size-*`, `cv-mobile`), dials and labels scaled to the viewer's size, touch parity (a tap reveals what a hover does), larger targets under a finger, a host-chosen fullscreen element, reduced motion honoured | [toolbar-and-layout.md](fork-docs/toolbar-and-layout.md) |
| **Comparing surveys** | several files in one viewer, each with a label and a colour; sections hidden and shown; their extent and colour asked for; the viewpoint of one viewer given to another | [comparing-surveys.md](fork-docs/comparing-surveys.md) |
| **Capture** | a session that draws the view frame by frame at a size given in pixels, for recording a movie of the model | [capture.md](fork-docs/capture.md) |
| **Host integration** | a coordinate-system lookup supplied by the host instead of a public web service, a Romanian interface catalogue, clean disposal, keys typed into the host page left to the page | [host-integration.md](fork-docs/host-integration.md) |
| **Fixes** | the dispose handler's typo, calls after dispose, workers ended before they report back, `loadCaves` through the interface, a hidden container being resized, the line shader on three.js r183 (on its own branch, offered to upstream) | [host-integration.md](fork-docs/host-integration.md) |

## Branches and versions

- **`silexgis`** — the distribution branch, and the only one bundles are built from. It is based
  on the upstream **2.9.0 release tag** and carries every change listed above. Its version is
  stamped `2.9.0-slx.<n>` in `package.json` and `src/js/core/constants.js`, and a build is never
  replaced under the same number: a change is a new number.
- **`dev`** — a mirror of upstream's `dev`, only ever fast-forwarded.
- **`feature/*`** — one branch per change, based on upstream `dev` and written so that upstream
  could take it as it stands; each is cherry-picked onto `silexgis`.

## Building and testing

```
npm ci
npm run build     # build/CaveView/js/CaveView2.min.js, its workers, css and images
npm run lint
npm test          # test/smoke.mjs: the built bundle driven through its API in headless Chromium
```

The smoke test needs Playwright, which this repository does not carry; `test/README.md` says where
it is taken from and what each assertion proves. The interface catalogues in
`build/CaveView/lib/lang-*.json` are tracked files the build does not write, and the stylesheet is
kept by hand in `src/css/caveview.scss` and its two compiled copies.

## Licence

MIT, as upstream — see [LICENSE](LICENSE). The viewer is the work of aardgoose and its
contributors; this fork's changes are published under the same licence.
