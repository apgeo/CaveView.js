# Toolbar, layout and devices

## The toolbar

Upstream puts the viewer's settings in a side panel. The fork adds a bar of controls a host places
over the model or beside it:

```js
const bar = new CV2.CaveViewToolbar( viewer, 'model', {
  placement: 'top',                   // or 'bottom'
  buttons: [ 'viewPlan', 'viewNorth', 'viewEast', 'shadingMode', 'stationLabels',
             'entrances', 'autoRotate', 'fullscreen' ]
} );
// later
bar.dispose();
```

The available buttons are `stations`, `stationLabels`, `stationComments`, `splays`, `walls`,
`scraps`, `entrances`, `boundingBox`, `viewNorth`, `viewEast`, `viewSouth`, `viewWest`, `viewPlan`,
`cameraOrthographic`, `cameraPerspective`, `shadingMode` (a chooser), `autoRotate` and `fullscreen`.
Each reflects the viewer's state, whoever changed it, and is titled — for the tooltip and for a
screen reader — from the `toolbar` section of the interface's catalogue (the button's name is the
key); a catalogue without the entry leaves the property's name as the title. A bar built before the
catalogue of the reader's language arrives is titled again when it does, so a host need not wait for
the catalogue before building it. Its look is CSS custom properties
(`--cv-toolbar-button-size`, `--cv-toolbar-background`, `--cv-toolbar-active-background` …).

On a narrow viewer the bar would cover too much of the model: `strip: <element or id>` lays it out
in an element beside the viewer instead, while the viewer is not of the large size.

## Size classes and phones

The viewer classifies its container — not the screen — as `large`, `medium` or `small`
(narrower than 1000 and 600 pixels by default; the `sizeClasses` configuration option changes the
widths). `viewer.sizeClass` reports it, `viewer.mobile` says whether the device is a phone-sized
one, and the container carries the classes `cv-size-large|medium|small` and `cv-mobile`, so a host's
stylesheet can follow. On smaller viewers the compass and inclination dials are drawn smaller
(`hudScale`), and on a phone the side panel's close tab stays in reach.

## Touch

- a tap does what a hover does: it shows a station's name and pictures, and a marker's sublabel;
- hover events say which kind of pointer caused them (`pointerType`: `mouse`, `touch`, `pen`);
- targets are larger under a finger (44 px), and the toolbar's buttons grow with them;
- one finger still turns the model and two still zoom and pan: a tap is told from a drag by distance
  and time, and nothing the browser does by default is prevented.
- a station under a finger or a pen is selected — and the `station` event dispatched — when the contact
  ends as a tap, not as it begins, so turning the model from a station selects nothing; a mouse selects
  as it is pressed. `CV2.STATION_SELECTED_ON_TAP` says a build does this.

## Labels

`viewer.stationLabelScale` (or the configuration option of the same name) writes station names and
comments smaller or larger than the theme's size: a survey dense with stations names every one by
its whole path, and at full size the names cover the legs.

## Fullscreen

```js
new CV2.CaveViewer( 'model', { fullscreenElement: 'article-with-model' } );
```

The element put into fullscreen defaults to the container; a host with controls of its own around
the viewer names an element enclosing both. Where the browser refuses fullscreen — in a frame that
is not allowed it, or a phone's browser that gives fullscreen to videos alone — the element covers
the window by its `toggle-fullscreen` class instead, and the button undoes it again.

The viewer's stylesheet fixes an element with that class to the whole window at every width, with
every declaration `!important`, so a host's own sizing of the container does not hold it back. It
is stacked at `z-index: var(--cv-fullscreen-z-index, 2147483000)`: set the custom property on the
element to keep something of the page above the viewer.

A fixed element is held by some of its ancestors, whatever its own style says: an ancestor with a
`transform` (an article left with an identity transform by an entrance animation is the common
case), a `filter`, a `perspective`, a `contain`, a `will-change` of those becomes the box it is
placed in, and an ancestor that starts a stacking context of its own keeps it under whatever the
page stacks above that ancestor, a fixed header among them. While the class alone is covering the
window, an element with such an ancestor is therefore moved to the end of the document's body, a
placeholder comment keeping its place, and put back where it was when it stops covering, when the
browser's own fullscreen takes over, or when the viewer is disposed. The element is the same
element throughout — its listeners, its observers and the model are kept — but for that time it is
not a descendant of its usual ancestors. A host that styles it through them, or finds it through
its parent, should keep such styles off its ancestors instead (no transform left over from an
animation, say): an element with no holding ancestor is never moved.

## Reduced motion

When the reader has asked their system for reduced motion (`prefers-reduced-motion: reduce`),
camera moves — a focus, a change of view, framing the markers — jump to their end instead of being
animated, the same events still fire, and an automatic rotation is not started. `viewer.reducedMotion`
reports it, and `focusStation( ref, { animate: true } )` animates anyway where a host has a reason to.
