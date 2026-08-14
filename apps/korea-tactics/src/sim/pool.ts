import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

export function defaultWorkerCount(): number {
  try {
    return Math.max(1, availableParallelism());
  } catch {
    return 1;
  }
}

interface Pending<T> {
  job: unknown;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * 固定大小的 worker_threads 池：任务入队，空闲 worker 拉取。
 * 每个任务结果与种子绑定，聚合时再按 seed 排序，保证并行不影响确定性指标。
 */
export class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: Pending<unknown>[] = [];
  private readonly busy = new Map<Worker, Pending<unknown>>();
  private closed = false;

  constructor(size: number, workerUrl: URL) {
    const count = Math.max(1, size);
    const filename = fileURLToPath(workerUrl);
    for (let i = 0; i < count; i += 1) {
      // 经 .mjs bootstrap 注册 tsx，再加载 TypeScript worker
      const worker = new Worker(filename);
      worker.on("message", (message: { ok: boolean; result?: unknown; error?: string }) => {
        const pending = this.busy.get(worker);
        if (!pending) return;
        this.busy.delete(worker);
        if (message.ok) pending.resolve(message.result);
        else pending.reject(new Error(message.error ?? "worker 失败"));
        this.idle.push(worker);
        this.pump();
      });
      worker.on("error", (error: Error) => {
        const pending = this.busy.get(worker);
        this.busy.delete(worker);
        if (pending) pending.reject(error);
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  run<T>(job: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error("WorkerPool 已关闭"));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        job,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.pump();
    });
  }

  async map<T>(jobs: unknown[]): Promise<T[]> {
    return Promise.all(jobs.map((job) => this.run<T>(job)));
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.workers.map((worker) => worker.terminate()));
    this.workers.length = 0;
    this.idle.length = 0;
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const pending = this.queue.shift()!;
      this.busy.set(worker, pending);
      worker.postMessage(pending.job);
    }
  }
}
