/**
 * Fluid simulation shaders.
 *
 * A Navier-Stokes solver on the GPU, in the standard ping-pong-framebuffer
 * arrangement: advect the velocity field through itself, add vorticity back
 * (a naive solver bleeds the small curls that make it look like water),
 * project the result to be divergence-free with a Jacobi pressure solve, then
 * advect the dye through the corrected velocity.
 *
 * Why this and not another layer of CSS blobs: the room's background is
 * supposed to BE the music. A noise texture scrolling under a blur can be made
 * pretty, but it has no momentum — a kick drum can brighten it and cannot
 * disturb it. Here the beat injects force and dye into a field that carries
 * them, so a bass hit blooms, gets dragged by whatever the last hit left
 * behind, and curls away. That history is the whole point.
 *
 * GLSL ES 1.00 on a WebGL2 context: WebGL2 accepts un-versioned ES 1.00 shaders
 * (so `varying` / `texture2D` / `gl_FragColor`), while still giving us the
 * RGBA16F render targets the solver needs. Using ES 3.00 would buy nothing here
 * and cost a second syntax to keep straight.
 *
 * Deliberately NOT ported from the reference implementation: bloom, sunrays, the
 * dithering pass and the runtime config GUI. The field sits behind a dense room
 * UI at low opacity; none of that would survive the composite.
 */

/**
 * Every pass is a fullscreen quad, and all four neighbour coordinates are
 * computed here rather than in each fragment shader. Doing it per-vertex means
 * four lookups the rasteriser interpolates for free, instead of four adds per
 * pixel in six different shaders.
 */
export const VERT = /* glsl */ `
  precision highp float;

  attribute vec2 aPosition;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  uniform vec2 texelSize;

  void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

/**
 * Semi-Lagrangian advection: step backwards along the velocity field and read
 * what was there. Unconditionally stable, which is what lets the sim survive a
 * dropped frame — the `dt` can spike without the field exploding.
 *
 * `dissipation` is applied as division by (1 + d*dt) rather than a multiply, so
 * the decay rate is in units of "per second" and stays frame-rate independent.
 */
export const ADVECTION = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;

  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 texelSize;
  uniform float dt;
  uniform float dissipation;

  void main () {
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt);
  }
`;

/**
 * Divergence of the velocity field — how much each cell is gaining or losing
 * fluid, which is exactly what the pressure solve has to cancel.
 *
 * The four edge clamps are free-slip boundaries: mirroring the normal component
 * at the frame edge stops fluid piling into the border and leaving a bright
 * static rim, which is the most obvious tell of a solver with no boundary
 * handling at all.
 */
export const DIVERGENCE = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  uniform sampler2D uVelocity;

  void main () {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;

    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }

    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
  }
`;

/** Curl (vorticity) of the velocity field — the rotation left in each cell. */
export const CURL = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  uniform sampler2D uVelocity;

  void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
  }
`;

/**
 * Vorticity confinement: push velocity back along the curl gradient to restore
 * the small eddies that numerical diffusion in the advection step eats. Without
 * it the field still flows, but it flows like smoke in syrup — everything
 * smooths out within a second or two and nothing swirls.
 */
export const VORTICITY = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float curl;
  uniform float dt;

  void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    // The epsilon is load-bearing: in still fluid 'force' is the zero vector and
    // normalising it would write NaN into the velocity field, which then
    // advects everywhere and kills the sim permanently.
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;

    vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt;
    gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
  }
`;

/**
 * One Jacobi iteration of the pressure Poisson equation. Run N times (see
 * QUALITY.pressureIters) — this is the single biggest cost knob in the solver
 * and the first thing the downgrade ladder cuts.
 */
export const PRESSURE = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;

  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float divergence = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
  }
`;

/** Subtract the pressure gradient, leaving a (nearly) divergence-free field. */
export const GRADIENT_SUBTRACT = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;

  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;

  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

/**
 * Additively stamp a gaussian blob of `color` at `point`. Used for both fields:
 * into velocity it is a shove, into dye it is ink.
 *
 * `aspectRatio` corrects x so the blob is round on a wide viewport instead of
 * stretched into a lozenge.
 */
