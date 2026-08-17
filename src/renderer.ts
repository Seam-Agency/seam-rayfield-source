import backgroundTextureUrl from "./assets/orange-gradient-CGeZ4tof.png";
import blueNoiseTextureUrl from "./assets/LDR_RG01_0-Cx9G0smZ.png";
import { applyRayfieldConfig, createRayfieldConfig, defaultRayfieldConfig } from "./config.js";
import {
  bokehFragmentShader,
  outputFragmentShader,
  shatterFragmentShader,
  sineFragmentShader,
  vertexShader,
  vignetteFragmentShader,
} from "./shaders.js";
import type { DeepPartial, RayfieldConfig, RayfieldRendererOptions } from "./types.js";

type Uniform = WebGLUniformLocation | null;

interface ProgramState {
  program: WebGLProgram;
  uniforms: Map<string, Uniform>;
}

interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

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

function createProgram(gl: WebGL2RenderingContext, fragmentSource: string): ProgramState {
  const program = gl.createProgram();
  if (!program) throw new Error("Rayfield could not allocate a WebGL program.");
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
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
  return { program, uniforms: new Map() };
}

function createTexture(
  gl: WebGL2RenderingContext,
  wrap: number = gl.CLAMP_TO_EDGE,
  data: Uint8Array = new Uint8Array([255, 255, 255, 255]),
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Rayfield could not allocate a WebGL texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function createTarget(gl: WebGL2RenderingContext): RenderTarget {
  const texture = createTexture(gl);
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) {
    gl.deleteTexture(texture);
    throw new Error("Rayfield could not allocate a WebGL framebuffer.");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture, width: 1, height: 1 };
}

