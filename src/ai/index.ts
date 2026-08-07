import { basicAgent } from "./basicAgent";
import { DEGENERATE_AGENTS } from "./degenerateAgents";
import { randomAgent } from "./randomAgent";
import { tacticalAgent } from "./tacticalAgent";
import type { Agent } from "./types";

const CORE_AGENTS = [randomAgent, basicAgent, tacticalAgent];

export const AGENTS: Record<string, Agent> = Object.fromEntries(
  [...CORE_AGENTS, ...DEGENERATE_AGENTS].map((agent) => [agent.id, agent]),
);

/** 能力梯度的三个档位 */
export const AGENT_ORDER = CORE_AGENTS.map((agent) => agent.id);
/** 用于检查「无脑统治性策略」的退化打法 */
export const DEGENERATE_ORDER = DEGENERATE_AGENTS.map((agent) => agent.id);

export function getAgent(id: string): Agent {
  const agent = AGENTS[id];
  if (!agent) throw new Error(`未知 Agent: ${id}`);
  return agent;
}

export { basicAgent, randomAgent, tacticalAgent, DEGENERATE_AGENTS };
export type { Agent };
