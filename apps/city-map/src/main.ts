import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { generateCity, CITY_SIZE } from "./city";
import { buildCityView, type CityView } from "./scene";

const app = document.getElementById("app")!;
const hudStats = document.getElementById("hud-stats")!;
const hudFps = document.getElementById("hud-fps")!;
const loading = document.getElementById("loading")!;
const btnRegen = document.getElementById("btn-regen") as HTMLButtonElement;
const btnTopdown = document.getElementById("btn-topdown") as HTMLButtonElement;

// —— 渲染器 ——
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

// —— 场景 / 雾 / 天空 ——
const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xbfd3e6);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 4500, 16000);

// —— 相机与控制 ——
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

// —— 光照：正午偏西太阳 + 天空环境光 ——
const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.position.set(2600, 4200, 1500);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const shadowSpan = CITY_SIZE * 0.62;
sun.shadow.camera.left = -shadowSpan;
sun.shadow.camera.right = shadowSpan;
sun.shadow.camera.top = shadowSpan;
sun.shadow.camera.bottom = -shadowSpan;
sun.shadow.camera.near = 500;
sun.shadow.camera.far = 12000;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcfe2f3, 0x6b6a58, 0.85));

// —— 城市构建 / 重建 ——
let view: CityView | null = null;
let seed = readSeedFromHash() ?? (Math.random() * 0xffffffff) >>> 0;

function readSeedFromHash(): number | null {
  const m = /seed=(\d+)/.exec(window.location.hash);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v >>> 0 : null;
}

function rebuild(newSeed: number): void {
  seed = newSeed >>> 0;
  window.location.hash = `seed=${seed}`;
  loading.classList.remove("hide");
  hudStats.textContent = "生成中…";
  // 等一帧让 loading 层先显示出来
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (view) {
        scene.remove(view.group);
        view.dispose();
      }
      const t0 = performance.now();
      const model = generateCity(seed);
      view = buildCityView(model);
      scene.add(view.group);
      const ms = Math.round(performance.now() - t0);
      const s = view.stats;
      hudStats.textContent =
        `种子 ${seed} · 建筑 ${s.buildings.toLocaleString()} · 树木 ${s.trees.toLocaleString()}` +
        ` · 车辆 ${s.cars.toLocaleString()} · 实例 ${s.instances.toLocaleString()} · 生成 ${ms}ms`;
      loading.classList.add("hide");
    });
  });
}

btnRegen.addEventListener("click", () => {
  rebuild((Math.random() * 0xffffffff) >>> 0);
});

// —— 正射俯瞰：平滑飞到目标正上方 ——
let flyFrom: THREE.Vector3 | null = null;
let flyTo: THREE.Vector3 | null = null;
let flyT = 0;
btnTopdown.addEventListener("click", () => {
  const target = controls.target.clone();
  flyFrom = camera.position.clone();
  flyTo = new THREE.Vector3(target.x, 5200, target.z + 1);
  flyT = 0;
});

// —— 自适应窗口 ——
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// —— 主循环 ——
const clock = new THREE.Clock();
let fpsAccum = 0;
let fpsFrames = 0;
function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
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
  view?.update(dt, clock.elapsedTime);
  renderer.render(scene, camera);
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    hudFps.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS`;
    fpsAccum = 0;
    fpsFrames = 0;
  }
}

rebuild(seed);
animate();
