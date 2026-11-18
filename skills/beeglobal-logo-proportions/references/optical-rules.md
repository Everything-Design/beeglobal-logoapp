# Automatic optical decision rules

Version: beeglobal-2026-11-01-v5-optical. Implemented by `logo-studio/dist/optical.mjs`.

## Inputs and measurement

The 22 local website assets are calibration examples with recorded source URLs. Decode images in the browser and calculate alpha bounds, uniform white outer margins, luminance-weighted ink, density, central 90% ink height, a 32 × 16 spatial signature, and weighted center. Preserve white artwork. Cache the calibration promise for subsequent uploads in the page session. Graphify is optional developer indexing and never runs in the client sizing path.

## Decision

- Recognize existing artwork only with a near-identical aspect ratio and spatial signature; start from its established visible width and the uploaded mark's aspect ratio. Apply the same upper ink-mass limit as new artwork so a heavy outlier can be reduced; ordinary recognized logos retain their established dimensions.
- For new artwork, choose five neighbors by log aspect ratio, log density, and main-body height. Combine a reference footprint target (60% log weight) and an ink target adjusted for the uploaded density (40%). Limit density-driven enlargement to 15% above the footprint target. Also cap width at 115% of the widest of the three closest references and height at 130% of their tallest, scaling uniformly. The separate height allowance preserves legitimate taller marks in the reference audit. These are calibrated heuristics, not the original designer's known formula.
- For unfamiliar marks wider than 6:1 with alpha coverage below 20%, reduce both dimensions in proportion to coverage, with a maximum 28% reduction. Compare these marks with an ink target reduced by the same area factor when applying the visual-weight review gate. The supplied Agnikul PNG has 16.1% coverage and previously reached the 206 px width limit; this rule reduces its spread without changing the calibrated wide references, whose lowest coverage is about 20.4%.
- Limit contrast-weighted visible ink mass in the portfolio export to 1,700 pixel equivalents for compact marks. Between aspect ratios 3:1 and 4:1, transition the limit down to 1,150 for wide marks, scaling uniformly and carrying the correction into Spotlight. This reduces StepChanges and Tractrix beside Telora while retaining Telora's established scale. The limits are hand-calibrated from the 22 local references and the supplied comparison examples, not from an independent validation set.
- Fit homepage/details within 206 × 57. Fit Spotlight at 1.8× baseline, capped at 240 × 76, on a 360 × 148 canvas. Shift toward the visual center by at most 4 px per axis.
- Hold for studio review if contrast is below .12; ratio is outside .45–14; an unfamiliar mark's resulting ink is outside .5–2.1 times its target; an unfamiliar dense mark needs more than 15% reduction under the ink-mass limit; nearest feature distance exceeds 7; or any of its three nearest references has held-out width error above 20%.
- Held-out reference errors are diagnostic calibration evidence, not independent accuracy estimates for unseen logos. Similarity recognition is not a brand-identity verification service.

## UX and quality boundaries

Clients upload and download; no scale sliders, optical approval prompt, or white-removal toggle. Review cases retain previews but disable exports and direct the client to their BeeGlobal contact. There is no backend review queue or vision model. Files stay in the browser.

Use desktop/mobile browser tests, output PNG/ZIP checks, a padding/resampling invariance test, thin-versus-dense tests, white-artwork preservation, and review gating. Inspect `logo-studio/artifacts/reference-comparison.png` after running browser checks. In the initial held-out audit, Crest differed by 37% and Tractrix by 26%; both now trigger review when treated as unfamiliar. Some acceptable neighboring logos also trigger review. A designer must calibrate this prototype against representative unseen client submissions before production rollout.
