import { AGENTS } from "../ai";
import { CHAPTER_ONE } from "../content/chapter";
import type { SimulationResult } from "./simulate";
import type { MissionAggregate } from "./stats";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function agentName(id: string): string {
  return AGENTS[id]?.name ?? id;
}

function missionName(id: string): string {
  return CHAPTER_ONE.missions.find((m) => m.id === id)?.name ?? id;
}

function missionTable(rows: MissionAggregate[]): string {
  const lines = [
    "| 关卡 | 策略 | 胜率 | 胜率标准差 | 平均伤亡 | 平均存活 | 平均回合 | 敌方溃散 |",
    "|------|------|------|------------|----------|----------|----------|----------|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${missionName(row.missionId)} | ${agentName(row.agentId)} | ${pct(row.winRate)} | ${row.winRateStdDev.toFixed(2)} | ${row.avgCasualties.toFixed(1)} | ${row.avgSurvivors.toFixed(1)} | ${row.avgTurns.toFixed(1)} | ${row.avgEnemyRouted.toFixed(1)} |`,
    );
  }
  return lines.join("\n");
}

export function renderReport(result: SimulationResult): string {
  const passed = result.gates.filter((gate) => gate.passed).length;
  const total = result.gates.length;

  const sections: string[] = [];

  sections.push(`# 平衡报告 · ${CHAPTER_ONE.name}`);
  sections.push(
    [
      `- 每关每策略运行种子数：${result.seeds}`,
      `- 战役续跑种子数：${result.recovery.runs}`,
      `- 并行 workers：${result.workers}`,
      `- 门槛通过：**${passed}/${total}**`,
      `- 生成耗时：${(result.elapsedMs / 1000).toFixed(1)}s`,
      "",
      "> 本文件由 `npm run sim` 自动生成，请勿手工编辑。",
    ].join("\n"),
  );

  sections.push("## 门槛");
  sections.push(
    [
      "| 结果 | 门槛 | 数据 |",
      "|------|------|------|",
      ...result.gates.map(
        (gate) => `| ${gate.passed ? "通过" : "**未通过**"} | ${gate.title} | ${gate.detail} |`,
      ),
    ].join("\n"),
  );

  sections.push("## 能力梯度");
  sections.push(missionTable(result.missions));

  sections.push("## 退化打法（用于检查统治性策略）");
  sections.push(missionTable(result.degenerates));

  sections.push("## 连续战役");
  sections.push(
    [
      "| 策略 | 十二关全胜率 | 平均任务胜率 | 平均通关数 | 结束时平均等级 | 结束时编制 | 平均永久损失 |",
      "|------|--------------|--------------|------------|--------------|------------|--------------|",
      ...result.campaigns.map(
        (row) =>
          `| ${agentName(row.agentId)} | ${pct(row.fullClearRate)} | ${pct(row.avgCompletionRate)} | ${row.avgMissionsWon.toFixed(2)} | ${row.avgLevelAtEnd.toFixed(1)} | ${row.avgRosterAtEnd.toFixed(1)} | ${row.avgPermanentLosses.toFixed(1)} |`,
      ),
    ].join("\n"),
  );

  sections.push("## 重创后的恢复能力");
  sections.push(
    [
      "第一关交给随机策略制造损失，后续交给战术策略；这里以第三关作为早期恢复检查点，另由十二关战役统计验证长期恢复。",
      "",
      `- 第一关胜率：${pct(result.recovery.firstMissionWinRate)}`,
      `- 第三关胜率：${pct(result.recovery.finalMissionWinRate)}`,
      `- 进入第三关时平均编制：${result.recovery.avgRosterBeforeFinal.toFixed(1)}`,
      `- 全程平均永久损失：${result.recovery.avgPermanentLosses.toFixed(1)}`,
      `- 结束时平均等级：${result.recovery.avgLevelAtEnd.toFixed(1)}`,
    ].join("\n"),
  );

  const unwinnable = Object.entries(result.unwinnableSeeds).filter(([, seeds]) => seeds.length > 0);
  sections.push("## 不可能种子");
  sections.push(
    unwinnable.length === 0
      ? "未发现任何一个种子是所有策略都无法完成核心目标的。"
      : [
          "下列种子在已登记策略库中未被打通（搜索证据，不是可解性证明）：",
          ...unwinnable.map(
            ([mission, seeds]) => `- ${missionName(mission)}: ${seeds.join(", ")}`,
          ),
        ].join("\n"),
  );

  return `${sections.join("\n\n")}\n`;
}
