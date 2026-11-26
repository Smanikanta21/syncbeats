/**
 * The fluid solver: WebGL2 render-target plumbing around the shaders in
 * ./shaders.ts. No React in here on purpose — this file is a plain object with
 * `splat` / `step` / `resize` / `dispose`, so the component above it stays small
 * and this stays testable (see ./fluid.check.ts).
 *
 * Why raw WebGL2 and not three.js / @react-three/fiber, both of which the repo
 * already depends on: the room route currently imports neither, and pulling
 * three into the app's hottest route costs ~150KB gzipped for a scene graph this
 * never uses. A multi-pass ping-pong solver also has to fight r3f's render loop
 * for control of the bound framebuffer. The landing page's AmbientField stays on
 * r3f because it genuinely is one mesh with one material; this is not that.
 */

import {
  ADVECTION,
  CLEAR,
  CURL,
  DISPLAY,
  DIVERGENCE,
  GRADIENT_SUBTRACT,
  PRESSURE,
  SPLAT,
  VERT,
  VORTICITY,
} from "./shaders";
import type { Quality } from "./math";

// The maths lives in ./math.ts (a leaf module with no imports) so the self-check
// can run it under bare node. Re-exported here so callers have one import site.
export {
  QUALITY_FOR_TIER,
  QUALITY_LADDER,
  beatIndexAt,
  beatSplatPoint,
  hexToRgb01,
  nextLowerQuality,
  splatCoords,
} from "./math";
export type { Quality } from "./math";

// ── GL plumbing ───────────────────────────────────────────────────────────────

type FBO = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
};

type DoubleFBO = {
  read: FBO;
  write: FBO;
  swap: () => void;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`fluid: shader compile failed — ${log}`);
  }
  return shader;
}

/** A program plus a lazily-built uniform-location cache. */
function program(gl: WebGL2RenderingContext, fragSource: string, vert: WebGLShader) {
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSource);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error(`fluid: program link failed — ${log}`);
  }
  gl.deleteShader(frag);

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(prog, i)!.name;
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, uniforms };
}

export type FluidSim = {
  /** Shove the velocity field and stain the dye field at one point. */
  splat: (x: number, y: number, dx: number, dy: number, color: [number, number, number], radius?: number) => void;
  /** Advance the solver by `dt` seconds and composite to the canvas. */
  step: (dt: number, intensity: number) => void;
  /** Match the drawing buffer to a new CSS size. Cheap; safe to call per resize. */
  resize: (cssWidth: number, cssHeight: number, dpr: number) => void;
  /** Rebuild targets at a new quality, keeping the canvas size. */
  setQuality: (q: Quality) => void;
  quality: () => Quality;
  /** Fade everything to nothing without tearing the sim down. */
  fadeOut: (amount: number) => void;
  dispose: () => void;
};

/**
 * Build a solver on `canvas`, or return null if this device cannot render to a
 * float target. Callers must handle null — that is the no-WebGL fallback path,
 * not an error worth throwing over.
 */
