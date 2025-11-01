# Visor Web Controller

This directory contains the progressive web app that talks to the RP2040 visor firmware.

## Development

```pwsh
cd webapp
npm install
npm run dev
```

The `dev` script serves the files with hot reloading on <http://localhost:4173>. This is required for service workers and Web Serial access on desktop Chrome/Edge.

## Production Build

```pwsh
npm run build
```

The command produces a minified bundle in `webapp/dist`. Copy the folder to any static host (GitHub Pages, Netlify, an ESP32, etc.) or deploy it behind HTTPS for mobile use. The service worker enables offline caching once the page has loaded once.

Replace the default icon at `webapp/icons/icon.svg` with your own artwork before publishing.
