import { getAgent } from "../ai";
import { UNIT_TYPES, veterancyName } from "../content/units";
import { playStandaloneMission } from "./runner";
import type { GameState } from "../core/types";

const missionId = process.argv[2] ?? "m1-breakthrough";
const agentId = process.argv[3] ?? "tactical";
const seed = Number(process.argv[4] ?? 1);

const run = playStandaloneMission("chapter-one", missionId, getAgent(agentId), seed);
const state = run.finalState;

function describe(s: GameState): string {
  const rows: string[] = [];
  for (let y = 0; y < s.height; y += 1) {
    let row = "";
    for (let x = 0; x < s.width; x += 1) {
      const unit = s.units.find((u) => u.alive && !u.evacuated && u.x === x && u.y === y);
      if (unit) {
        const letter = unit.type[0]!.toUpperCase();
        row += unit.faction === "player" ? letter : letter.toLowerCase();
      } else {
        row += ".";
      }
    }
    rows.push(row);
  }
  return rows.join("\n");
}

console.log(`关卡 ${missionId} / ${agentId} / seed ${seed}`);
console.log(`结果 ${state.status}：${state.resultReason}`);
console.log(
  `回合 ${state.turn}/${state.maxTurns} 天气 ${state.weather} 动作数 ${run.actions.length}`,
);
console.log(
  `我方溃散 ${state.stats.playerRouted} 敌方溃散 ${state.stats.enemyRouted} 撤离 ${state.stats.playerEvacuated}`,
);
console.log(`目标: ${state.objectives.map((o) => `${o.id}=${o.owner}`).join(" ") || "无"}`);
console.log("");
console.log(describe(state));
console.log("");
for (const unit of state.units) {
  const status = unit.evacuated ? "已撤离" : unit.alive ? `${unit.hp}/${unit.maxHp}` : "溃散";
  console.log(
    `${unit.faction === "player" ? "我" : "敌"} ${unit.name.padEnd(6)} ${UNIT_TYPES[unit.type].name.padEnd(4)} ${status.padEnd(9)} 疲劳${Math.round(unit.fatigue)} ${veterancyName(unit.exp)}(${Math.round(unit.exp)})${unit.keyUnit ? " [主力]" : ""}`,
  );
}
