# Changelog

## 0.1.3 — 2026-08-17

- Replaced the approximate single-pass field with the source renderer's native vignette, wave, fracture, bokeh, and output framebuffer chain.
- Bundled the matching background-gradient and blue-noise textures so the public package and deployed demo render independently without source maps or runtime asset proxies.

## 0.1.2 — 2026-08-17

- Reduced the procedural bokeh path to one field evaluation so software WebGL and low-power devices render the same broad rays without blocking interaction.

## 0.1.1 — 2026-08-17

- Restored the native broad diagonal ray-field character for the procedural source.
- Matched the private demo's Copy Prompt control to Seam Bricks, including Haloform feedback and the Copy/Copied text transition.

## 0.1.0 — 2026-08-17

- First independent WebGL 2 Rayfield renderer.
- React component and framework-neutral renderer APIs.
- Procedural, texture, and noise sources with configurable vignette, wave, fracture, and bokeh shaping.
- Reduced-motion, cleanup, resize, and WebGL failure paths.
- Token-free GitHub Release tarball distribution.
