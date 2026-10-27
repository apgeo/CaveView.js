# Capture: rendering the view into frames

An application that records the viewer — a movie of a replay, a turntable of the model — needs
every frame to show what its place in the movie says, not whatever the browser happened to be doing
when it was drawn. A capture session hands it that control.

```js
const { width, height } = viewer.beginCapture( { width: 1280, height: 720, background: '#000' } );

for ( let i = 0; i < frames; i++ ) {
  const frame = viewer.captureFrame( {
    azimuth: startAzimuth + i * step,   // radians; leave out to keep the direction
    polar: Math.PI / 3,
    advance: 1000 / 30,                 // milliseconds the live markers move on by
    into: context2d                     // optional: the frame is drawn into this 2D context too
  } );
  encoder.add( frame.canvas );          // frame.moving: a marker is still between stations
}

viewer.endCapture();
```

While a session is open nothing is drawn except by `captureFrame()`; the pointer and keyboard move
nothing, an automatic rotation is suspended, and live markers move only by the milliseconds each
frame advances them — a 600 ms move is half-way after 300 ms of advancing, however long the encoding
took. Frames are drawn at the size asked for, as a screen of that density would draw the container:
size the container to the frame's shape before beginning (640 × 360 for 1280 × 720). Ending the
session puts back the size, pixel ratio, colours, controls, rotation and marker clock. The same state
gives the same pixels.

`viewer.capturing` says whether a session is open. `viewer.getCameraAngles()` and
`viewer.setCameraAngles( { azimuth, polar } )` read and turn the camera at once, without
animation, which is how a recording starts from the view the reader left.
