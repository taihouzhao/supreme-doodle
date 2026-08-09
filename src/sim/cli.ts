import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defaultWorkerCount } from "./pool";
import { renderReport } from "./report";
import { runSimulation } from "./simulate";

interface CliOptions {
  seeds: number;
  campaignSeeds?: number;
  workers?: number;
  out: string;
  json?: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { seeds: 200, out: "reports/balance.md", quiet: false };
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.split("=");
    const key = rawKey?.replace(/^--/, "");
    switch (key) {
      case "seeds":
        options.seeds = Number(rawValue);
        break;
      case "campaign-seeds":
        options.campaignSeeds = Number(rawValue);
        break;
      case "workers":
        options.workers = Number(rawValue);
        break;
      case "out":
        options.out = rawValue ?? options.out;
        break;
      case "json":
        options.json = rawValue ?? "reports/balance.json";
        break;
      case "quiet":
        options.quiet = true;
        break;
      default:
        break;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const result = await runSimulation({
  seeds: options.seeds,
  workers: options.workers ?? defaultWorkerCount(),
  ...(options.campaignSeeds !== undefined ? { campaignSeeds: options.campaignSeeds } : {}),
});

const markdown = renderReport(result);
const outPath = resolve(process.cwd(), options.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, markdown, "utf8");

if (options.json) {
  const jsonPath = resolve(process.cwd(), options.json);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(result, replacer, 2)}\n`, "utf8");
}

function replacer(key: string, value: unknown): unknown {
  return key === "finalState" || key === "actions" ? undefined : value;
}

if (!options.quiet) {
  for (const gate of result.gates) {
    console.log(`${gate.passed ? "PASS" : "FAIL"}  ${gate.title}\n      ${gate.detail}`);
  }
  console.log(
    `\n报告已写入 ${options.out}（${(result.elapsedMs / 1000).toFixed(1)}s，${result.workers} workers）`,
  );
}

const failed = result.gates.filter((gate) => !gate.passed);
process.exitCode = failed.length === 0 ? 0 : 1;
