# NMOS Port Explorer

Browser-based NMOS IS-04/IS-05 endpoint discovery tool.

## Features

- Port list and range scanning with concurrency controls
- NMOS endpoint probing for IS-04/IS-05 with basic probability scoring
- Results table with quick links and clipboard copy
- Settings persisted in localStorage (including discovered port list growth)
- Local network warning prompt for non-local targets
- PWA support — installable and works offline

## Usage

1. Open the app in Chrome (via GitHub Pages or locally).
2. Enter a target IP/hostname and port list or range.
3. Adjust NMOS and performance settings if needed.
4. Start exploration and review results.

## NMOS Settings

| Field | Default | Description |
|---|---|---|
| **Protocol** | HTTP | HTTP or HTTPS. Match your device's protocol. |
| **Endpoint Prefix** | `/x-nmos` | Standard NMOS base path. Change only if your device uses a non-standard path. |
| **Base Path** | (empty) | Path prepended before the endpoint prefix. Use when devices are behind a reverse proxy (e.g. `/api`). Comma-separated for multiple paths. |

URL format: `{protocol}://{target}:{port}{Base Path}{Endpoint Prefix}/{api}/`

Example with Base Path `/api`: `http://192.168.1.100:80/api/x-nmos/node/`

## PWA (Offline Use)

This app can be installed as a PWA (Progressive Web App) for offline use.

**Install:**
1. Open the app in Chrome while online.
2. Click the **Install App** button in the header.
3. The app is cached locally and works without an internet connection.

**Uninstall:**
- Open the installed app → `⋮` menu → Uninstall
- Or: `chrome://apps` → right-click → Remove from Chrome

## Updating (for developers)

When releasing a new version, increment the cache version in `service-worker.js`:

```js
const CACHE_NAME = 'nmos-explorer-v2'; // increment this
```

Then push to GitHub. Users will receive the update automatically on their next online launch.

## Notes

- Use only on systems you own or are authorized to test.
