import type { CSSProperties, ReactNode } from "react";

export type RayfieldSourceMode = "procedural" | "texture" | "noise";

export interface RayfieldConfig {
  background: { color: string };
  source: {
    mode: RayfieldSourceMode;
    threshold: number;
    softness: number;
    invert: boolean;
    mix: number;
    scale: number;
    rotation: number;
    offsetX: number;
    offsetY: number;
    hover: boolean;
    hoverActive: boolean;
    hoverStrength: number;
  };
  vignette: {
    color: string;
    radius: number;
    falloff: number;
    displace: number;
    mix: number;
    angle: number;
    skew: number;
  };
  sine: {
    frequency: number;
    amplitude: number;
    falloff: number;
    rotation: number;
    phase: number;
    speed: number;
    mixRadius: number;
    trackMouse: boolean;
  };
  shatter: {
    scale: number;
    amount: number;
    angle: number;
    radius: number;
    skew: number;
    mixRadius: number;
    mixRadiusInvert: boolean;
  };
  bokeh: {
    radius: number;
    tilt: number;
    mixRadius: number;
    trackMouse: boolean;
  };
  output: { color: string };
  useVignette: boolean;
  useSine: boolean;
  useShatter: boolean;
  useBokeh: boolean;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface RayfieldRendererOptions {
  config?: DeepPartial<RayfieldConfig>;
  pixelRatio?: number;
  autoStart?: boolean;
  reducedMotion?: boolean;
}

export interface RayfieldHandle {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: import("./renderer.js").RayfieldRenderer;
  resize(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  setSource(source: TexImageSource | null): void;
}

export interface SeamRayfieldProps {
  className?: string;
  style?: CSSProperties;
  config?: DeepPartial<RayfieldConfig>;
  paused?: boolean;
  source?: TexImageSource | null;
  pixelRatio?: number;
  ariaLabel?: string;
  fallback?: ReactNode;
  onReady?: (handle: RayfieldHandle) => void;
  onError?: (error: Error) => void;
}
