import { applyRayfieldConfig, createRayfieldConfig, defaultRayfieldConfig } from "./config.js";
import { fragmentShader, vertexShader } from "./shaders.js";
import type { DeepPartial, RayfieldConfig, RayfieldRendererOptions } from "./types.js";

type Uniform = WebGLUniformLocation | null;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Rayfield could not allocate a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compilation error.";
    gl.deleteShader(shader);
    throw new Error(`Rayfield shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Rayfield could not allocate a WebGL program.");
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(`Rayfield program link failed: ${message}`);
  }
  return program;
}

function hexToRgb(value: string): [number, number, number] {
  const clean = value.trim().replace(/^#/, "");
  const expanded = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const parsed = Number.parseInt(expanded.slice(0, 6), 16);
  if (!Number.isFinite(parsed)) return [1, 1, 1];
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
}

function bool(value: boolean): number {
  return value ? 1 : 0;
}

export class RayfieldRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly config: RayfieldConfig;
  readonly pointer: [number, number] = [0.5, 0.5];
  readonly currPointer: [number, number] = [0.5, 0.5];

  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly sourceTexture: WebGLTexture;
  private readonly uniforms = new Map<string, Uniform>();
  private readonly pixelRatio: number;
  private readonly reducedMotion: boolean;
  private frame = 0;
  private startedAt = performance.now();
  private elapsedBeforePause = 0;
  private destroyed = false;
  private paused = false;
  private source: TexImageSource | null = null;
  private resizeObserver?: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, options: RayfieldRendererOptions = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("Seam Rayfield requires WebGL 2.");
    this.gl = gl;
    this.program = createProgram(gl);
    const vao = gl.createVertexArray();
    const texture = gl.createTexture();
    if (!vao || !texture) throw new Error("Rayfield could not allocate WebGL resources.");
    this.vao = vao;
    this.sourceTexture = texture;
    this.config = createRayfieldConfig(options.config);
    this.pixelRatio = Math.max(0.5, Math.min(options.pixelRatio ?? window.devicePixelRatio ?? 1, 2));
    this.reducedMotion = options.reducedMotion ?? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.uniform1i(this.location("uSource"), 0);

    canvas.addEventListener("pointermove", this.onPointerMove, { passive: true });
    canvas.addEventListener("pointerenter", this.onPointerEnter, { passive: true });
    canvas.addEventListener("pointerleave", this.onPointerLeave, { passive: true });
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    this.resize();
    if (options.autoStart !== false) this.resume();
    else this.draw(0);
  }

  get stopped(): boolean {
    return this.paused;
  }

  set stopped(value: boolean) {
    if (value) this.pause();
    else this.resume();
  }

  setConfig(patch: DeepPartial<RayfieldConfig>): void {
    applyRayfieldConfig(this.config, patch);
    if (this.paused || this.reducedMotion) this.draw(this.elapsedBeforePause / 1000);
  }

  setColors(colors: { backgroundColor?: string; vignetteColor?: string; outputColor?: string }): void {
    if (colors.backgroundColor) this.config.background.color = colors.backgroundColor;
    if (colors.vignetteColor) this.config.vignette.color = colors.vignetteColor;
    if (colors.outputColor) this.config.output.color = colors.outputColor;
    if (this.paused || this.reducedMotion) this.draw(this.elapsedBeforePause / 1000);
  }

  setSourceCanvas(source: TexImageSource): void {
    this.source = source;
    this.refreshSourceTexture();
  }

  setSource(source: TexImageSource | null): void {
    if (!source) this.clearSourceTexture();
    else this.setSourceCanvas(source);
  }

  refreshSourceTexture(): void {
    if (!this.source || this.destroyed) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (this.paused || this.reducedMotion) this.draw(this.elapsedBeforePause / 1000);
  }

  clearSourceTexture(): void {
    this.source = null;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  }

  resize(): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * this.pixelRatio));
    const height = Math.max(1, Math.round(rect.height * this.pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
      if (this.paused || this.reducedMotion) this.draw(this.elapsedBeforePause / 1000);
    }
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.elapsedBeforePause += performance.now() - this.startedAt;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.draw(this.elapsedBeforePause / 1000);
  }

  resume(): void {
    if (this.destroyed) return;
    if (this.reducedMotion) {
      this.paused = true;
      this.draw(0);
      return;
    }
    if (!this.paused && this.frame) return;
    this.paused = false;
    this.startedAt = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  reset(): void {
    Object.assign(this.config, createRayfieldConfig(defaultRayfieldConfig));
    this.pointer[0] = this.currPointer[0] = 0.5;
    this.pointer[1] = this.currPointer[1] = 0.5;
    this.elapsedBeforePause = 0;
    this.startedAt = performance.now();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerenter", this.onPointerEnter);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.gl.deleteTexture(this.sourceTexture);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private location(name: string): Uniform {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  private set1(name: string, value: number): void {
    this.gl.uniform1f(this.location(name), value);
  }

  private set2(name: string, x: number, y: number): void {
    this.gl.uniform2f(this.location(name), x, y);
  }

  private set3(name: string, value: string): void {
    this.gl.uniform3fv(this.location(name), hexToRgb(value));
  }

  private draw(time: number): void {
    if (this.destroyed) return;
    const gl = this.gl;
    const c = this.config;
    this.currPointer[0] += (this.pointer[0] - this.currPointer[0]) * 0.075;
    this.currPointer[1] += (this.pointer[1] - this.currPointer[1]) * 0.075;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    this.set2("uResolution", this.canvas.width, this.canvas.height);
    this.set1("uTime", time);
    this.set2("uPointer", this.currPointer[0], this.currPointer[1]);
    this.set3("uBackground", c.background.color);
    this.set3("uShadow", c.vignette.color);
    this.set3("uLight", c.output.color);
    gl.uniform1i(this.location("uSourceMode"), c.source.mode === "texture" ? 1 : c.source.mode === "noise" ? 2 : 0);
    this.set1("uSourceThreshold", c.source.threshold);
    this.set1("uSourceSoftness", c.source.softness);
    this.set1("uSourceInvert", bool(c.source.invert));
    this.set1("uSourceMix", c.source.mix);
    this.set1("uSourceScale", c.source.scale);
    this.set1("uSourceRotation", c.source.rotation);
    this.set2("uSourceOffset", c.source.offsetX, c.source.offsetY);
    this.set1("uSourceHover", bool(c.source.hover && c.source.hoverActive));
    this.set1("uSourceHoverStrength", c.source.hoverStrength);
    this.set1("uVignetteRadius", c.vignette.radius);
    this.set1("uVignetteFalloff", c.vignette.falloff);
    this.set1("uVignetteDisplace", c.vignette.displace);
    this.set1("uVignetteMix", c.vignette.mix);
    this.set1("uVignetteAngle", c.vignette.angle);
    this.set1("uVignetteSkew", c.vignette.skew);
    this.set1("uWaveFrequency", c.sine.frequency);
    this.set1("uWaveAmplitude", c.sine.amplitude);
    this.set1("uWaveFalloff", c.sine.falloff);
    this.set1("uWaveRotation", c.sine.rotation);
    this.set1("uWavePhase", c.sine.phase);
    this.set1("uWaveSpeed", c.sine.speed);
    this.set1("uWaveMixRadius", c.sine.mixRadius);
    this.set1("uWaveTrackPointer", bool(c.sine.trackMouse));
    this.set1("uShatterScale", c.shatter.scale);
    this.set1("uShatterAmount", c.shatter.amount);
    this.set1("uShatterAngle", c.shatter.angle);
    this.set1("uShatterRadius", c.shatter.radius);
    this.set1("uShatterSkew", c.shatter.skew);
    this.set1("uShatterMixRadius", c.shatter.mixRadius);
    this.set1("uShatterInvert", bool(c.shatter.mixRadiusInvert));
    this.set1("uBokehRadius", c.bokeh.radius);
    this.set1("uBokehTilt", c.bokeh.tilt);
    this.set1("uBokehMixRadius", c.bokeh.mixRadius);
    this.set1("uBokehTrackPointer", bool(c.bokeh.trackMouse));
    this.set1("uUseVignette", bool(c.useVignette));
    this.set1("uUseWave", bool(c.useSine));
    this.set1("uUseShatter", bool(c.useShatter));
    this.set1("uUseBokeh", bool(c.useBokeh));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private tick = (now: number): void => {
    if (this.destroyed || this.paused) return;
    this.draw((this.elapsedBeforePause + now - this.startedAt) / 1000);
    this.frame = requestAnimationFrame(this.tick);
  };

  private onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer[0] = (event.clientX - rect.left) / rect.width;
    this.pointer[1] = 1 - (event.clientY - rect.top) / rect.height;
  };

  private onPointerEnter = (): void => {
    this.config.source.hoverActive = true;
  };

  private onPointerLeave = (): void => {
    this.config.source.hoverActive = false;
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.pause();
  };
}

export function createRayfieldRenderer(canvas: HTMLCanvasElement, options?: RayfieldRendererOptions): RayfieldRenderer {
  return new RayfieldRenderer(canvas, options);
}
