import { createRayfieldConfig, defaultRayfieldConfig } from "../src/config.js";
import { describe, expect, it } from "vitest";

describe("createRayfieldConfig", () => {
  it("deep-merges partial settings without mutating defaults", () => {
    const config = createRayfieldConfig({
      output: { color: "#ffffff" },
      sine: { speed: 0.42 },
    });

    expect(config.output.color).toBe("#ffffff");
    expect(config.sine.speed).toBe(0.42);
    expect(config.sine.frequency).toBe(defaultRayfieldConfig.sine.frequency);
    expect(defaultRayfieldConfig.output.color).toBe("#FFD198");
  });

  it("creates isolated nested objects", () => {
    const first = createRayfieldConfig();
    const second = createRayfieldConfig();
    first.source.offsetX = 0.5;
    expect(second.source.offsetX).toBe(0);
  });
});
