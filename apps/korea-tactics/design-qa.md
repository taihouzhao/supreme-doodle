# Design QA

## Comparison target

- source visual truth: `/Users/xingzhong/.codex/attachments/fd9db3b3-5a72-4239-a15e-af1b4a0b487a/codex-clipboard-ab855cb1-388a-4dcc-b720-3fc74f4bb8d4.png`
- implementation full-view: `/tmp/supreme-doodle-qa-20260809/final-battle.png`
- implementation focused state: `/tmp/supreme-doodle-qa-20260809/range-final.png`
- focused side-by-side comparison: `/tmp/supreme-doodle-qa-20260809/comparison-focus.png`
- viewport: 1280 × 720 CSS px; implementation screenshot 1280 × 720 px; source 690 × 242 px; focused implementation crop normalized to 690 × 242 px; no density resampling required.
- state: 第 1 关「温井初战」初始回合；精英敌军头像检查；迫击炮选中并 hover 射程空白格。

## Evidence review

- Full view: `/tmp/supreme-doodle-qa-20260809/final-battle.png` confirms the battle board remains compact and the attack log is collapsed by default.
- Focused comparison: `/tmp/supreme-doodle-qa-20260809/comparison-focus.png` places the supplied large attack card beside the implementation. The implementation intentionally replaces the duplicate card with a compact weapon-range frame and keeps the action dock separate.
- Elite ring detail: `/tmp/supreme-doodle-qa-20260809/elite-final.png` and `/tmp/supreme-doodle-qa-20260809/crops/boss.png` confirm a gold ceremonial ring with wheat sheaves and clasp, with the faction ring retained inside the portrait mask.

## Required fidelity surfaces

- Fonts and typography: existing Noto Sans SC hierarchy is retained; range title, range numbers, and action labels use the same compact board scale and remain readable at 1280 × 720.
- Spacing and layout rhythm: range frame is placed above the hovered tile, while the action dock stays clear of its final line; no large duplicate attack card is rendered.
- Colors and visual tokens: attack range keeps the existing red hatch and warm outline; projected HP uses the existing red/amber health semantics and a pale midpoint marker.
- Image quality and asset fidelity: `public/assets/ui/elite-wreath.png` is a real transparent raster asset with gold trim, bilateral wheat sheaves, and bottom clasp; it is preloaded through the shared image cache.
- Copy and content: preview copy names the weapon, numeric range, current distance, effect profile, target HP projection, and counter-attack eligibility. Experience is shown only as `EXP` and `Lv.`.

## Findings

- No actionable P0/P1/P2 findings remain.
- P3 accepted: the supplied source is a legacy desktop attack-card composition; the implementation deliberately uses a lower-density in-board helper frame to satisfy the updated interaction requirement.

## Comparison history

1. Initial implementation placed the range frame near the hovered tile; the action dock covered the last line in the focused screenshot.
2. Fixed `src/ui/board.ts` to place attack range frames above the target before clamping to the viewport.
3. Re-captured `/tmp/supreme-doodle-qa-20260809/range-final.png` and rechecked `/tmp/supreme-doodle-qa-20260809/comparison-focus.png`; all range lines are visible and the dock no longer obscures the frame.

## Primary interactions tested

- Continue campaign → enter mission.
- Select enemy commander to verify elite wreath and `Lv.`/`EXP` copy.
- Select mortar → hover an in-range empty tile to verify weapon range helper and effect label.
- Confirm battle log remains collapsed on entry.

## Verification

- `npm run typecheck` passed.
- `npx vitest run --maxWorkers=1 --reporter=dot` passed: 16 files, 136 tests.
- Browser console checked after final reload; no runtime errors were emitted.

final result: passed
