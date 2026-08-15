import * as THREE from "three";
import type { DefenseMissionConfig, SimulationSnapshot, TerrainType, TowerType } from "../core/types";

const TERRAIN_COLORS: Record<TerrainType, number> = {
  plain: 0x9baf9a,
  road: 0xd5c09b,
  forest: 0x3c6656,
  hill: 0x708b75,
  river: 0x3d6680,
  command: 0xb48a55,
};

const TOWER_COLORS: Record<TowerType, number> = {
  infantry: 0xd9e6cf,
  machineGun: 0x72bad0,
  mortar: 0xf0ad58,
};

const ENEMY_COLORS: Record<string, number> = {
  rifle: 0xd66a56,
  runner: 0xe1b65a,
  heavy: 0xbd4a45,
  armored: 0xa7384e,
};

export interface SceneOptions {
  quality: "high" | "low";
  onMapSelect: (selection: { nodeId?: string; towerId?: string } | null) => void;
}

export class DefenseScene {
  readonly available: boolean;
  readonly renderer: THREE.WebGLRenderer | null;
  private readonly host: HTMLElement;
  private readonly mission: DefenseMissionConfig;
  private readonly options: SceneOptions;
  private readonly scene: THREE.Scene | null;
  private readonly camera: THREE.OrthographicCamera | null;
  private readonly terrainMeshes: THREE.InstancedMesh[] = [];
  private readonly towerMeshes = new Map<TowerType, THREE.InstancedMesh>();
  private readonly enemyMeshes = new Map<string, THREE.InstancedMesh>();
  private readonly nodeMeshes = new Map<string, THREE.Mesh>();
  private readonly projectilePool: THREE.Mesh[] = [];
  private readonly hitPool: THREE.Mesh[] = [];
  private readonly disposables: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly lifecycleAbort = new AbortController();
  private readonly resizeObserver: ResizeObserver | null;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private contextLost = false;

