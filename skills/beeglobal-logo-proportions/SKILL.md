---
name: beeglobal-logo-proportions
description: Prepare BeeGlobal portfolio logos for the homepage carousel, Spotlight cards, and company detail panels. Use when sizing uploaded logos, producing CMS assets, or implementing the logo preparation tool; preserve the original brand artwork.
---

# BeeGlobal portfolio logo proportions

Use the [measured Figma examples](references/figma-measurements.md) as calibration points. The source is the **“test out the logos dimensions”** section in the BeeGlobal Dev File. These are measurements of a test layout, not a formula that assigns every logo the same width or height.

For CMS exports or the client upload tool, first read [the three website contexts and export requirements](references/website-contexts.md). The existing website uses two asset contracts: an individually sized logo shared by the homepage and detail panel, and a padded 360 × 148 canvas for Spotlight. A single upload can generate both outputs. Do not promise one interchangeable image for all three contexts without verifying or changing the website's image rendering rules.

This skill guides an agent developing or operating the processor. A browser frontend needs executable processing code and versioned sizing presets; Markdown instructions alone do not execute when a client uploads a file.

## What the design establishes

- Each card is 280 × 192 px. The desktop grid has nine columns, 32 px gaps, and three rows; the last row has four cards.
- All 22 immediate logo frames are centered exactly within their cards. Their widths span 70–206 px and their heights span 24.4–57 px. The varied dimensions and rendered examples suggest individual optical sizing; the original designer's sizing algorithm is not known.
- Keep each original mark's aspect ratio and visual identity. Scale the mark as a whole; do not stretch its axes, rearrange its elements, or crop it to force uniform dimensions.

## Sizing a new logo

The tool owns the sizing decision. The client uploads the original and downloads the prepared assets; never ask them to eyeball proportions, approve visual balance, or operate size sliders.

1. Determine visible artwork bounds, including detached marks and taglines. Trim transparent padding or clearly uniform white outer margins without deleting white brand artwork inside the mark.
2. Compare shape, alpha coverage, contrast-weighted ink density, and the main body's height with existing website logos. Match both footprint and visual weight; aspect ratio or equal area alone is insufficient. Recognized artwork should start at its established scale even if uploaded at another resolution or with additional padding; the calibrated upper ink-mass limit may reduce unusually heavy recognized marks.
3. Scale uniformly within each website profile. Center the result, allowing a small bounded correction for visual asymmetry within the padded Spotlight canvas. Preserve all original elements and colors.
4. Evaluate the result alongside reference logos at the intended display size. During development, inspect comparison sheets and test references with their own measurements withheld. A confident arithmetic score is not proof of visual equivalence.
5. Return ready assets for supported matches. Hold low-contrast artwork, unusual layouts, or unreliable matches for studio review. Explain the next step plainly; never claim a review was submitted without a connected review service. Do not shift sizing judgment to the client.

The local prototype's executable rules live in `logo-studio/dist/optical.mjs`, export limits in `profiles.mjs`, and the 22 source assets and provenance in `reference-sources.json` and `assets/references/`. It uses deterministic pixel measurements and reference matching, not a vision-model call. Internal held-out checks exposed discrepancies up to 37%; uncertain reference neighborhoods now trigger review. Treat the result as a prototype requiring designer validation on unseen client samples, not a universally correct optical model.

Read [the optical decision rules](references/optical-rules.md) when modifying the processor or review criteria. Keep those rules, this skill, the installed skill copy, and the runtime implementation in sync.
