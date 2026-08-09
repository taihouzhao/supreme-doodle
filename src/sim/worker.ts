import { parentPort } from "node:worker_threads";
import { executeJob, type SimJob } from "./jobs";

if (!parentPort) {
  throw new Error("sim worker 必须在 worker_threads 中运行");
}

parentPort.on("message", (job: SimJob) => {
  try {
    const result = executeJob(job);
    parentPort!.postMessage({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort!.postMessage({ ok: false, error: message });
  }
});
