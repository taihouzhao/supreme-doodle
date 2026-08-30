/**
 * 按镜头位置加载 / 卸载区块。每帧最多长出有限块，平移时持续生长。
 */

import * as THREE from "three";
import { buildChunkView, type ChunkView, type ViewOptions } from "./scene";
import { CHUNK_SIZE, chunkKey, generateChunk, worldToChunk, type World } from "./world";

interface LoadedChunk {
  cx: number;
  cz: number;
  view: ChunkView;
}

export interface StreamerStats {
  chunks: number;
  buildings: number;
  trees: number;
  cars: number;
  instances: number;
  cx: number;
  cz: number;
  pending: number;
}

export class WorldStreamer {
  readonly group = new THREE.Group();
  private loaded = new Map<string, LoadedChunk>();
  private queue: { cx: number; cz: number }[] = [];
  private queued = new Set<string>();

  constructor(
    private world: World,
    private readonly lite: boolean,
  ) {}

  get seed(): number {
    return this.world.seed;
  }

  reset(world: World): void {
    for (const c of this.loaded.values()) {
      this.group.remove(c.view.group);
      c.view.dispose();
    }
    this.loaded.clear();
    this.queue = [];
    this.queued.clear();
    this.world = world;
  }

  sync(targetX: number, targetZ: number, cameraHeight: number): void {
    const { cx, cz } = worldToChunk(targetX, targetZ);
    const radius = cameraHeight > 4200 ? 3 : 2;
    const needed = new Set<string>();
    const wanted: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        const key = chunkKey(x, z);
        needed.add(key);
        if (!this.loaded.has(key) && !this.queued.has(key)) {
          wanted.push({ cx: x, cz: z, d: dx * dx + dz * dz });
        }
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) {
      const key = chunkKey(w.cx, w.cz);
      this.queued.add(key);
      this.queue.push({ cx: w.cx, cz: w.cz });
    }

    for (const [key, chunk] of this.loaded) {
      if (needed.has(key)) continue;
      this.group.remove(chunk.view.group);
      chunk.view.dispose();
      this.loaded.delete(key);
    }
    this.queue = this.queue.filter((q) => {
      const key = chunkKey(q.cx, q.cz);
      if (needed.has(key)) return true;
      this.queued.delete(key);
      return false;
    });
  }

  /** 本帧生长若干最近区块，返回新生长数量 */
  grow(budget = 2): number {
    let n = 0;
    const opts: ViewOptions = { lite: this.lite };
    while (n < budget && this.queue.length) {
      const next = this.queue.shift()!;
      const key = chunkKey(next.cx, next.cz);
      this.queued.delete(key);
      if (this.loaded.has(key)) continue;
      const model = generateChunk(this.world, next.cx, next.cz);
      const view = buildChunkView(this.world, model, opts);
      this.group.add(view.group);
      this.loaded.set(key, { cx: next.cx, cz: next.cz, view });
      n++;
    }
    return n;
  }

  update(dt: number): void {
    for (const c of this.loaded.values()) c.view.update(dt);
  }

  stats(targetX: number, targetZ: number): StreamerStats {
    const { cx, cz } = worldToChunk(targetX, targetZ);
    let buildings = 0;
    let trees = 0;
    let cars = 0;
    let instances = 0;
    for (const c of this.loaded.values()) {
      buildings += c.view.stats.buildings;
      trees += c.view.stats.trees;
      cars += c.view.stats.cars;
      instances += c.view.stats.instances;
    }
    return { chunks: this.loaded.size, buildings, trees, cars, instances, cx, cz, pending: this.queue.length };
  }
}

export { CHUNK_SIZE };