  constructor(host: HTMLElement, mission: DefenseMissionConfig, options: SceneOptions) {
    this.host = host;
    this.mission = mission;
    this.options = options;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.OrthographicCamera | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: options.quality === "high", alpha: false, powerPreference: "high-performance" });
      if (!renderer.capabilities.isWebGL2) throw new Error("WebGL2 is required");
      renderer.setPixelRatio(options.quality === "high" ? Math.min(window.devicePixelRatio, 2) : 1);
      renderer.setClearColor(0x14221e, 1);
      renderer.domElement.dataset.region = "defense-canvas";
      renderer.domElement.setAttribute("aria-label", "温井防御战三维战场");
      host.append(renderer.domElement);
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 100);
      camera.position.set(mission.width / 2, 18, mission.height / 2);
      camera.lookAt(mission.width / 2, 0, mission.height / 2);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      this.buildScene(scene);
      this.bindPointer(renderer.domElement);
      this.available = true;
    } catch {
      if (renderer) renderer.dispose();
      host.innerHTML = `<div class="webgl-fallback" role="status"><strong>需要 WebGL 2</strong><span>当前浏览器无法创建三维战场。核心模拟仍可运行，请更新浏览器或启用硬件加速。</span></div>`;
      this.available = false;
    }
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.resizeObserver = typeof ResizeObserver === "undefined" || !this.renderer ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(host);
    this.resize();
  }

  private buildScene(scene: THREE.Scene): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.mission.width + 6, this.mission.height + 6), new THREE.MeshBasicMaterial({ color: 0x243b32 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.mission.width / 2, -0.12, this.mission.height / 2);
    scene.add(ground);
    this.disposables.push(ground);

    const terrainKinds: TerrainType[] = ["plain", "road", "forest", "hill", "river", "command"];
    for (const type of terrainKinds) {
      const cells: { x: number; y: number }[] = [];
      for (let y = 0; y < this.mission.height; y += 1) {
        for (let x = 0; x < this.mission.width; x += 1) {
          if (this.mission.terrain[y * this.mission.width + x] === type) cells.push({ x, y });
        }
      }
      if (cells.length === 0) continue;
      const geometry = new THREE.BoxGeometry(0.96, type === "hill" ? 0.36 : 0.16, 0.96);
      const material = new THREE.MeshLambertMaterial({ color: TERRAIN_COLORS[type] });
      const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
      const matrix = new THREE.Matrix4();
      cells.forEach((cell, index) => matrix.compose(this.worldPosition(cell.x, cell.y, type === "hill" ? 0.1 : 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)) && mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      this.terrainMeshes.push(mesh);
      this.disposables.push(mesh);
    }

    for (const node of this.mission.buildNodes) {
      const nodeGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.08, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0xd9c27e, transparent: true, opacity: 0.82 });
      const mesh = new THREE.Mesh(nodeGeometry, material);
      mesh.position.copy(this.worldPosition(node.x, node.y, 0.36));
      mesh.userData.nodeId = node.id;
      scene.add(mesh);
      this.nodeMeshes.set(node.id, mesh);
      this.disposables.push(mesh);
    }
    const towerGeometry = new THREE.ConeGeometry(0.26, 0.62, 6);
    for (const type of ["infantry", "machineGun", "mortar"] as const) {
      const mesh = new THREE.InstancedMesh(towerGeometry, new THREE.MeshLambertMaterial({ color: TOWER_COLORS[type] }), this.mission.buildNodes.length);
      mesh.count = 0;
      scene.add(mesh);
      this.towerMeshes.set(type, mesh);
      this.disposables.push(mesh);
    }

    const enemyGeometry = new THREE.BoxGeometry(0.44, 0.45, 0.44);
    for (const type of ["rifle", "runner", "heavy", "armored"] as const) {
      const mesh = new THREE.InstancedMesh(enemyGeometry, new THREE.MeshLambertMaterial({ color: ENEMY_COLORS[type] }), 64);
      mesh.count = 0;
      scene.add(mesh);
      this.enemyMeshes.set(type, mesh);
      this.disposables.push(mesh);
    }
    const light = new THREE.HemisphereLight(0xf0e8d5, 0x152019, 2.5);
    scene.add(light);
    this.disposables.push(light);
    for (let index = 0; index < 48; index += 1) {
      const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      projectile.visible = false;
      scene.add(projectile);
      this.projectilePool.push(projectile);
      const hit = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true }));
      hit.rotation.x = -Math.PI / 2;
      hit.visible = false;
      scene.add(hit);
      this.hitPool.push(hit);
      this.disposables.push(projectile, hit);
    }
  }

  private worldPosition(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x + 0.5, z, y + 0.5);
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    }, { signal: this.lifecycleAbort.signal });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging || !this.camera) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.camera.position.x -= dx * 0.02 / this.camera.zoom;
      this.camera.position.z -= dy * 0.02 / this.camera.zoom;
      this.camera.updateProjectionMatrix();
      this.lastPointer = { x: event.clientX, y: event.clientY };
    }, { signal: this.lifecycleAbort.signal });
    canvas.addEventListener("pointerup", (event) => {
      if (this.dragging && Math.hypot(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y) < 8) this.selectAt(event.clientX, event.clientY);
      this.dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }, { signal: this.lifecycleAbort.signal });
    canvas.addEventListener("pointercancel", () => { this.dragging = false; }, { signal: this.lifecycleAbort.signal });
    canvas.addEventListener("wheel", (event) => {
      if (!this.camera) return;
      event.preventDefault();
      this.camera.zoom = Math.max(0.75, Math.min(2.2, this.camera.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
      this.camera.updateProjectionMatrix();
    }, { passive: false, signal: this.lifecycleAbort.signal });
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.contextLost = true;
      canvas.classList.add("is-context-lost");
      this.showContextNotice();
    }, { signal: this.lifecycleAbort.signal });
    canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      canvas.classList.remove("is-context-lost");
      this.renderer?.resetState();
      this.hideContextNotice();
      this.resize();
    }, { signal: this.lifecycleAbort.signal });
  }

  private showContextNotice(): void {
    let notice = this.host.querySelector<HTMLElement>("[data-context-notice]");
    if (!notice) {
      notice = document.createElement("div");
      notice.dataset.contextNotice = "true";
      notice.className = "webgl-context-notice";
      notice.setAttribute("role", "alert");
      this.host.append(notice);
    }
    notice.textContent = "三维战场连接中断，正在尝试恢复 GPU 上下文；若未恢复请刷新页面。";
    notice.hidden = false;
  }

  private hideContextNotice(): void {
    const notice = this.host.querySelector<HTMLElement>("[data-context-notice]");
    if (notice) notice.hidden = true;
  }

  private selectAt(clientX: number, clientY: number): void {
    if (!this.renderer || !this.camera || !this.scene) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return;
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    const node = this.mission.buildNodes.find((candidate) => candidate.x === x && candidate.y === y);
    if (node) {
      this.options.onMapSelect({ nodeId: node.id });
      return;
    }
    this.options.onMapSelect(null);
  }

  render(snapshot: SimulationSnapshot): void {
    if (this.contextLost || !this.renderer || !this.camera || !this.scene) return;
    const matrices = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    for (const [type, mesh] of this.towerMeshes) {
      const towers = snapshot.towers.filter((tower) => tower.type === type);
      mesh.count = towers.length;
      towers.forEach((tower, index) => {
        const node = this.mission.buildNodes.find((candidate) => candidate.id === tower.nodeId);
        if (!node) return;
        matrices.compose(this.worldPosition(node.x, node.y, 0.52 + tower.level * 0.06), new THREE.Quaternion(), scale);
        mesh.setMatrixAt(index, matrices);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const [type, mesh] of this.enemyMeshes) {
      const enemies = snapshot.enemies.filter((enemy) => enemy.type === type);
      mesh.count = enemies.length;
      enemies.forEach((enemy, index) => {
        matrices.compose(this.worldPosition(enemy.x, enemy.y, 0.43), new THREE.Quaternion(), scale);
        mesh.setMatrixAt(index, matrices);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.projectilePool.forEach((mesh, index) => {
      const effect = snapshot.projectiles[index];
      mesh.visible = Boolean(effect);
      if (!effect) return;
      const ratio = 1 - effect.lifeTicks / effect.maxLifeTicks;
      mesh.position.lerpVectors(this.worldPosition(effect.x, effect.y, 0.72), this.worldPosition(effect.targetX, effect.targetY, 0.72), ratio);
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(effect.color);
    });
    this.hitPool.forEach((mesh, index) => {
      const effect = snapshot.hitEffects[index];
      mesh.visible = Boolean(effect);
      if (!effect) return;
      mesh.position.copy(this.worldPosition(effect.x, effect.y, 0.75));
      mesh.scale.setScalar(1 + (1 - effect.lifeTicks / effect.maxLifeTicks) * effect.radius * 2);
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(effect.color);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, effect.lifeTicks / effect.maxLifeTicks);
    });
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const aspect = width / height;
    const size = 8;
    this.camera.left = -size * aspect;
    this.camera.right = size * aspect;
    this.camera.top = size;
    this.camera.bottom = -size;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  resourceCounts(): { geometries: number; textures: number } {
    if (!this.renderer) return { geometries: 0, textures: 0 };
    return { geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures };
  }

  dispose(): void {
    this.lifecycleAbort.abort();
    this.resizeObserver?.disconnect();
    for (const object of this.disposables) {
      object.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else if (material) material.dispose();
      });
    }
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.host.replaceChildren();
  }
}
