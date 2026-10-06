# Smoke test

`npm test` runs `test/smoke.mjs`: a check of the built bundle in a real browser, driving
the viewer's public API through what a host application does and asserting counts and
verdicts only.

What it does:

- serves `build/` on `127.0.0.1` (a port of its own, chosen at random), with
  `docs/surveys/` at `/surveys/`, and blocks every request to anywhere else;
- loads the UMD bundle (`build/CaveView/js/CaveView2.min.js`) in headless Chromium, twice
  in the one browser, each time loading `docs/surveys/titan.3d` and building a toolbar in
  an element beside the viewer's container.

The first page is read by somebody with no preference about motion, in English, who is
allowed fullscreen. It asserts that:

- `newSurvey` and `newCave` fire and stations are counted, and the help page names the
  version;
- `focusStation()` on a station resolved from the tree moves the camera target, over
  several animation frames, and signals one `moved` event;
- a live marker can be added, moved, framed and removed, and `frameLiveMarkers()` signals
  its end again when called with the camera already where it left it;
- a `focusStation()` started in the same turn as such a framing is flown over several
  frames, and hears two `moved` events: the framing's, given before the flight begins,
  and its own;
- a trail along two connected stations has a length;
- a station media image which 404s is reported by `mediaError` and its thumbnail removed;
- a capture returns a frame of the requested size;
- a key pressed with the pointer over the model drives the viewer, while keys typed into
  an input, a textarea and an editable element of the host page reach those and not the
  viewer, and a key pressed in a chooser or a tick box of the host page is not cancelled;
- a key drives the viewer again after the toolbar's shading chooser was used with the
  mouse, and after a tick box of the side panel was, the focus still being on each;
- an arrow key is not cancelled and steps the control it is pressed in: the toolbar's
  chooser with the pointer back on the model, and a slider of the side panel with the
  pointer left on it;
- the toolbar's rotate button starts and stops an auto rotation and shows which;
- the `fullscreenElement` option is reported by the getter, the toolbar's button puts that
  element into fullscreen and takes it out again, and a request made while another
  element is in fullscreen leaves the page as it is;
- after a request that was refused (the element's `requestFullscreen` made to reject,
  once), a fullscreen the host obtains for the element takes over from the class, and
  leaving it leaves no class and `fullscreen` false;
- `fullscreen` set to true and to false in one turn, by a press, leaves no class, and the
  fullscreen the browser grants to the request is left again;
- a viewer disposed in the turn of its request, by a press, leaves no class and no
  fullscreen;
- `renderView()` and the other entry points do not throw after `dispose()`, and
  `getSnapshot()` throws an Error saying the viewer was disposed.

The second page is read by somebody who prefers reduced motion (Playwright's
`reducedMotion: 'reduce'`), in Romanian from `lib/lang-ro.json` - which the test holds
back until the toolbar has been built - and in a document the browser refuses fullscreen
to (a `Permissions-Policy` header). It asserts that:

- the catalogue is fetched with status 200, a header of the side panel is the catalogue's,
  and the help page's version line is written from the catalogue's own key;
- the toolbar's chooser, which listed the shading modes in English when it was built,
  lists every one by the catalogue's name once the catalogue has arrived;
- `reducedMotion` is true; `focusStation()` arrives within one animation frame and still
  signals one `moved` event; with `animate: true` it takes several frames all the same;
  the toolbar's rotate button starts no rotation and is not left pressed;
- `frameLiveMarkers()` dispatches no `moved` event during the call and one after it;
- `frameLiveMarkers( { margin: 0 } )` on two markers at one station leaves an
  orthographic camera a zoom that is a finite number;
- where fullscreen is refused, one press of the toolbar's button sets the class on the
  fullscreen element, `fullscreen` reads true and the button shows pressed; a second
  press takes the class off; and no rejection is left unhandled;
- there, `fullscreen` set to true and to false in one turn leaves no class, and a viewer
  disposed while its class is covering the page takes the class off;
- a viewer that was disposed raises no error when the next viewer on the page changes
  the language;
- a viewer disposed while its survey's coordinate system is being looked up (a
  `crsLookup` that answers after the dispose, for `docs/surveys/P8_Master.3d` renamed to
  a system the viewer has to ask about), and one disposed before its survey was fetched,
  both end with no alert, no unhandled rejection, no uncaught error and no `newCave`;
- the request for the survey of the second of those, held back on its way so that it is
  open at the dispose, is aborted and never completes;
- a toolbar built beside a viewer whose own container is the fullscreen element is taken
  into the container when a refused request leaves it covering the page, its button can
  be pressed there and uncovers the page, and the bar is then back where it was;
- that viewer, disposed in the turn of a request the browser goes on to refuse, leaves
  no class.

The last assertion is that neither page raised an uncaught error, left a rejection
unhandled or opened a dialog.

What it does not assert: anything about how the model is drawn, the touch gestures, the
terrain, or what a real change of the system's motion setting does while the viewer is
displayed - the preference is fixed for the life of each page.

Before running it, build: `npm run build`. The test does not build. `SMOKE_BUILD_DIR` names
another directory laid out like `build/` to test instead - a vendored copy, say - which is
also how to see that the assertions fail against a bundle without the behaviour they check.

Playwright is **not** a dependency of this package. It is resolved from another
installation, named by the `PLAYWRIGHT_NODE_MODULES` environment variable, whose default is
`/home/devuser1/projects/silexgis/silexgis/client/node_modules`. That installation must
have its Chromium downloaded (`npx playwright install chromium` there). To use another:

    PLAYWRIGHT_NODE_MODULES=/path/to/node_modules npm test

Rendering is expected to be software (SwiftShader), so the waits are generous: those for a
survey to load are bounded by `SMOKE_TIMEOUT` milliseconds (default 120000), and those for
a move or a change of fullscreen by times of their own of up to 30 seconds. A run takes
well under a minute on a machine with no GPU.

The output is one line per assertion (`ok` or `FAIL`), then a summary line with the counts
and the time taken. The summary counts the errors the browser's console held: the test
brings two kinds about itself - the image that is not there, and the browser's own report
of each fullscreen it refused - and any other is printed on a line of its own above the
summary. The exit code is 0 when every assertion passed, 1 when any failed, and 2 when
the test could not run at all (no bundle, no catalogue, or no Playwright).
