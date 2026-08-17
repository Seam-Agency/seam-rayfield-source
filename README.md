# Seam Rayfield

A configurable WebGL light-field renderer for React and the browser.

[Live demo](https://seam.tools/rayfield/)

## Install

```sh
npm install https://github.com/Seam-Agency/seam-rayfield-source/releases/latest/download/seam-rayfield.tgz
```

## React

```tsx
import { SeamRayfield } from "@seam-agency/seam-rayfield";
import "@seam-agency/seam-rayfield/styles.css";

export function Hero() {
  return (
    <SeamRayfield
      style={{ minHeight: 420 }}
      config={{
        background: { color: "#dccfd0" },
        output: { color: "#f4d9ca" },
      }}
    />
  );
}
```

## Browser renderer

```ts
import { createRayfieldRenderer } from "@seam-agency/seam-rayfield";

const canvas = document.querySelector("canvas");
const renderer = createRayfieldRenderer(canvas);

renderer.setConfig({ sine: { speed: 0.18 } });

// When the owner unmounts:
renderer.destroy();
```

The renderer supports procedural, texture, and noise sources. It owns its animation frame, WebGL resources, pointer listeners, and resize observer; `destroy()` releases all of them.

## Requirements

- React 18.2 or newer for the React entry point.
- WebGL 2 for the animated renderer. The React component exposes a readable fallback when WebGL 2 is unavailable.
- Node.js 20.19 or newer for development.

## Licence

MIT.
