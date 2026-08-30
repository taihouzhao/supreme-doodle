/**
 * 把一个 ChunkModel 变成 three.js Group：InstancedMesh + 分块地面贴图。
 */

import * as THREE from "three";
import { sampleLane, type ChunkModel } from "./city";
import { paintChunkTexture } from "./ground";
import type { World } from "./world";

export interface ChunkView {
  group: THREE.Group;
  update: (dt: number) => void;
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
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.castShadow = shadows.cast;
  mesh.receiveShadow = shadows.receive;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.count = count;
  return mesh;
}

function makeRoofGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // prettier-ignore
  const positions = new Float32Array([
    -0.5, 0, 0.5,   0.5, 0, 0.5,   0.5, 1, 0,
    -0.5, 0, 0.5,   0.5, 1, 0,    -0.5, 1, 0,
    0.5, 0, -0.5,  -0.5, 0, -0.5, -0.5, 1, 0,
    0.5, 0, -0.5,  -0.5, 1, 0,    0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5,  -0.5, 1, 0,
    0.5, 0, 0.5,   0.5, 0, -0.5,  0.5, 1, 0,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export interface ViewOptions {
  lite?: boolean;
}

export function buildChunkView(world: World, model: ChunkModel, opts: ViewOptions = {}): ChunkView {
  const lite = opts.lite === true;
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(obj: T): T => {
    disposables.push(obj);
    return obj;
  };

  const cityCanvas = paintChunkTexture(world, model, lite ? 512 : 1024);
  const cityTex = track(new THREE.CanvasTexture(cityCanvas));
  cityTex.colorSpace = THREE.SRGBColorSpace;
  cityTex.anisotropy = 4;
  const groundGeo = track(new THREE.PlaneGeometry(model.size + 2, model.size + 2));
  const groundMat = track(new THREE.MeshLambertMaterial({ map: cityTex }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(model.originX + model.size / 2, 0, model.originZ + model.size / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  boxGeo.translate(0, 0.5, 0);

  const flats = model.buildings.filter((b) => b.kind === "flat");
  const glasses = model.buildings.filter((b) => b.kind === "glass");
  const houses = model.buildings.filter((b) => b.kind === "house");

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

  if (flats.length) {
    const mesh = makeInstanced(boxGeo, track(new THREE.MeshLambertMaterial({ color: 0xffffff })), flats.length, { cast: true, receive: true });
    fillBuildings(mesh, flats);
    group.add(mesh);
  }
  if (glasses.length) {
    const mesh = makeInstanced(
      boxGeo,
      track(new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 120, specular: 0x99bbcc })),
      glasses.length,
      { cast: true, receive: true },
    );
    fillBuildings(mesh, glasses);
    group.add(mesh);
  }
  if (houses.length) {
    const houseMesh = makeInstanced(boxGeo, track(new THREE.MeshLambertMaterial({ color: 0xffffff })), houses.length, { cast: true, receive: true });
    houses.forEach((b, i) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      houseMesh.setMatrixAt(i, dummy.matrix);
      houseMesh.setColorAt(i, tmpColor.setHex(0xd9d2c2).offsetHSL(0, 0, (i % 7) * 0.01 - 0.03));
    });
    group.add(houseMesh);

    const roofMesh = makeInstanced(track(makeRoofGeometry()), track(new THREE.MeshLambertMaterial({ color: 0xffffff })), houses.length, {
      cast: true,
      receive: false,
    });
    houses.forEach((b, i) => {
      dummy.position.set(b.x, b.h, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(b.w + 1.2, Math.min(b.d, b.w) * 0.42, b.d + 1.2);
      dummy.updateMatrix();
      roofMesh.setMatrixAt(i, dummy.matrix);
      roofMesh.setColorAt(i, tmpColor.setHex(b.color));
    });
    group.add(roofMesh);
  }

  const roofUnits = lite ? [] : model.roofUnits;
  if (roofUnits.length) {
    const unitMesh = makeInstanced(boxGeo, track(new THREE.MeshLambertMaterial({ color: 0x9d9d99 })), roofUnits.length, { cast: false, receive: false });
    roofUnits.forEach((u, i) => {
      dummy.position.set(u.x, u.y - u.h / 2, u.z);
      dummy.rotation.set(0, u.rot, 0);
      dummy.scale.set(u.w, u.h, u.d);
      dummy.updateMatrix();
      unitMesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(unitMesh);
  }

  const trees = lite ? model.trees.filter((_, i) => i % 3 === 0) : model.trees;
  if (trees.length) {
    const treeMesh = makeInstanced(track(new THREE.IcosahedronGeometry(1, 0)), track(new THREE.MeshLambertMaterial({ color: 0xffffff })), trees.length, {
      cast: true,
      receive: false,
    });
    trees.forEach((t, i) => {
      dummy.position.set(t.x, t.h * 0.62, t.z);
      dummy.rotation.set(0, (i % 16) * 0.4, 0);
      const r = lite ? t.r * 1.35 : t.r;
      dummy.scale.set(r, t.h * 0.62, r);
      dummy.updateMatrix();
      treeMesh.setMatrixAt(i, dummy.matrix);
      treeMesh.setColorAt(i, tmpColor.setHex(t.color));
    });
    group.add(treeMesh);
  }

  if (model.bridges.length) {
    const bridgeMesh = makeInstanced(boxGeo, track(new THREE.MeshLambertMaterial({ color: 0xa5a19a })), model.bridges.length, { cast: true, receive: true });
    model.bridges.forEach((b, i) => {
      dummy.position.set(b.x, 0.4, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(b.len, 1.6, b.width);
      dummy.updateMatrix();
      bridgeMesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(bridgeMesh);
  }

  if (model.boats.length) {
    const boatMesh = makeInstanced(boxGeo, track(new THREE.MeshLambertMaterial({ color: 0xffffff })), model.boats.length, { cast: false, receive: false });
    model.boats.forEach((b, i) => {
      dummy.position.set(b.x, 0.2, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(b.len, 1.4, b.width);
      dummy.updateMatrix();
      boatMesh.setMatrixAt(i, dummy.matrix);
      boatMesh.setColorAt(i, tmpColor.setHex(b.color));
    });
    group.add(boatMesh);
  }

  const totalCars = model.cars.length + model.parkedCars.length;
  let updateCars = (_dt: number): void => {};
  if (totalCars) {
    const carGeo = track(new THREE.BoxGeometry(4.4, 1.6, 2));
    carGeo.translate(0, 0.8, 0);
    const carMesh = makeInstanced(carGeo, track(new THREE.MeshLambertMaterial({ color: 0xffffff })), totalCars, { cast: false, receive: false });
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

    updateCars = (dt: number): void => {
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
  }

  const instances = flats.length + glasses.length + houses.length * 2 + roofUnits.length + trees.length + model.bridges.length + model.boats.length + totalCars;

  return {
    group,
    update: (dt) => updateCars(Math.min(dt, 0.1)),
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
    stats: {
      buildings: model.buildings.length,
      trees: trees.length,
      cars: totalCars,
      instances,
    },
  };
}
