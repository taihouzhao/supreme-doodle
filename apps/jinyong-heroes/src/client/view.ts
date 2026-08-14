/** CSS-pixel layout for the walking canvas. Game rules stay on the tile grid. */

export function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Tile size for overworld / indoor. Targets ~16×10 tiles on a desktop pane. */
export function pickTileSize(mapWidth: number, mapHeight: number): number {
  const across = mapWidth / 16;
  const down = mapHeight / 10;
  return Math.round(clamp(48, Math.min(across, down), 88));
}

export function pickDialogHeight(viewHeight: number): number {
  return Math.round(clamp(112, viewHeight * 0.17, 176));
}

export function pickBattleTile(mapWidth: number, mapHeight: number, cols: number, rows: number): number {
  return Math.round(clamp(64, Math.min(mapWidth / (cols + 1.4), mapHeight / (rows + 1.4)), 128));
}

export function pickDevicePixelRatio(raw: number): number {
  return clamp(1, raw, 2);
}
