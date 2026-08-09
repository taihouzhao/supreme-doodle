# Design QA — 第二视觉方案

## Evidence

- Source visual truth: `/Users/xingzhong/.codex/generated_images/019fe53f-6257-73f3-a5b4-94ee9c9a9a7f/exec-c33c3ab1-754f-476f-96c9-d37c3f8f6e3e.png`
- Browser-rendered implementation: `/Users/xingzhong/Project/supreme-doodle/qa-org-mobile-final.png`
- Combined comparison input: `/Users/xingzhong/Project/supreme-doodle/qa-org-comparison.png`
- Viewport: 390 × 844 CSS px; device scale factor 1; narrow-screen check also passed at 320 × 844 with no horizontal overflow.
- Source pixels: 853 × 1844 (approximately 2.1875× density); normalized conceptually to 390 × 844 before comparison.
- Implementation pixels: 390 × 844; captured from the browser surface after CDP device metrics and visible-size normalization.
- State: organization tab active; target combat unit selected. The source mock shows a wounded three-unit roster with an active 50-person transfer; the implementation shows the real first-mission five-unit full-strength empty state. This is an intentional data-state difference, so comparison focuses on shared hierarchy, layout, controls, and responsive behavior.

## Comparison

The side-by-side comparison confirms the selected second direction is implemented: mission header, three persistent department tabs, compact organization summary, roster rows, sticky personnel-transfer work area, and mobile action footer occupy the same information hierarchy. The implementation uses the existing product typography, paper/ink/gold/green tokens, portraits, and controls rather than introducing a parallel visual system.

Focused checks:

- Organization target selection changes the pressed state and updates the transfer route/previews.
- Empty transfer state keeps minus/confirm controls disabled and explains the 55-person logistics reserve.
- Department tabs switch between staff, organization, and ordnance panels.
- At 390px and 320px widths, the panel remains single-column with no horizontal overflow.
- Battle log is collapsed on entry, expands on demand, and collapses again.
- Browser console had no warnings or errors during the final pass.

## Findings

No actionable P0, P1, or P2 visual findings remain.

The source mock uses bespoke department glyphs and a deliberately wounded sample roster; the implementation keeps the repository's existing asset system and renders the real initial-campaign empty state. These are intentional content/state constraints, not layout defects. Optional P3 polish would be to add dedicated department glyph assets and a fixture/demo state for design review.

## Comparison history

1. Initial pass: transfer panel was translucent and visually competed with the roster on narrow screens.
2. Fix: made the transfer panel opaque, added elevation, and raised its sticky stacking order to keep the action area readable.
3. Final pass: re-captured at 390 × 844; the panel is legible, controls remain in view, and 320px overflow check also passed.

## Implementation checklist

- [x] Three department tabs are persistent and keyboard/ARIA-labelled.
- [x] Personnel transfer is source/target based, capped by target shortage and logistics minimum reserve.
- [x] Combat log defaults collapsed.
- [x] Final browser interaction and console checks completed.
- [x] Typecheck, build, and full test suite pass.

final result: passed
