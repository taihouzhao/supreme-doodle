import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { WorldStreamer } from "./streamer";
import { createWorld, worldToChunk } from "./world";

const app = document.getElementById("app")!;
const hudStats = document.getElementById("hud-stats")!;
const hudFps = document.getElementById("hud-fps")!;
const loading = document.getElementById("loading")!;
const btnRegen = document.getElementById("btn-regen") as HTMLButtonElement;
const btnTopdown = document.getElementById("btn-topdown") as HTMLButtonElement;

function detectSoftwareRenderer(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    return /swiftshader|llvmpipe|softpipe|software/i.test(name);
  } catch {
    return false;
  }
}
const qualityParam = new URLSearchParams(window.location.search).get("q");
const lite = qualityParam === "lite" || (qualityParam !== "high" && detectSoftwareRenderer());

const renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: "high-performance" });
renderer.setPixelRatio(lite ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lite;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xbfd3e6);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 4500, 16000);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 10, 40000);
camera.position.set(1500, 3100, 2100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.32;
controls.minDistance = 220;
controls.maxDistance = 10500;
controls.target.set(0, 0, 0);
controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.update();

const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
const shadowSpan = 2800;
sun.shadow.camera.left = -shadowSpan;
sun.shadow.camera.right = shadowSpan;
sun.shadow.camera.top = shadowSpan;
sun.shadow.camera.bottom = -shadowSpan;
sun.shadow.camera.near = 200;
sun.shadow.camera.far = 9000;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xcfe2f3, 0x6b6a58, 0.85));

function followSun(): void {
  const t = controls.target;
  sun.position.set(t.x + 2600, 4200, t.z + 1500);
  sun.target.position.copy(t);
  sun.target.updateMatrixWorld();
}

// —— 方向键 / WASD ——
const held = new Set<string>();
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};
window.addEventListener("keydown", (e) => {
  if (e.code in PAN_KEYS) {
    held.add(e.code);
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  held.delete(e.code);
});

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const pan = new THREE.Vector3();

function applyKeyboardPan(dt: number): void {
  let sx = 0;
  let sz = 0;
  for (const code of held) {
    const d = PAN_KEYS[code];
    if (!d) continue;
    sx += d[0];
    sz += d[1];
  }
  if (sx === 0 && sz === 0) return;
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) {
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
  }
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  const speed = Math.max(220, camera.position.y) * 0.55;
  const inv = 1 / Math.hypot(sx, sz);
  pan.copy(right).multiplyScalar(sx * inv * speed * dt);
  pan.addScaledVector(forward, sz * inv * speed * dt);
  camera.position.add(pan);
  controls.target.add(pan);
}

function readSeedFromHash(): number | null {
  const m = /seed=(\d+)/.exec(window.location.hash);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v >>> 0 : null;
}

let seed = readSeedFromHash() ?? (Math.random() * 0xffffffff) >>> 0;
let streamer = new WorldStreamer(createWorld(seed), lite);
scene.add(streamer.group);

function setSeed(next: number): void {
  seed = next >>> 0;
  window.location.hash = `seed=${seed}`;
  streamer.reset(createWorld(seed));
  loading.classList.remove("hide");
  hudStats.textContent = "生成中…";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const t0 = performance.now();
      streamer.sync(controls.target.x, controls.target.z, camera.position.y);
      streamer.grow(9);
      const ms = Math.round(performance.now() - t0);
      const s = streamer.stats(controls.target.x, controls.target.z);
      writeHud(s, ms);
      loading.classList.add("hide");
    });
  });
}

function writeHud(s: ReturnType<WorldStreamer["stats"]>, ms?: number): void {
  const { cx, cz } = worldToChunk(controls.target.x, controls.target.z);
  hudStats.textContent =
    `种子 ${seed} · 区块 (${cx}, ${cz}) ×${s.chunks}` +
    (s.pending ? ` +${s.pending}` : "") +
    ` · 建筑 ${s.buildings.toLocaleString()} · 树木 ${s.trees.toLocaleString()}` +
    ` · 车辆 ${s.cars.toLocaleString()} · 实例 ${s.instances.toLocaleString()}` +
    (ms !== undefined ? ` · 生成 ${ms}ms` : "") +
    (lite ? " · 简化画质" : "");
}

btnRegen.addEventListener("click", () => {
  setSeed((Math.random() * 0xffffffff) >>> 0);
});

let flyFrom: THREE.Vector3 | null = null;
let flyTo: THREE.Vector3 | null = null;
let flyT = 0;
btnTopdown.addEventListener("click", () => {
  const target = controls.target.clone();
  flyFrom = camera.position.clone();
  flyTo = new THREE.Vector3(target.x, 5200, target.z + 1);
  flyT = 0;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let fpsAccum = 0;
let fpsFrames = 0;
let hudAccum = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  applyKeyboardPan(dt);
  if (flyFrom && flyTo) {
    flyT += dt / 1.1;
    const k = flyT >= 1 ? 1 : 1 - Math.pow(1 - flyT, 3);
    camera.position.lerpVectors(flyFrom, flyTo, k);
    if (flyT >= 1) {
      flyFrom = null;
      flyTo = null;
    }
  }
  controls.update();
  followSun();
  streamer.sync(controls.target.x, controls.target.z, camera.position.y);
  streamer.grow(lite ? 1 : 2);
  streamer.update(dt);
  renderer.render(scene, camera);

  fpsAccum += dt;
  fpsFrames++;
  hudAccum += dt;
  if (fpsAccum >= 0.5) {
    hudFps.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS`;
    fpsAccum = 0;
    fpsFrames = 0;
  }
  if (hudAccum >= 0.4) {
    writeHud(streamer.stats(controls.target.x, controls.target.z));
    hudAccum = 0;
  }
}

followSun();
setSeed(seed);
animate();