export function createFluidSim(canvas: HTMLCanvasElement, initial: Quality): FluidSim | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    // The display pass writes straight alpha (a = peak dye channel). With
    // premultiplied alpha the browser would multiply it a second time and the
    // field would composite far too dark over the page.
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
    // Losing the field on a GPU switch is better than wedging the whole tab.
    failIfMajorPerformanceCaveat: false,
  });
  if (!gl) return null;

  // Rendering to RGBA16F needs this on WebGL2; without it every target below is
  // framebuffer-incomplete and nothing draws. Checked rather than assumed —
  // plenty of mobile GPUs expose WebGL2 without float render targets.
  if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) {
    return null;
  }
  // Linear filtering on half-float is core in WebGL2, but ask anyway: a few
  // drivers gate it, and without it advection reads nearest-neighbour and the
  // field looks pixel-quantised.
  gl.getExtension("OES_texture_float_linear");

  let quality: Quality = initial;

  // One fullscreen quad for every pass, uploaded once.
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const quadIdx = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const programs = {
    advection: program(gl, ADVECTION, vert),
    divergence: program(gl, DIVERGENCE, vert),
    curl: program(gl, CURL, vert),
    vorticity: program(gl, VORTICITY, vert),
    pressure: program(gl, PRESSURE, vert),
    gradient: program(gl, GRADIENT_SUBTRACT, vert),
    splat: program(gl, SPLAT, vert),
    clear: program(gl, CLEAR, vert),
    display: program(gl, DISPLAY, vert),
  };

  // Everything is RGBA16F, including the three scalar fields (pressure,
  // divergence, curl) that only need one channel. Supporting R16F/RG16F as well
  // would save ~400KB at 128x128 and add a whole format-availability matrix to
  // probe per device. Not worth it at this grid size.
  // ponytail: single texture format; add RG16F/R16F if memory ever shows up in a profile.
  function createFBO(w: number, h: number): FBO {
    gl!.activeTexture(gl!.TEXTURE0);
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA16F, w, h, 0, gl!.RGBA, gl!.HALF_FLOAT, null);

    const fbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, texture, 0);
    gl!.viewport(0, 0, w, h);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id: number) {
        gl!.activeTexture(gl!.TEXTURE0 + id);
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(w: number, h: number): DoubleFBO {
    const a = createFBO(w, h);
    const b = createFBO(w, h);
    return {
      read: a,
      write: b,
      width: w,
      height: h,
      texelSizeX: a.texelSizeX,
      texelSizeY: a.texelSizeY,
      swap() {
        const t = this.read;
        this.read = this.write;
        this.write = t;
      },
    };
  }

  function destroyFBO(f: FBO) {
    gl!.deleteTexture(f.texture);
    gl!.deleteFramebuffer(f.fbo);
  }

  let velocity: DoubleFBO;
  let dye: DoubleFBO;
  let divergence: FBO;
  let curl: FBO;
  let pressure: DoubleFBO;

  function allocate() {
    velocity = createDoubleFBO(quality.sim, quality.sim);
    pressure = createDoubleFBO(quality.sim, quality.sim);
    divergence = createFBO(quality.sim, quality.sim);
    curl = createFBO(quality.sim, quality.sim);
    dye = createDoubleFBO(quality.dye, quality.dye);
  }

  function release() {
    if (!velocity) return;
    [velocity, pressure, dye].forEach((d) => {
      destroyFBO(d.read);
      destroyFBO(d.write);
    });
    destroyFBO(divergence);
    destroyFBO(curl);
  }

  allocate();

  /** Draw the quad into `target` (or the canvas when null). */
  function blit(target: FBO | null) {
    if (target) {
      gl!.viewport(0, 0, target.width, target.height);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.fbo);
    } else {
      gl!.viewport(0, 0, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    }
    gl!.drawElements(gl!.TRIANGLES, 6, gl!.UNSIGNED_SHORT, 0);
  }

  // Solver constants. These are the numbers that decide whether it reads as
  // water or as smoke, and they are what to touch when tuning the LOOK — not the
  // quality ladder, which only decides how expensive it is.
  const VELOCITY_DISSIPATION = 0.22; // how fast motion dies down
  const DENSITY_DISSIPATION = 0.92; // how fast ink fades (dominates the mood)
  const PRESSURE_DECAY = 0.8; // residual pressure carried between frames
  // Named CURL_STRENGTH, not CURL: the shader string imported at the top of this
  // file is already called CURL, and a bare `const CURL` here shadows it inside
  // this closure — so the curl pass would be handed the number 24 as its source.
  const CURL_STRENGTH = 24; // vorticity confinement

  function splat(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: [number, number, number],
    radius = 0.0035,
  ) {
    const p = programs.splat;
    gl!.useProgram(p.prog);
    gl!.uniform1i(p.uniforms.uTarget!, velocity.read.attach(0));
    gl!.uniform1f(p.uniforms.aspectRatio!, gl!.drawingBufferWidth / gl!.drawingBufferHeight);
    gl!.uniform2f(p.uniforms.point!, x, y);
    gl!.uniform3f(p.uniforms.color!, dx, dy, 0);
    gl!.uniform1f(p.uniforms.radius!, radius);
    blit(velocity.write);
    velocity.swap();

    gl!.uniform1i(p.uniforms.uTarget!, dye.read.attach(0));
    gl!.uniform3f(p.uniforms.color!, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  function step(dt: number, intensity: number) {
    // A tab that was backgrounded hands back a multi-second dt. Advection is
    // unconditionally stable so it would not explode, but the field would jump
    // a long way in one frame, which reads as a glitch. Clamp to ~2 frames.
    const h = Math.min(dt, 0.033);

    gl!.disable(gl!.BLEND);

    // curl -> vorticity
    let p = programs.curl;
    gl!.useProgram(p.prog);
    gl!.uniform2f(p.uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
    gl!.uniform1i(p.uniforms.uVelocity!, velocity.read.attach(0));
    blit(curl);

    p = programs.vorticity;
    gl!.useProgram(p.prog);
    gl!.uniform2f(p.uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
    gl!.uniform1i(p.uniforms.uVelocity!, velocity.read.attach(0));
    gl!.uniform1i(p.uniforms.uCurl!, curl.attach(1));
    gl!.uniform1f(p.uniforms.curl!, CURL_STRENGTH);
    gl!.uniform1f(p.uniforms.dt!, h);
    blit(velocity.write);
    velocity.swap();

    // divergence
    p = programs.divergence;
    gl!.useProgram(p.prog);
    gl!.uniform2f(p.uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
    gl!.uniform1i(p.uniforms.uVelocity!, velocity.read.attach(0));
    blit(divergence);

    // bleed last frame's pressure rather than zeroing it — warm-starting the
    // solve is what lets 20 Jacobi iterations look like many more.
    p = programs.clear;
    gl!.useProgram(p.prog);
    gl!.uniform1i(p.uniforms.uTexture!, pressure.read.attach(0));
    gl!.uniform1f(p.uniforms.value!, PRESSURE_DECAY);
    blit(pressure.write);
    pressure.swap();

    p = programs.pressure;
    gl!.useProgram(p.prog);
    gl!.uniform2f(p.uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
    gl!.uniform1i(p.uniforms.uDivergence!, divergence.attach(0));
    for (let i = 0; i < quality.pressureIters; i++) {
      gl!.uniform1i(p.uniforms.uPressure!, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    p = programs.gradient;
    gl!.useProgram(p.prog);
    gl!.uniform2f(p.uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
    gl!.uniform1i(p.uniforms.uPressure!, pressure.read.attach(0));
    gl!.uniform1i(p.uniforms.uVelocity!, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    // advect velocity, then dye
    p = programs.advection;
    gl!.useProgram(p.prog);
    gl!.uniform2f(p.uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
    gl!.uniform1i(p.uniforms.uVelocity!, velocity.read.attach(0));
    gl!.uniform1i(p.uniforms.uSource!, velocity.read.attach(0));
    gl!.uniform1f(p.uniforms.dt!, h);
    gl!.uniform1f(p.uniforms.dissipation!, VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    gl!.uniform1i(p.uniforms.uVelocity!, velocity.read.attach(0));
    gl!.uniform1i(p.uniforms.uSource!, dye.read.attach(1));
    gl!.uniform1f(p.uniforms.dissipation!, DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();

    // composite
    p = programs.display;
    gl!.useProgram(p.prog);
    gl!.uniform1i(p.uniforms.uTexture!, dye.read.attach(0));
    gl!.uniform1f(p.uniforms.uIntensity!, intensity);
    gl!.uniform1f(p.uniforms.uVignette!, 1);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    blit(null);
  }

  function fadeOut(amount: number) {
    const p = programs.clear;
    gl!.useProgram(p.prog);
    gl!.uniform1i(p.uniforms.uTexture!, dye.read.attach(0));
    gl!.uniform1f(p.uniforms.value!, amount);
    blit(dye.write);
    dye.swap();
  }

  return {
    splat,
    step,
    fadeOut,
    quality: () => quality,
    resize(cssWidth, cssHeight, dpr) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      // The simulation grids are square and resolution-independent — only the
      // drawing buffer tracks the viewport, so a resize costs nothing and the
      // field is not reset. That is deliberate: reallocating here would wipe
      // the ink every time a mobile browser's URL bar slides away.
    },
    setQuality(q) {
      quality = q;
      release();
      allocate();
    },
    dispose() {
      release();
      gl.deleteBuffer(quad);
      gl.deleteBuffer(quadIdx);
      Object.values(programs).forEach(({ prog }) => gl.deleteProgram(prog));
      gl.deleteShader(vert);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
