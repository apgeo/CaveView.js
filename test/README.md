# Smoke test

`npm test` runs `test/smoke.mjs`: a check of the built bundle in a real browser, driving
the viewer's public API through what a host application does and asserting counts and
verdicts only.

What it does:

- serves `build/` on `127.0.0.1` (a port of its own, chosen at random), with
  `docs/surveys/` at `/surveys/`, and blocks every request to anywhere else;
- loads the UMD bundle (`build/CaveView/js/CaveView2.min.js`) in headless Chromium and
  loads `docs/surveys/titan.3d`;
- asserts that `newSurvey` and `newCave` fire and stations are counted, that the help page
  names the version, that `focusStation()` on a station resolved from the tree moves the
  camera target, that a live marker can be added, moved, framed and removed, that a trail
  along two connected stations has a length, that a station media image which 404s is
  reported by `mediaError` and its thumbnail removed, that a capture returns a frame of the
  requested size, that a key pressed with the pointer over the model drives the viewer while
  keys typed into an input do not, that the `fullscreenElement` option is reported by the
  getter, and that `renderView()` and the other entry points do not throw after `dispose()`.

Before running it, build: `npm run build`. The test does not build. `SMOKE_BUILD_DIR` names
another directory laid out like `build/` to test instead - a vendored copy, say - which is
also how to see that the assertions fail against a bundle without the behaviour they check.

Playwright is **not** a dependency of this package. It is resolved from another
installation, named by the `PLAYWRIGHT_NODE_MODULES` environment variable, whose default is
`/home/devuser1/projects/silexgis/silexgis/client/node_modules`. That installation must
have its Chromium downloaded (`npx playwright install chromium` there). To use another:

    PLAYWRIGHT_NODE_MODULES=/path/to/node_modules npm test

Rendering is expected to be software (SwiftShader), so the waits are generous: each is
bounded by `SMOKE_TIMEOUT` milliseconds (default 120000). A run takes well under a minute
on a machine with no GPU.

The output is one line per assertion (`ok` or `FAIL`), then a summary line with the counts
and the time taken. The exit code is 0 when every assertion passed, 1 when any failed, and
2 when the test could not run at all (no bundle, or no Playwright).
