# Static visual validation — 皮皮园

> Historical Stage A report. The interactive Stage B result is in
> [`stageb-validation.md`](stageb-validation.md) and the current README.

## Status

Stage A (static diorama) is ready for review. Interaction is intentionally not
implemented yet.

## Evidence

| Check | Result |
| --- | --- |
| Fresh screenshots | `renders/overview.png`, `renders/poses.png`, `renders/closeup.png` |
| HUD screenshot | `renders/overview-ui.png` |
| Four-angle fit | `renders/orbit-0.png` … `orbit-270.png`; max NDC < 0.90 |
| Ready / console | `ready=true`, zero page or console errors |
| Build | `npm run scene:pipi:build` passes |
| Single-file build | `dist-pipi-garden/pipi-garden.html` loads from `file://` with no errors |
| Structural report | `evidence/static-check.json` |
| Visual review | `evidence/static-review.json` |

## What was checked by eye

1. **Composition** — the floating platform is centered with cream-paper margins;
   tall bamboo, sakura, sign and lantern tops are not clipped.
2. **Character** — rust/cream red panda, drooping eye patches, catchlights,
   blush, ringed tail; the five-pose sheet reads walk / sit / eat / wag / idle.
3. **Palette and light** — warm left-top key, cool fill, bright daylight,
   tilt-shift blur and a warm-to-cool paper grade.
4. **Ground and cut face** — mossy painted surface, flowers and grass; the front
   cut shows dark strata seams, roots and embedded stones.
5. **Props** — bamboo grove, sakura, pond with koi and lily pads, sign “皮皮园”,
   stone lantern, bench, rocks, mushrooms, flowers, stepping stones.

## Honest limitations

- There is no source reference image. This is a new text-brief scene, so no
  reference-fidelity / `diagnose_render.py` comparison is claimed.
- At full-diorama distance the 30k+ ground brush marks read as soft mottling
  rather than individual strokes.
- The sakura canopy is a stylized shaded-sphere tree, not a botanical model.
- Stage B still needs the lasso / drag / delete / orbit interaction tests, the
  10-panda performance measurement, and mobile touch validation.
