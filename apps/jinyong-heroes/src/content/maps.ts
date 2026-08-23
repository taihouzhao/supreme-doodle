import type { Facing, OverworldBuilding, SceneMap, SceneObject } from "../core/types";

const ROOM = [
  "#############",
  "#...........#",
  "#...........#",
  "#...........#",
  "#...........#",
  "#...........#",
  "#.....@.....#",
  "#...........#",
  "#####DDD#####",
];

function scene(
  locationId: string,
  objects: SceneObject[],
  rows: string[] = ROOM,
): SceneMap {
  let spawn = { x: 6, y: 6, facing: "north" as Facing };
  const parsed = rows.map((row, y) =>
    row
      .split("")
      .map((ch, x) => {
        if (ch === "@") {
          spawn = { x, y, facing: "north" };
          return ".";
        }
        return ch;
      })
      .join(""),
  );
  return {
    locationId,
    width: parsed[0]?.length ?? 0,
    height: parsed.length,
    spawn,
    leave: { dx: 0, dy: 2 },
    rows: parsed,
    objects,
  };
}

export const WORLD_SIZE = 480;

export const LIANCHENG_SCENES: Record<string, SceneMap> = {
  home: scene("home", [{ id: "home_chest", x: 3, y: 3, kind: "object" }]),
  heluo_inn: scene("heluo_inn", [
    { id: "waiter", x: 4, y: 3, kind: "npc" },
    { id: "inn_crowd", x: 8, y: 3, kind: "npc" },
  ]),
  nanxian_house: scene("nanxian_house", [
    { id: "nanxian_cabinet", x: 3, y: 3, kind: "object" },
    { id: "nanxian", x: 6, y: 3, kind: "npc" },
    { id: "nanxian_mirror", x: 9, y: 3, kind: "object" },
  ]),
  fuwei_biaoju: scene("fuwei_biaoju", []),
  jiangnan_cave: scene("jiangnan_cave", [{ id: "cave_poetry", x: 6, y: 3, kind: "object" }]),
  beichou_house: scene("beichou_house", [
    { id: "basin", x: 3, y: 3, kind: "object" },
    { id: "beichou", x: 8, y: 3, kind: "npc" },
  ]),
  tianning_temple: scene("tianning_temple", [{ id: "statue_back", x: 6, y: 3, kind: "object" }]),
  dalun_temple: scene("dalun_temple", [
    { id: "diyun_cell", x: 3, y: 3, kind: "object" },
    { id: "diyun", x: 4, y: 3, kind: "npc" },
  ]),
};

export const LIANCHENG_BUILDINGS: OverworldBuilding[] = [
  { locationId: "home", x: 351, y: 232, w: 3, h: 3, hidden: false },
  { locationId: "heluo_inn", x: 358, y: 228, w: 3, h: 3, hidden: false },
  { locationId: "nanxian_house", x: 387, y: 324, w: 3, h: 3, hidden: false },
  { locationId: "fuwei_biaoju", x: 368, y: 257, w: 3, h: 3, hidden: false },
  { locationId: "jiangnan_cave", x: 364, y: 279, w: 1, h: 1, hidden: true },
  { locationId: "dalun_temple", x: 113, y: 296, w: 3, h: 3, hidden: false },
  { locationId: "beichou_house", x: 50, y: 108, w: 3, h: 3, hidden: false },
  { locationId: "tianning_temple", x: 329, y: 236, w: 3, h: 3, hidden: false },
];

export const FACING_DELTA: Record<Facing, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy < 0) return "north";
  if (dx === 0 && dy > 0) return "south";
  if (dy === 0 && dx > 0) return "east";
  if (dy === 0 && dx < 0) return "west";
  return null;
}

export function cellAt(scene: SceneMap, x: number, y: number): string {
  const row = scene.rows[y];
  if (!row || x < 0 || x >= scene.width || y < 0 || y >= scene.height) return "#";
  return row[x] ?? "#";
}

export function objectAt(scene: SceneMap, x: number, y: number): SceneObject | undefined {
  return scene.objects.find((entry) => entry.x === x && entry.y === y);
}

export function buildingAt(
  buildings: OverworldBuilding[],
  x: number,
  y: number,
): OverworldBuilding | undefined {
  return buildings.find(
    (building) => x >= building.x && x < building.x + building.w && y >= building.y && y < building.y + building.h,
  );
}

/** Houses you can see while walking. Hidden cave is omitted — it is not a pin. */
export function visibleBuildings(buildings: OverworldBuilding[]): OverworldBuilding[] {
  return buildings.filter((building) => !building.hidden);
}