export const SPLAT = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;

  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec3 color;
  uniform vec2 point;
  uniform float radius;

  void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
  }
`;

/** Scale a whole target. Used to bleed the pressure field between frames. */
export const CLEAR = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;

  uniform sampler2D uTexture;
  uniform float value;

  void main () {
    gl_FragColor = value * texture2D(uTexture, vUv);
  }
`;

/**
 * Composite the dye onto the page.
 *
 * Alpha is the dye's own peak channel, so bare water is transparent and the
 * room's background colour shows through untouched — the field tints the page
 * rather than replacing it. `uIntensity` is the single master dimmer the
 * component uses to fade the whole thing in and out (and to hold it faint while
 * playback is paused), and `uVignette` keeps ink off the extreme edges where the
 * room UI's own panels live.
 */
export const DISPLAY = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  varying vec2 vUv;

  uniform sampler2D uTexture;
  uniform float uIntensity;
  uniform float uVignette;

  void main () {
    vec3 raw = max(texture2D(uTexture, vUv).rgb, vec3(0.0));
    vec3 c = raw / (1.0 + raw * 0.7);
    float a = min(0.78, max(c.r, max(c.g, c.b)));

    vec2 d = vUv - 0.5;
    float vign = 1.0 - smoothstep(0.26, 0.72, length(d));
    vign = mix(1.0, vign, uVignette);

    gl_FragColor = vec4(c, a * uIntensity * vign);
  }
`;

/** Broad bass waves, rotating midrange currents, and short treble ripples. */
export const MUSIC_FLOW = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec3 uBands;
  uniform float uTime;
  uniform float uDt;
  uniform float uMotion;
  uniform float uIntensity;
  uniform float uAspect;
  void main () {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;
    // The centre wanders slowly, so the currents never form a fixed target.
    p -= vec2(sin(uTime * 0.19), cos(uTime * 0.16)) * 0.1;
    float r = max(length(p), 0.015);
    vec2 outward = p / r;
    vec2 tangent = vec2(-outward.y, outward.x);
    float angle = atan(p.y, p.x);
    float envelope = exp(-dot(p, p) * 3.0);
    float bass = sin(r * 9.0 - uTime * 1.7) * uBands.x * 220.0;
    float mids = (0.14 + uBands.y) * sin(uTime * 0.28 + r * 3.0) * 150.0;
    float ripples = sin(r * 54.0 - uTime * 7.0) * uBands.z * 28.0;
    // Angular variation survives incompressible pressure projection; a purely
    // radial gradient would be cancelled before it could move the dye.
    vec2 wave = outward * bass * (0.7 + 0.3 * sin(angle * 3.0 + uTime * 0.2)) + tangent * bass * 0.35;
    vec2 detail = (tangent + outward * 0.18 * sin(angle * 7.0)) * ripples;
    vec2 force = (wave + tangent * mids + detail) * envelope;
    force.x /= max(uAspect, 0.25);
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    gl_FragColor = vec4(velocity + force * uDt * uMotion * uIntensity, 0.0, 1.0);
  }
`;

/** Feed the entire flowing field softly, blending existing dye into new art. */
export const MUSIC_INK = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform vec3 uPaletteA;
  uniform vec3 uPaletteB;
  uniform vec3 uBands;
  uniform float uTime;
  uniform float uDt;
  uniform float uMotion;
  uniform float uIntensity;
  uniform float uAspect;
  void main () {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;
    vec3 source = texture2D(uSource, vUv).rgb;
    float blend = 0.5 + 0.32 * sin(p.x * 3.2 + sin(p.y * 3.0 - uTime * 0.15)
      + uTime * (0.06 + uBands.y * 0.08));
    vec3 color = mix(uPaletteA, uPaletteB, blend);
    float density = max(source.r, max(source.g, source.b));
    vec3 tinted = color * density / max(0.15, max(color.r, max(color.g, color.b)));
    source = mix(source, tinted, 1.0 - exp(-uDt * 0.55));
    float field = exp(-dot(p, p) * 1.55);
    float feed = 0.38 + dot(uBands, vec3(0.7, 0.5, 0.12));
    source += color * field * feed * uDt * uMotion * uIntensity;
    gl_FragColor = vec4(source, 1.0);
  }
`;
