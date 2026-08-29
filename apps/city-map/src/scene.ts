/**
 * 把 CityModel 变成 three.js 场景对象：全部重复体用 InstancedMesh，
 * 一屏十万级实例仍保持个位数 draw call。
 */

import * as THREE from "three";
import { sampleLane, type CityModel } from "./city";
import { paintCityTexture, paintFarmlandTexture } from "./ground";

export interface CityView {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
  stats: { buildings: number; trees: number; cars: number; instances: number };
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  shadows: { cast: boolean; receive: boolean },
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = shadows.cast;
  mesh.receiveShadow = shadows.receive;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}

/** 坡屋顶：单位尺寸三棱柱（脊线沿 x 轴，底面 1×1，高 1） */
function makeRoofGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // 顶点：底面四角 + 两个脊点
  // prettier-ignore
  const positions = new Float32Array([
    // 前坡
    -0.5, 0, 0.5,   0.5, 0, 0.5,   0.5, 1, 0,
    -0.5, 0, 0.5,   0.5, 1, 0,    -0.5, 1, 0,
    // 后坡
    0.5, 0, -0.5,  -0.5, 0, -0.5, -0.5, 1, 0,
    0.5, 0, -0.5,  -0.5, 1, 0,    0.5, 1, 0,
    // 左山墙
    -0.5, 0, -0.5, -0.5, 0, 0.5,  -0.5, 1, 0,
    // 右山墙
    0.5, 0, 0.5,   0.5, 0, -0.5,  0.5, 1, 0,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildCityView(model: CityModel): CityView {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(obj: T): T => {
    disposables.push(obj);
    return obj;
  };

  // —— 地面 ——
  const cityCanvas = paintCityTexture(model);
  const cityTex = track(new THREE.CanvasTexture(cityCanvas));
  cityTex.colorSpace = THREE.SRGBColorSpace;
  cityTex.anisotropy = 8;
  const groundGeo = track(new THREE.PlaneGeometry(model.half * 2, model.half * 2));
  const groundMat = track(new THREE.MeshLambertMaterial({ map: cityTex }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // —— 外围农田 ——
  const farmTex = track(new THREE.CanvasTexture(paintFarmlandTexture(model.seed)));
  farmTex.colorSpace = THREE.SRGBColorSpace;
  farmTex.wrapS = THREE.RepeatWrapping;
  farmTex.wrapT = THREE.RepeatWrapping;
  farmTex.repeat.set(10, 10);
  const farmGeo = track(new THREE.PlaneGeometry(model.half * 12, model.half * 12));
  const farmMat = track(new THREE.MeshLambertMaterial({ map: farmTex }));
  const farm = new THREE.Mesh(farmGeo, farmMat);
  farm.rotation.x = -Math.PI / 2;
  farm.position.y = -0.6;
  farm.receiveShadow = true;
  group.add(farm);

  // —— 建筑（平顶 / 玻璃 / 民宅三种材质分组） ——
  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  boxGeo.translate(0, 0.5, 0);

  const flats = model.buildings.filter((b) => b.kind === "flat");
  const glasses = model.buildings.filter((b) => b.kind === "glass");
  const houses = model.buildings.filter((b) => b.kind === "house");

  const flatMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const flatMesh = makeInstanced(boxGeo, flatMat, flats.length, { cast: true, receive: true });
  const glassMat = track(
    new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 120, specular: 0x99bbcc }),
  );
  const glassMesh = makeInstanced(boxGeo, glassMat, glasses.length, { cast: true, receive: true });
  const houseMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const houseMesh = makeInstanced(boxGeo, houseMat, houses.length, { cast: true, receive: true });

  const fillBuildings = (mesh: THREE.InstancedMesh, list: typeof flats): void => {
    list.forEach((b, i) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tmpColor.setHex(b.color));
    });
  };
  fillBuildings(flatMesh, flats);
  fillBuildings(glassMesh, glasses);
  // 民宅墙体用浅色，屋顶另用坡屋顶实例
  houses.forEach((b, i) => {
    dummy.position.set(b.x, 0, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    houseMesh.setMatrixAt(i, dummy.matrix);
    houseMesh.setColorAt(i, tmpColor.setHex(0xd9d2c2).offsetHSL(0, 0, (i % 7) * 0.01 - 0.03));
  });
  group.add(flatMesh, glassMesh, houseMesh);

  const roofGeo = track(makeRoofGeometry());
  const roofMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const roofMesh = makeInstanced(roofGeo, roofMat, houses.length, { cast: true, receive: false });
  houses.forEach((b, i) => {
    dummy.position.set(b.x, b.h, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(b.w + 1.2, Math.min(b.d, b.w) * 0.42, b.d + 1.2);
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
    roofMesh.setColorAt(i, tmpColor.setHex(b.color));
  });
  group.add(roofMesh);

  // —— 屋顶设备 ——
  const unitMat = track(new THREE.MeshLambertMaterial({ color: 0x9d9d99 }));
  const unitMesh = makeInstanced(boxGeo, unitMat, model.roofUnits.length, { cast: false, receive: false });
  model.roofUnits.forEach((u, i) => {
    dummy.position.set(u.x, u.y - u.h / 2, u.z);
    dummy.rotation.set(0, u.rot, 0);
    dummy.scale.set(u.w, u.h, u.d);
    dummy.updateMatrix();
    unitMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(unitMesh);

  // —— 树木 ——
  const treeGeo = track(new THREE.IcosahedronGeometry(1, 0));
  const treeMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const treeMesh = makeInstanced(treeGeo, treeMat, model.trees.length, { cast: true, receive: false });
  model.trees.forEach((t, i) => {
    dummy.position.set(t.x, t.h * 0.62, t.z);
    dummy.rotation.set(0, (i % 16) * 0.4, 0);
    dummy.scale.set(t.r, t.h * 0.62, t.r);
    dummy.updateMatrix();
    treeMesh.setMatrixAt(i, dummy.matrix);
    treeMesh.setColorAt(i, tmpColor.setHex(t.color));
  });
  group.add(treeMesh);

  // —— 桥梁 ——
  const bridgeMat = track(new THREE.MeshLambertMaterial({ color: 0xa5a19a }));
  const bridgeMesh = makeInstanced(boxGeo, bridgeMat, model.bridges.length, { cast: true, receive: true });
  model.bridges.forEach((b, i) => {
    dummy.position.set(b.x, 0.4, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(b.len, 1.6, b.width);
    dummy.updateMatrix();
    bridgeMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(bridgeMesh);

  // —— 船只 ——
  const boatMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const boatMesh = makeInstanced(boxGeo, boatMat, model.boats.length, { cast: false, receive: false });
  model.boats.forEach((b, i) => {
    dummy.position.set(b.x, 0.2, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(b.len, 1.4, b.width);
    dummy.updateMatrix();
    boatMesh.setMatrixAt(i, dummy.matrix);
    boatMesh.setColorAt(i, tmpColor.setHex(b.color));
  });
  group.add(boatMesh);

  // —— 车辆（前段动态 + 后段静态停车） ——
  const carGeo = track(new THREE.BoxGeometry(4.4, 1.6, 2));
  carGeo.translate(0, 0.8, 0);
  const carMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const totalCars = model.cars.length + model.parkedCars.length;
  const carMesh = makeInstanced(carGeo, carMat, totalCars, { cast: false, receive: false });
  carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  model.parkedCars.forEach((c, i) => {
    dummy.position.set(c.x, 0, c.z);
    dummy.rotation.set(0, c.rot, 0);
    dummy.scale.set(0.9, 0.9, 0.9);
    dummy.updateMatrix();
    carMesh.setMatrixAt(model.cars.length + i, dummy.matrix);
    carMesh.setColorAt(model.cars.length + i, tmpColor.setHex(c.color));
  });
  model.cars.forEach((c, i) => {
    carMesh.setColorAt(i, tmpColor.setHex(c.color));
  });
  group.add(carMesh);

  const updateCars = (dt: number): void => {
    const cars = model.cars;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!;
      c.t += c.speed * c.dir * dt;
      const lane = model.lanes[c.lane]!;
      const s = sampleLane(lane, c.t);
      if (s.wet && !lane.bridged) {
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.position.set(s.x, -10, s.z);
      } else {
        const laneOffset = (lane.roadWidth * 0.24 + 1.2) * c.dir;
        const nx = Math.sin(s.rot);
        const nz = Math.cos(s.rot);
        dummy.position.set(s.x + nx * laneOffset, s.wet ? 1.4 : 0, s.z + nz * laneOffset);
        dummy.rotation.set(0, c.dir === 1 ? s.rot : s.rot + Math.PI, 0);
        dummy.scale.set(1, 1, 1);
      }
      dummy.updateMatrix();
      carMesh.setMatrixAt(i, dummy.matrix);
    }
    carMesh.instanceMatrix.needsUpdate = true;
  };
  updateCars(0);

  const instances =
    flats.length +
    glasses.length +
    houses.length * 2 +
    model.roofUnits.length +
    model.trees.length +
    model.bridges.length +
    model.boats.length +
    totalCars;

  return {
    group,
    update: (dt) => {
      updateCars(Math.min(dt, 0.1));
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
    stats: {
      buildings: model.buildings.length,
      trees: model.trees.length,
      cars: totalCars,
      instances,
    },
  };
}
