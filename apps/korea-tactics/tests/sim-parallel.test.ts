import { describe, expect, it } from "vitest";
import { runSimulation } from "../src/sim/simulate";

describe("蒙特卡洛并行", () => {
  it("多 worker 与单线程聚合结果一致", async () => {
    const options = { seeds: 12, campaignSeeds: 4 } as const;
    const serial = await runSimulation({ ...options, workers: 1 });
    const parallel = await runSimulation({ ...options, workers: 4 });

    expect(parallel.missions).toEqual(serial.missions);
    expect(parallel.degenerates).toEqual(serial.degenerates);
    expect(parallel.campaigns).toEqual(serial.campaigns);
    expect(parallel.recovery).toEqual(serial.recovery);
    expect(parallel.unwinnableSeeds).toEqual(serial.unwinnableSeeds);
    expect(parallel.gates.map((g) => g.passed)).toEqual(serial.gates.map((g) => g.passed));
  }, 120_000);
});