function resizeTarget(gl: WebGL2RenderingContext, target: RenderTarget, width: number, height: number): void {
  if (target.width === width && target.height === height) return;
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
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

  private readonly programs: Record<"vignette" | "sine" | "shatter" | "bokeh" | "output", ProgramState>;
  private readonly vao: WebGLVertexArrayObject;
  private readonly sourceTexture: WebGLTexture;
  private readonly backgroundTexture: WebGLTexture;
  private readonly blueNoiseTexture: WebGLTexture;
  private readonly targets: [RenderTarget, RenderTarget];
  private readonly pixelRatio: number;
  private readonly reducedMotion: boolean;
  private readonly assetImages: HTMLImageElement[] = [];
  private frame = 0;
  private startedAt = performance.now();
  private elapsedBeforePause = 0;
  private destroyed = false;
  private paused = false;
  private backgroundLoaded = false;
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
    this.programs = {
      vignette: createProgram(gl, vignetteFragmentShader),
      sine: createProgram(gl, sineFragmentShader),
      shatter: createProgram(gl, shatterFragmentShader),
      bokeh: createProgram(gl, bokehFragmentShader),
      output: createProgram(gl, outputFragmentShader),
    };
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Rayfield could not allocate a WebGL vertex array.");
    this.vao = vao;
    this.sourceTexture = createTexture(gl);
    this.backgroundTexture = createTexture(gl, gl.REPEAT);
    this.blueNoiseTexture = createTexture(gl, gl.REPEAT, new Uint8Array([128, 128, 128, 255]));
    this.targets = [createTarget(gl), createTarget(gl)];
    this.config = createRayfieldConfig(options.config);
    // The source renderer deliberately runs at half resolution. Keeping that
    // default preserves its soft edges and avoids changing the bokeh footprint.
    this.pixelRatio = Math.max(0.25, Math.min(options.pixelRatio ?? 0.5, 2));
    this.reducedMotion = options.reducedMotion ?? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.loadTexture(backgroundTextureUrl, this.backgroundTexture, () => {
      this.backgroundLoaded = true;
    });
    this.loadTexture(blueNoiseTextureUrl, this.blueNoiseTexture);

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
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (this.paused || this.reducedMotion) this.draw(this.elapsedBeforePause / 1000);
  }

  clearSourceTexture(): void {
    this.source = null;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  resize(): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * this.pixelRatio));
    const height = Math.max(1, Math.round(rect.height * this.pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      resizeTarget(this.gl, this.targets[0], width, height);
      resizeTarget(this.gl, this.targets[1], width, height);
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
    this.assetImages.forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
    this.gl.deleteTexture(this.sourceTexture);
    this.gl.deleteTexture(this.backgroundTexture);
    this.gl.deleteTexture(this.blueNoiseTexture);
    this.targets.forEach((target) => {
      this.gl.deleteTexture(target.texture);
      this.gl.deleteFramebuffer(target.framebuffer);
    });
    Object.values(this.programs).forEach(({ program }) => this.gl.deleteProgram(program));
    this.gl.deleteVertexArray(this.vao);
  }

  private location(state: ProgramState, name: string): Uniform {
    if (!state.uniforms.has(name)) state.uniforms.set(name, this.gl.getUniformLocation(state.program, name));
    return state.uniforms.get(name) ?? null;
  }

  private use(state: ProgramState): void {
    this.gl.useProgram(state.program);
    this.gl.bindVertexArray(this.vao);
  }

  private set1(state: ProgramState, name: string, value: number): void {
    this.gl.uniform1f(this.location(state, name), value);
  }

  private setInt(state: ProgramState, name: string, value: number): void {
    this.gl.uniform1i(this.location(state, name), value);
  }

  private set2(state: ProgramState, name: string, x: number, y: number): void {
    this.gl.uniform2f(this.location(state, name), x, y);
  }

  private set3(state: ProgramState, name: string, value: string): void {
    this.gl.uniform3fv(this.location(state, name), hexToRgb(value));
  }

  private bindTexture(state: ProgramState, name: string, texture: WebGLTexture, unit: number): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.setInt(state, name, unit);
  }

  private beginTarget(target: RenderTarget): void {
    const clear = hexToRgb(this.config.output.color);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer);
    this.gl.viewport(0, 0, target.width, target.height);
    this.gl.clearColor(clear[0], clear[1], clear[2], 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private draw(time: number): void {
    if (this.destroyed) return;
    const gl = this.gl;
    const c = this.config;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (!width || !height) return;

    this.currPointer[0] += (this.pointer[0] - this.currPointer[0]) * 0.1;
    this.currPointer[1] += (this.pointer[1] - this.currPointer[1]) * 0.1;
    const nativeTime = time * 2;

    let read = this.targets[0];
    let write = this.targets[1];
    this.beginTarget(read);

    if (c.useVignette) {
      const state = this.programs.vignette;
      this.use(state);
      this.bindTexture(state, "tSourceTexture", this.sourceTexture, 0);
      this.set2(state, "uResolution", width, height);
      this.set1(state, "uRadius", c.vignette.radius);
      this.set1(state, "uFalloff", c.vignette.falloff);
      this.set1(state, "uMix", c.vignette.mix);
      this.set1(state, "uDisplace", c.vignette.displace);
      this.set1(state, "uSkew", c.vignette.skew);
      this.set1(state, "uAngle", c.vignette.angle);
      this.set3(state, "uVignetteColor", c.vignette.color);
      this.set2(state, "uPos", this.currPointer[0], this.currPointer[1]);
      this.set3(state, "uClearColor", c.background.color);
      this.setInt(state, "uSourceMode", c.source.mode === "texture" ? 1 : c.source.mode === "noise" ? 2 : 0);
      this.set1(state, "uSourceThreshold", c.source.threshold);
      this.set1(state, "uSourceSoftness", c.source.softness);
      this.set1(state, "uSourceInvert", bool(c.source.invert));
      this.set1(state, "uSourceMix", c.source.mix);
      this.set1(state, "uSourceScale", c.source.scale);
      this.set1(state, "uSourceRotation", c.source.rotation);
      this.set2(state, "uSourceOffset", c.source.offsetX, c.source.offsetY);
      this.set2(state, "uSourcePointer", this.currPointer[0], this.currPointer[1]);
      this.set1(state, "uSourceHover", bool(c.source.hover && c.source.hoverActive));
      this.set1(state, "uSourceHoverStrength", c.source.hoverStrength);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const swap = (): void => {
      const previous = read;
      read = write;
      write = previous;
    };

    if (c.useSine) {
      this.beginTarget(write);
      const state = this.programs.sine;
      this.use(state);
      this.bindTexture(state, "tInput", read.texture, 0);
      this.set2(state, "uResolution", width, height);
      this.set1(state, "uTime", nativeTime);
      this.set2(state, "uPos", 0.5, 0.5);
      this.set1(state, "uFrequency", c.sine.frequency);
      this.set1(state, "uAmplitude", c.sine.amplitude);
      this.set1(state, "uRotation", c.sine.rotation);
      this.set1(state, "uMixRadius", c.sine.mixRadius);
      this.set2(state, "uMousePos", this.currPointer[0], this.currPointer[1]);
      this.set1(state, "uTrackMouse", bool(c.sine.trackMouse));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      swap();
    }

    if (c.useShatter) {
      this.beginTarget(write);
      const state = this.programs.shatter;
      this.use(state);
      this.bindTexture(state, "tInput", read.texture, 0);
      this.set2(state, "uResolution", width, height);
      this.set1(state, "uTime", nativeTime);
      this.set2(state, "uPos", 0.5, 0.5);
      this.set1(state, "uAmount", c.shatter.scale);
      this.set1(state, "uSpread", c.shatter.amount);
      this.set1(state, "uAngle", c.shatter.angle / 360);
      this.set1(state, "uSkew", c.shatter.skew);
      this.set1(state, "uMixRadius", c.shatter.mixRadius || 1);
      this.set2(state, "uMousePos", this.currPointer[0], this.currPointer[1]);
      this.set1(state, "uTrackMouse", 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      swap();
    }

    if (c.useBokeh) {
      this.beginTarget(write);
      const state = this.programs.bokeh;
      this.use(state);
      this.bindTexture(state, "tInput", read.texture, 0);
      this.bindTexture(state, "tBlueNoise", this.blueNoiseTexture, 1);
      this.set2(state, "uResolution", width, height);
      this.set2(state, "uBlueNoiseResolution", 256, 256);
      this.set1(state, "uAmount", c.bokeh.radius);
      this.set1(state, "uTilt", c.bokeh.tilt);
      this.set2(state, "uPos", 0.5, 0.5);
      this.set2(state, "uMousePos", this.currPointer[0], this.currPointer[1]);
      this.set1(state, "uTrackMouse", bool(c.bokeh.trackMouse));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      swap();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const background = hexToRgb(c.background.color);
    gl.clearColor(background[0], background[1], background[2], 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const output = this.programs.output;
    this.use(output);
    this.bindTexture(output, "tBgTexture", this.backgroundTexture, 0);
    this.bindTexture(output, "tInput", read.texture, 1);
    this.set3(output, "uOutputColor", c.output.color);
    this.set3(output, "uBgColor", c.background.color);
    this.setInt(output, "uLoaded", this.backgroundLoaded ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private loadTexture(url: string, texture: WebGLTexture, onLoaded?: () => void): void {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (this.destroyed) return;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      onLoaded?.();
      if (this.paused || this.reducedMotion) this.draw(this.elapsedBeforePause / 1000);
    };
    image.onerror = () => {
      if (this.paused || this.reducedMotion) this.draw(this.elapsedBeforePause / 1000);
    };
    this.assetImages.push(image);
    image.src = url;
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
