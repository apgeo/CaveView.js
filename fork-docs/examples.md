# Seen in use: the club's expedition pages, fed from SilexGIS

Two public pages of the Silex caving club (Brașov, Romania) are built on this fork:

- <https://speosilex.ro/grind-2026-jurnal/> — the journal of the 2026 expedition to Avenul de sub
  Vârful Grind;
- <https://speosilex.ro/grind-explo-2026-romanian-expedition/> — an English-language account of the
  same expedition.

They show what the fork's API is for. Each is an ordinary WordPress article with a 3D model of the
cave beside the text, and everything on the model that changes — who went where, when, and what they
photographed — comes from **SilexGIS**, where the expedition's trips were recorded.

## Where the data comes from

During and after the expedition each trip was recorded in the club's SilexGIS installation: who was
in the party, and reports of where each of them was and when, by survey station or by depth, as word
came out of the cave. A trip the club chose to publish is readable without an account through a
short list of public routes: the trips of the cave being followed, the finished ones, and each
finished trip's track.

The pages read those routes in one of two ways:

- **an export file** — a small tool writes everything the page shows of finished trips (the list,
  each trip's track, the photographs and scanned maps they point at) into one directory the website
  serves itself, so the article keeps working whatever happens to the installation later;
- **live, through the website's own proxy** — for a party underground now, or a trip finished since
  the file was written. The proxy holds the share links on the server, so a link never appears in
  the page.

A page can use the file alone, or the file first and the installation for anything newer. The
data is exactly what the public routes answer: the same names, positions and withholding the
installation applies, decided in one place.

## How the pages use the viewer

The model is a Therion `.lox` survey of the cave. A configuration for each page — written as data,
not code — names the survey, the places to offer, and the photographs by station. On top of the
viewer a small component of the club's site does the rest, through the fork's API:

| on the page | fork API |
|---|---|
| a list of places beside the model, and place names in the article's text, fly the camera there | `focusStation()` with `popup`, `highlightStation()` — [navigation.md](navigation.md) |
| photographs of a station appear when it is hovered or tapped, and open in the page's lightbox | `setStationMedia()`, `mediaOpen` — [station-pictures.md](station-pictures.md) |
| each caver of a trip is a coloured, labelled marker; a team standing together is one marker labelled with the team's name and its members | `addLiveMarker()`, `setLiveMarkerClusterLabel()` — [live-markers-and-trails.md](live-markers-and-trails.md) |
| a finished trip is replayed with a clock, a scrubber and play/step buttons; markers move station to station, and each person's route is drawn along the passages as the clock runs | `moveLiveMarker()` with `duration`, `addTrail()`, `setTrailProgress()` |
| "follow" a person or a team: only they are drawn on the model, the others stay listed beside it | `addLiveMarker()`, `removeLiveMarker()` |
| a toolbar over the model (views, shading, labels, rotation, fullscreen), a layout that works on a phone, readable labels | `CV2.CaveViewToolbar`, size classes, touch, `stationLabelScale` — [toolbar-and-layout.md](toolbar-and-layout.md) |
| the viewer's own controls in Romanian | `language: 'ro'` — [host-integration.md](host-integration.md) |

Where each person was at a given instant is not worked out by the page itself: it uses the same
code SilexGIS uses for its own replay, built as a separate script, so the two can never disagree
about who may be drawn and where.

## Doing the same for another cave

What a page needs is a survey file the viewer reads, the stations its places and pictures are at,
and — for trips — a log of reports naming those stations with times. SilexGIS produces the last;
any other source that can say "this person, this station, this time" works the same way with the
calls in [live-markers-and-trails.md](live-markers-and-trails.md).
