import type { DeepPartial, RayfieldConfig } from "./types.js";

export const defaultRayfieldConfig: RayfieldConfig = {
  background: { color: "#dccfd0" },
  source: {
    mode: "procedural",
    threshold: 0.5,
    softness: 0.08,
    invert: false,
    mix: 1,
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    hover: true,
    hoverActive: false,
    hoverStrength: 0.045,
  },
  vignette: {
    color: "#4a0035",
    radius: 0.354,
    falloff: 1,
    displace: 0,
    mix: 1,
    angle: 0,
    skew: 0.54,
  },
  sine: {
    frequency: 0.35,
    amplitude: 1.18,
    falloff: 0.5,
    rotation: 0,
    phase: 0,
    speed: 0.1,
    mixRadius: 1,
    trackMouse: false,
  },
  shatter: {
    scale: 0.534,
    amount: 1,
    angle: 44,
    radius: 1,
    skew: 0.84,
    mixRadius: 1,
    mixRadiusInvert: false,
  },
  bokeh: {
    radius: 0.754,
    tilt: 0.5,
    mixRadius: 1,
    trackMouse: false,
  },
  output: { color: "#f4d9ca" },
  useVignette: true,
  useSine: true,
  useShatter: true,
  useBokeh: true,
};

function mergeObject<T extends Record<string, unknown>>(base: T, patch?: DeepPartial<T>): T {
  if (!patch) return structuredClone(base);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key as keyof T] = (
      current && value && typeof current === "object" && typeof value === "object" && !Array.isArray(value)
        ? mergeObject(current as Record<string, unknown>, value as DeepPartial<Record<string, unknown>>)
        : value
    ) as T[keyof T];
  }
  return result;
}

export function createRayfieldConfig(patch?: DeepPartial<RayfieldConfig>): RayfieldConfig {
  return mergeObject(defaultRayfieldConfig as unknown as Record<string, unknown>, patch as DeepPartial<Record<string, unknown>>) as unknown as RayfieldConfig;
}

export function applyRayfieldConfig(target: RayfieldConfig, patch: DeepPartial<RayfieldConfig>): RayfieldConfig {
  const merged = mergeObject(target as unknown as Record<string, unknown>, patch as DeepPartial<Record<string, unknown>>) as unknown as RayfieldConfig;
  Object.assign(target, merged);
  return target;
}
