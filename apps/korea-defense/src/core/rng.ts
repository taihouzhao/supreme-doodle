/** Deterministic 32-bit generator used by the defense simulation. */
export class DefenseRng {
  private state: number;

  constructor(seed = 0x4b4f5245) {
    this.state = seed >>> 0;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.next() / 0x1_0000_0000;
  }

  bounded(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0;
    return this.next() % Math.floor(maxExclusive);
  }
}

export function hashState(state: { tick: number; rngState: number; commandPostIntegrity: number; deploymentPoints: number; kills: number; enemies: readonly { id: string; hp: number; pathProgress: number }[]; towers: readonly { id: string; level: number; cooldownTicks: number }[] }): string {
  let hash = 2166136261;
  const feed = (value: number): void => {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
  };
  feed(state.tick);
  feed(state.rngState);
  feed(state.commandPostIntegrity);
  feed(state.deploymentPoints);
  feed(state.kills);
  for (const enemy of state.enemies) {
    for (const char of enemy.id) feed(char.charCodeAt(0));
    feed(Math.round(enemy.hp * 100));
    feed(Math.round(enemy.pathProgress * 100));
  }
  for (const tower of state.towers) {
    for (const char of tower.id) feed(char.charCodeAt(0));
    feed(tower.level);
    feed(tower.cooldownTicks);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
