# Contributing

Use Node.js 20.19 or newer.

```sh
npm ci
npm run check
npm run test:browser
npm run smoke:consumer
```

Keep demo code outside the package `files` allowlist. Releases require a `vX.Y.Z` tag that exactly matches `package.json`.
