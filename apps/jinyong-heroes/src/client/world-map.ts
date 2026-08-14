import { knownLocationList } from "./scene";
import type { ContentPack, LocationDefinition, WorldState } from "../core/types";

/** Public walkthrough coord space: origin north-west, Y increases south. */
export const WORLD_MAP_SIZE = 480;

/**
 * Overworld for the text shell. Only known locations are marked.
 * Geography strokes are decorative, not original tiles.
 */
export function renderWorldMap(state: WorldState, content: ContentPack): string {
  const known = knownLocationList(state, content);
  const inBattle = state.battle?.result === "ongoing";
  const pins = known.map((place) => pinSvg(place, place.id === state.locationId, inBattle)).join("");

  return `<svg class="world-map" viewBox="0 0 ${WORLD_MAP_SIZE} ${WORLD_MAP_SIZE}" role="img" aria-label="已发现地点的江湖地图">
    ${terrainSvg()}
    <text class="rose" x="240" y="22">北</text>
    <text class="rose" x="240" y="468">南</text>
    <text class="rose" x="16" y="246">西</text>
    <text class="rose" x="464" y="246">东</text>
    ${pins}
  </svg>`;
}

export function compassReadout(state: WorldState, content: ContentPack): string {
  const here = content.locations.find((location) => location.id === state.locationId);
  if (!here) return "";
  if ((state.inventory.compass ?? 0) < 1) {
    return "还没有罗盘。地图只标已经听说或到达的地方。";
  }
  return `罗盘 人（${here.worldX}，${here.worldY}）`;
}

function pinSvg(place: LocationDefinition, here: boolean, inBattle: boolean): string {
  const action = JSON.stringify({ type: "GO_TO", locationId: place.id });
  const labelY = place.worldY < 28 ? place.worldY + 20 : place.worldY - 12;
  const labelX = Math.min(WORLD_MAP_SIZE - 8, Math.max(8, place.worldX));
  const clickable = inBattle ? "" : ` data-action='${action}' tabindex="0" role="button"`;
  return `<g class="pin${here ? " here" : ""}"${clickable}>
      <circle cx="${place.worldX}" cy="${place.worldY}" r="${here ? 8 : 5.5}"></circle>
      <text x="${labelX}" y="${labelY}">${escapeXml(place.title)}</text>
    </g>`;
}

function terrainSvg(): string {
  return `
    <rect class="land" x="0" y="0" width="${WORLD_MAP_SIZE}" height="${WORLD_MAP_SIZE}"></rect>
    <path class="water" d="M0 210 C 80 190, 160 230, 250 220 S 400 260, 480 240"></path>
    <path class="ridge" d="M40 70 L70 50 L110 80 L150 55 L180 90"></path>
    <path class="ridge" d="M90 120 L130 100 L160 130"></path>
    <path class="ridge" d="M300 380 L340 360 L380 390 L420 370"></path>
  `;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
