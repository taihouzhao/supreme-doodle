import type { WorldState } from "../core/types";

/** Read-only ASCII view. Must not be used to write flags or inventory. */
export function renderTextGrid(state: WorldState): string {
  const lines = [
    `loc=${state.locationId}`,
    `known=${[...state.knownLocations].sort().join(",")}`,
    `inv=${formatRecord(state.inventory)}`,
    `books=${[...state.heavenBooks].sort().join(",")}`,
  ];
  if (state.battle) {
    lines.push(`battle=${state.battle.id}:${state.battle.result}`);
    const grid = Array.from({ length: state.battle.height }, () =>
      Array.from({ length: state.battle!.width }, () => "."),
    );
    for (const unit of state.battle.units) {
      if (!unit.alive) continue;
      const row = grid[unit.y];
      if (!row) continue;
      row[unit.x] = unit.side === "player" ? "@" : "E";
    }
    lines.push(...grid.map((row) => row.join("")));
  }
  return lines.join("\n");
}

function formatRecord(record: Record<string, number>): string {
  return Object.keys(record)
    .sort()
    .map((key) => `${key}:${record[key]}`)
    .join(",");
}
