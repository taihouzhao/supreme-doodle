import type { GameState, TerrainId } from "../core/types";

export const CONNECTION = {
  north: 1,
  east: 2,
  south: 4,
  west: 8,
} as const;

export type BridgeAxis = "north-south" | "east-west" | null;

function terrainAt(state: GameState, x: number, y: number): TerrainId | null {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.tiles[y * state.width + x] ?? null;
}

function connectsTo(state: GameState, x: number, y: number, terrain: TerrainId): boolean {
  const neighbour = terrainAt(state, x, y);
  return neighbour === terrain || (terrain === "road" && neighbour === "village");
}

function rawMask(state: GameState, x: number, y: number, terrain: TerrainId): number {
  let mask = 0;
  if (connectsTo(state, x, y - 1, terrain)) mask |= CONNECTION.north;
  if (connectsTo(state, x + 1, y, terrain)) mask |= CONNECTION.east;
  if (connectsTo(state, x, y + 1, terrain)) mask |= CONNECTION.south;
  if (connectsTo(state, x - 1, y, terrain)) mask |= CONNECTION.west;
  return mask;
}

function has(mask: number, direction: number): boolean {
  return (mask & direction) !== 0;
}

function runLength(
  state: GameState,
  x: number,
  y: number,
  terrain: TerrainId,
  dx: number,
  dy: number,
): number {
  let length = 1;
  for (const sign of [-1, 1]) {
    let step = 1;
    while (terrainAt(state, x + dx * step * sign, y + dy * step * sign) === terrain) {
      length += 1;
      step += 1;
    }
  }
  return length;
}

/**
 * 计算道路/河流的四向连接。地图常用双格宽线带；平行格不会被误判为每格一个三岔口。
 */
export function terrainConnectionMask(
  state: GameState,
  x: number,
  y: number,
  terrain: "road" | "river",
): number {
  let mask = rawMask(state, x, y, terrain);
  let vertical = has(mask, CONNECTION.north) && has(mask, CONNECTION.south);
  let horizontal = has(mask, CONNECTION.east) && has(mask, CONNECTION.west);

  // 多格宽河面按更长的连续方向流动，不把湖面/宽河每格画成十字水道。
  if (terrain === "river" && vertical && horizontal) {
    const verticalRun = runLength(state, x, y, terrain, 0, 1);
    const horizontalRun = runLength(state, x, y, terrain, 1, 0);
    if (horizontalRun > verticalRun) mask = CONNECTION.east | CONNECTION.west;
    else if (verticalRun > horizontalRun) mask = CONNECTION.north | CONNECTION.south;
    vertical = has(mask, CONNECTION.north) && has(mask, CONNECTION.south);
    horizontal = has(mask, CONNECTION.east) && has(mask, CONNECTION.west);
  }

  if (vertical && !horizontal) {
    for (const [dx, bit] of [[1, CONNECTION.east], [-1, CONNECTION.west]] as const) {
      if (!has(mask, bit)) continue;
      const adjacent = rawMask(state, x + dx, y, terrain);
      if (has(adjacent, CONNECTION.north) && has(adjacent, CONNECTION.south)) mask &= ~bit;
    }
  } else if (horizontal && !vertical) {
    for (const [dy, bit] of [[1, CONNECTION.south], [-1, CONNECTION.north]] as const) {
      if (!has(mask, bit)) continue;
      const adjacent = rawMask(state, x, y + dy, terrain);
      if (has(adjacent, CONNECTION.east) && has(adjacent, CONNECTION.west)) mask &= ~bit;
    }
  }

  return mask;
}

/** 道路格与河带相交时自动成为桥；返回桥面道路的延伸轴。 */
export function bridgeAxisAt(state: GameState, x: number, y: number): BridgeAxis {
  if (terrainAt(state, x, y) !== "road") return null;
  // 只有史料/关卡明确写成桥梁的渡河轴才画桥；“渡河带”“桥头堡”仍按徒涉/桥头表现。
  const namedBridge = [...state.objectives, ...state.places].some((landmark) => {
    if (!/(?:公路桥|桥梁)/.test(landmark.name)) return false;
    return Math.abs(landmark.x - x) + Math.abs(landmark.y - y) <= 4;
  });
  if (!namedBridge) return null;
  const mask = terrainConnectionMask(state, x, y, "road");
  const riverHorizontal =
    terrainAt(state, x - 1, y) === "river" || terrainAt(state, x + 1, y) === "river";
  const riverVertical =
    terrainAt(state, x, y - 1) === "river" || terrainAt(state, x, y + 1) === "river";
  if (riverHorizontal && (has(mask, CONNECTION.north) || has(mask, CONNECTION.south))) {
    return "north-south";
  }
  if (riverVertical && (has(mask, CONNECTION.east) || has(mask, CONNECTION.west))) {
    return "east-west";
  }
  return null;
}
