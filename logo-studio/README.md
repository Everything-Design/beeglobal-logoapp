# BeeGlobal Logo Studio

A local, browser-only prototype for preparing logos before a client uploads them to Webflow CMS. There are no runtime packages, API keys, or upload servers. User images are processed in memory in the browser. The local server serves static files only.

## Run

From this directory, run `npm run dev`, then open `http://127.0.0.1:4173`. Node.js is required; no package installation is needed. Press Ctrl+C to stop the server.

Upload one or up to 30 SVG, PNG, JPEG, or WebP logos at once (up to 15 MB each), or use the included Whizzo sample. The tool selects proportions for each logo automatically. In bulk mode, every processed logo appears together in each of the homepage, Spotlight, and company detail previews; there is no per-logo selection step. Download all ready logos in one ZIP, or use the three section buttons to download a ZIP for Homepage, Spotlight, or Company details. A single upload provides separate files for those sections, plus a ZIP with all three. Uncertain matches remain visible but are excluded from downloads and ask the client to send the original to their BeeGlobal contact; there is no automated review submission service. A new upload replaces the current batch.

## Output contract

- `name-homepage.svg` or `.png`: individually sized logo for the homepage, up to 206 × 57 logical pixels. Its intrinsic dimensions matter in the current website CSS.
- `name-spotlight.svg` or `.png`: 360 × 148 canvas with the mark fitted and centered inside it. Current heuristic uses 1.8× the reference size, capped at 240 × 76.
- `name-details.svg` or `.png`: a separate file for the company detail panel. It uses the same intrinsic dimensions as the homepage file because that is the current website contract; the detail panel enlarges it through CSS.

SVG uploads produce SVG exports with their vector artwork preserved. PNG, JPEG, and WebP uploads produce PNG exports. A bulk ZIP can contain both formats. Transparent padding and uniformly white outer margins are trimmed automatically. White pixels inside the artwork remain intact. Previews include the detail panel's multiplication blend behavior.

## Automatic optical sizing

`dist/optical.mjs` measures aspect ratio, contrast-weighted ink density, the height containing the central 90% of ink, and the visual center. It compares these with 22 locally stored website logos. Their source URLs are recorded in `dist/reference-sources.json`. Measurements and held-out calibration errors are computed once per browser session and reused for uploads; there are no model calls.

For unfamiliar marks, five nearby references determine a blend of footprint and visible-ink targets. Density-driven enlargement is limited to 15% above the reference footprint, and output width and height are bounded by the three closest references. Very wide marks with unusually sparse coverage are reduced so letter spacing does not fill the entire card. An aspect-dependent upper ink-mass limit reduces heavy wide marks, including StepChanges and Tractrix, while leaving Telora at its established scale. All transforms preserve aspect ratio. Spotlight gets a small bounded correction toward the visual center. Low contrast, extreme shapes, unattainable visual weight, distant references, or a neighborhood with poor held-out calibration trigger studio review. There are no client sizing sliders or destructive white-pixel removal controls.

This is a deterministic prototype, not a universal visual judge. The internal reference audit found scale differences up to 37% when individual references were withheld. The review guard catches those large discrepancies, but can also hold otherwise acceptable logos. These checks do not establish accuracy on unseen client logos. Before production, a designer should assess representative new logos side by side and calibrate the thresholds; any future vision-model review would require a separate backend. The current tool does not call AI or submit review requests.

## Source map for agents and Graphify

All paths below are relative to the workspace root unless they begin with `dist/`.

| Responsibility | Source |
| --- | --- |
| Agent instructions and visual reference measurements | `skills/beeglobal-logo-proportions/` |
| Live website selectors, Figma page/node IDs, and CMS export contracts | `skills/beeglobal-logo-proportions/references/website-contexts.md` |
| Versioned export limits | `dist/profiles.mjs` |
| Proportional fit, artwork bounds, ZIP encoding | `dist/core.mjs` |
| Optical measurements, reference matching, review rules | `dist/optical.mjs`, `dist/reference-sources.json`, `dist/assets/references/` |
| File decoding, browser canvas processing, previews, download actions | `dist/app.mjs` |
| Three visual contexts | `dist/index.html`, `dist/styles.css` |

Graphify can index this code and the skill references to help an agent locate connected rules and implementation. It is not installed by this prototype and does not run during client uploads. If Graphify is introduced later, index the source and reference files, exclude duplicate installed skill copies, generated screenshots, and test artifacts, and update the graph after source changes.

## Verification

`npm test` runs deterministic sizing, transparency, bounds, and ZIP checks.

`npm run test:browser` runs headless Google Chrome on macOS using its DevTools protocol, with no browser-test package. It tests SVG and PNG upload, actual PNG/ZIP downloads, whitespace trimming, preserved white artwork, consistent scale after padding/resampling, studio review gating, clear, and mobile overflow. It launches its own temporary server and browser, then closes both. Screenshots, a side-by-side reference comparison sheet, and a diagnostic held-out reference audit are written to `artifacts/`.

The previews recreate the three website contexts; they do not run inside the live Webflow site. No changes are made to Figma, Webflow, or the CMS. CMS upload and live placement of generated files remain to be checked with real client samples.
