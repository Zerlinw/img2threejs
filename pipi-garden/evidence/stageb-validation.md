# Stage B visual validation — 皮皮园

## Status

Interactive Stage B is implemented and browser-tested. The original Stage A
visual language and HUD are preserved; the lasso canvas, camera tools, selection
card, hints and toast are layered on top. The ground is now **20.8×20.8
(3× the original area)** with an outer meadow ring of bamboo, flowers, shrubs,
rocks, mushrooms, a second sakura, a fence, lanterns and stone paths.

## Evidence

| Check | Result |
| --- | --- |
| TypeScript | `npm run scene:pipi:check` passes |
| Production build | `npm run scene:pipi:build` passes |
| Expanded ground | 3.00× area (20.8×20.8), automated check passes |
| Outer decorations | mesh/obstacle count increases; visually reviewed |
| Interaction suite | 37 checks pass (`evidence/interaction-test.json`) |
| Console / page errors | 0 |
| Lasso spawn | works; small loop 1.26×, large loop 2.03× |
| Invalid water loop | blocked with “换块空地画圈吧” |
| Drag to pond | snapped to a walkable point with toast |
| Delete | selected panda removed; count 0 |
| Camera | right-drag, blank-drag, buttons, arrow keys, reset, auto-fit |
| Draft/full quality | draft during drag; full after settle |
| Follow / water | small follows large; no panda ends up in the pond |
| Max cap | 30 enforced with “住不下” toast |
| 10-panda performance | 135–165 fps across runs (last 165.2); 722 calls; 830,735 tris |
| Mobile | 390×844 full platform fits; mouse + touch lasso work; no console errors |
| Single-file build | `dist-pipi-garden/pipi-garden.html` loads from `file://` with no errors |

## Screenshots

- `renders/stageb-overview.png` — live three-resident overview with controls
- `renders/expanded-ground-8.png` — larger ground and outer meadow decorations
- `renders/stageb-spawn.png` — lasso spawn / star burst / toast
- `renders/stageb-spawned.png` — settled new resident
- `renders/stageb-selected.png` — selection ring + card
- `renders/stageb-rotated.png` — rotated view with residents
- `renders/stageb-10pandas.png` — ten-resident performance view
- `renders/stageb-mobile.png` — 390×844 mobile lasso

## Honest limitations

- The 30-panda cap is deliberately generous but the diorama becomes crowded.
- Ten-panda 60 fps is measured on the available GTX 1650 SUPER headless
  Chromium; it is not a promise for low-end phones.
- The 3× ground makes the auto-fit camera pull back, so pandas appear smaller
  than in the original 12×12 layout.
- The painted ground, sakura canopy and cut face remain stylized.
- There is no user-supplied reference image, so no reference-fidelity metric is
  claimed.
