# Website contexts and client upload workflow

Inspected 19 October 2026: [MCP Testing (For Dev only)](https://www.figma.com/design/BAXp6TGV4E7ZJsa0RBK9eT/BeeGlobal-%7C-Dev-File?node-id=7632-3298), the supplied screenshots, public HTML, linked CSS, inline CSS, and representative public logo files. CSS observations describe the retrieved source; responsive browser rendering has not been tested here. Recheck these contracts before implementing or changing the site.

## Verified contexts

| Figma section | Website context | Current image contract |
| --- | --- | --- |
| Homepage Layout (`7632:3307`) | [Homepage](https://beeglobal.webflow.io/), white carousel cards | `.portfolio-list-item .u-image` has auto dimensions and maximum width/height scaled from 206 × 57 at a 280 px card width. Each source's intrinsic dimensions matter below those limits. |
| Portfolio Layout - 1 (`7632:3303`) | [Portfolio](https://beeglobal.webflow.io/portfolio), In Spotlight | Inline CSS sets `.spotlight_card_logo` to aspect ratio 2.04, and its image to 95% panel width with no maximum width/height. Its source canvas includes the logo's white space. |
| Portfolio Layout - 2 (`7632:3299`) | Portfolio expanded company detail | `.portfolio-row_logo` has auto dimensions, maximum width 100%, left object positioning, `zoom: 1.1034`, and `mix-blend-mode: multiply`. This is a logo above company content, not a centered card. |

The homepage and detail panel reference the same Whizzo asset (`6ad5e3731748b2a150a8a4a4_whizzo.png`), verified as 113 × 29 pixels. Spotlight references a different Whizzo asset (`6acf4775449837928a7ab023_whizzo.png`), verified as 360 × 148 pixels. The shared Scimplify SVG declares width 121.865 and height 40. These are concrete reasons to retain two export profiles for the current website.

The homepage's 206 × 57 values are maximum bounds, not the target size for every logo. They do not specify optical balance. The Spotlight image's 360 × 148 canvas also does not specify how large every mark should be inside it; calibrate that occupancy against the supplied examples.

## Proposed client experience

1. Upload one source logo. Start with explicitly supported SVG, PNG, JPEG, and WebP inputs rather than claiming every possible file format.
2. Detect visible artwork bounds, preserving marks, taglines, and registered trademark symbols. Account for transparent padding. Crop clearly uniform white outer margins only; preserve white artwork inside the mark.
3. Select a calibrated size using aspect ratio and visual density, then scale uniformly within the selected context's limits. Preserve the source. The processor owns the sizing decision. Treat equal-area or equal-height calculations as starting heuristics, not proven optical equivalence.
4. Show the result in all three website contexts with neighboring reference logos. Automatically determine whether it is ready or needs studio review; never ask the client to judge balance or adjust scale.
5. Download the selected asset, or a single ZIP containing both labeled variants: `company-portfolio` for homepage/details and `company-spotlight` for Spotlight. The client uploads the applicable file into the CMS manually.

Use transparency where the site background must show through, especially in the tinted detail panel. Do not turn colored logos black or remove white artwork merely because the references are monochrome.

### Export constraints

- Portfolio asset: preserve calibrated logical width and height. An SVG can declare those dimensions while retaining vector detail. Raster exports must respect the current dependence on intrinsic image size; simply doubling PNG dimensions for retina quality also changes displayed size under the current auto sizing rules. Higher-resolution raster output needs an explicit rendered-size contract in the website or another tested packaging approach.
- Spotlight asset: preserve the 360:148 canvas ratio with calibrated mark size and position inside it. Higher-resolution raster output at this same ratio can work because the website explicitly controls its displayed width.
- Low-resolution originals cannot gain real detail by enlarging them. Flag a visibly inadequate source in the preview.
- One universal image across all three contexts would require standardized website rendering and confirmed CMS field bindings. Do not make that site change implicitly while preparing downloads.

## Graphify's proposed role

[Graphify](https://github.com/Graphify-Labs/graphify) can index code, reference Markdown, and images into a queryable graph. Export Figma observations and website contracts into explicit source documents first. Then a useful relationship chain is: Figma example → section profile → processor/export function → generated asset variant → CMS destination → website selector.

This would help an agent retrieve the right preset and identify affected sections when a rule changes. Treat this chain as a proposed integration, not something already created by Graphify. Its inferred image/document relationships are not verified pixel measurements.

Use tested code and versioned profile data during each client upload. Graphify is optional development support; it is not the image resizing engine, and it need not run or call a model for each upload. With only these three contexts, explicit profiles are the simpler starting point. Reconsider Graphify as the number of clients, layouts, references, and implementations grows.
