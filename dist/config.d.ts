import type { DeepPartial, RayfieldConfig } from "./types.js";
export declare const defaultRayfieldConfig: RayfieldConfig;
export declare function createRayfieldConfig(patch?: DeepPartial<RayfieldConfig>): RayfieldConfig;
export declare function applyRayfieldConfig(target: RayfieldConfig, patch: DeepPartial<RayfieldConfig>): RayfieldConfig;
