import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const publicRoot = new URL("../public/assets/", import.meta.url).pathname;
const rankDir = join(publicRoot, "ranks");
const roleDir = join(publicRoot, "roles");
const weaponDir = join(publicRoot, "weapons");
const itemDir = join(publicRoot, "items");
const attachDir = join(publicRoot, "attachments");
const classDir = join(publicRoot, "ui/class");
await Promise.all(
  [rankDir, roleDir, weaponDir, itemDir, attachDir, classDir].map((dir) => mkdir(dir, { recursive: true })),
);

const shell = (body, label, viewBox = "0 0 256 96") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">
<defs><filter id="grain"><feTurbulence baseFrequency=".7" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix in="n" values="0 0 0 0 .18 0 0 0 0 .15 0 0 0 0 .1 0 0 0 .08 0"/><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
<rect width="100%" height="100%" rx="10" fill="#d9caa9"/><g filter="url(#grain)" fill="#34372f" stroke="#24251f" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

const stars = (count, color = "#e8e8df") =>
  Array.from({ length: count }, (_, i) => {
    const x = 64 + (i - (count - 1) / 2) * 36;
    return `<path d="M${x} 18l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="${color}" stroke="#4b4b45"/>`;
  }).join("");

const ranks = {
  "pva-duty": `<circle cx="128" cy="34" r="22" fill="#a33a32"/><path d="M128 16l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#d7b966"/><path d="M70 72h116" stroke="#756546" stroke-width="7"/>`,
  "rok-major-general": `<circle cx="128" cy="34" r="24" fill="#eee9dc"/><path d="M128 10a24 24 0 0 1 0 48 12 12 0 0 0 0-24 12 12 0 0 1 0-24z" fill="#b5443e"/><path d="M128 58a24 24 0 0 1 0-48 12 12 0 0 0 0 24 12 12 0 0 1 0 24z" fill="#3e6484"/>${stars(2)}`,
  "us-major-general": stars(2),
  "us-lieutenant-general": stars(3),
  "us-colonel": `<path d="M128 12l12 14 25-6-13 20 14 16-26-2-12 17-12-17-26 2 14-16-13-20 25 6z" fill="#e8e8df"/><path d="M128 28v25M111 38l17 8 17-8" fill="none" stroke="#55574f" stroke-width="3"/>`,
  "uk-lieutenant-colonel": `<path d="M128 10l10 9 14-2-3 14 8 11-14 4-7 13-8-11-14-4 8-11-3-14 14 2z" fill="#d9c07b"/><path d="M92 68l36-18 36 18-36 16z" fill="#e8e8df"/>`,
  "fr-lieutenant-colonel": Array.from({ length: 5 }, (_, i) => `<rect x="${68 + i * 25}" y="18" width="15" height="56" rx="3" fill="${i === 1 || i === 3 ? "#d8d6ce" : "#c9a24f"}"/>`).join(""),
};
for (const [id, body] of Object.entries(ranks)) await writeFile(join(rankDir, `${id}.svg`), shell(body, id), "utf8");

const roles = {
  rifle: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M16 43L48 20M13 46l7 4 32-24-7-6z" fill="#d5bd87" stroke="#201f1a" stroke-width="2"/>`,
  mg: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M12 38h40M20 33h22M25 38l-8 13M41 38l8 13" fill="none" stroke="#d5bd87" stroke-width="5"/><circle cx="31" cy="31" r="8" fill="#d5bd87"/>`,
  mortar: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M23 49l10-31 8 3-10 31zM14 52h29" fill="#d5bd87" stroke="#201f1a" stroke-width="2"/>`,
  artillery: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M18 46h28l-6 12H24zM28 28h20l8 12H22z" fill="#d5bd87" stroke="#201f1a" stroke-width="2"/>`,
  tank: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M11 38h42l-5 12H16zM22 29h23l5 9H17zM31 23h12v6H29zM43 25h14" fill="#d5bd87" stroke="#201f1a" stroke-width="2"/>`,
  armored_car: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M12 40h40l-4 10H16zM20 30h28l6 10H16zM36 24h14v5" fill="#d5bd87" stroke="#201f1a" stroke-width="2"/><circle cx="22" cy="50" r="5" fill="#d5bd87"/><circle cx="44" cy="50" r="5" fill="#d5bd87"/>`,
  logistics: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M14 42h36v8H14zM20 28h24v14H20z" fill="#d5bd87" stroke="#201f1a" stroke-width="2"/>`,
};
for (const [id, body] of Object.entries(roles))
  await writeFile(join(roleDir, `${id}.svg`), shell(body, `${id} role`, "0 0 64 64"), "utf8");

function rifle({ length = 205, wood = 112, mag = "none", bayonet = false, scope = false, elite = false }) {
  const x = 22,
    y = 47,
    end = x + length;
  let extra = "";
  if (mag === "box") extra = `<path d="M126 51h18l-3 20h-12z"/>`;
  if (mag === "drum") extra = `<circle cx="137" cy="61" r="16"/>`;
  if (mag === "top") extra = `<path d="M112 42l16-24 16 5-12 22z"/>`;
  if (mag === "pan") extra = `<ellipse cx="127" cy="36" rx="28" ry="10"/>`;
  if (scope) extra += `<rect x="118" y="28" width="36" height="8" rx="2"/>`;
  if (elite) extra += `<path d="M210 18l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#c9a24f"/>`;
  return `<path d="M${x} ${y + 3}h${wood}l18-9h${end - x - wood - 18}v8h-${end - x - wood - 20}l-20 9h-${wood - 18}l-18 18H${x + 8}l8-16H${x}z"/>${extra}${bayonet ? `<path d="M${end} ${y + 4}l22-4-22 9z"/>` : ""}<circle cx="102" cy="54" r="5" fill="#d9caa9"/>`;
}
function mortar(scale = 1, elite = false) {
  const w = 12 * scale;
  return `<path d="M110 70l38-52 12 8-34 56z"/><ellipse cx="116" cy="78" rx="42" ry="9"/><path d="M137 55l-39 9M137 55l26 24" fill="none" stroke-width="7"/><ellipse cx="154" cy="22" rx="${w}" ry="7" fill="#d9caa9"/>${elite ? `<path d="M210 18l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#c9a24f"/>` : ""}`;
}
function bazooka(elite = false) {
  return `<rect x="24" y="38" width="205" height="22" rx="8"/><rect x="60" y="31" width="26" height="36" rx="5"/><path d="M132 58v23h18V58M191 38l18-13 14 13"/><circle cx="43" cy="49" r="16" fill="#d9caa9"/>${elite ? `<path d="M210 18l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#c9a24f"/>` : ""}`;
}
function m1919() {
  return `<rect x="55" y="34" width="145" height="30" rx="4"/><rect x="20" y="41" width="40" height="10"/><rect x="100" y="24" width="43" height="12"/><path d="M110 64L74 88M141 64l34 24M126 64v25" fill="none" stroke-width="7"/>`;
}
function tank(kind, elite = false) {
  const body =
    kind === "t34"
      ? `<path d="M33 55l23-26h113l31 26-14 22H49z"/><ellipse cx="126" cy="35" rx="44" ry="22"/><rect x="124" y="13" width="20" height="10"/><path d="M155 30h76v7h-76z"/><circle cx="70" cy="70" r="13" fill="#d9caa9"/><circle cx="105" cy="70" r="13" fill="#d9caa9"/><circle cx="140" cy="70" r="13" fill="#d9caa9"/><circle cx="175" cy="70" r="13" fill="#d9caa9"/>`
      : kind === "ac"
        ? `<path d="M40 52l18-18h120l20 18-10 18H52z"/><path d="M96 34h50l8 12H90z"/><path d="M140 28h48v6h-48z"/><circle cx="70" cy="70" r="12" fill="#d9caa9"/><circle cx="170" cy="70" r="12" fill="#d9caa9"/>`
        : `<path d="M29 54l25-22h128l23 22-12 24H43z"/><path d="M91 34q25-31 70 0z"/><path d="M150 26h84v7h-84z"/><circle cx="66" cy="70" r="13" fill="#d9caa9"/><circle cx="105" cy="70" r="13" fill="#d9caa9"/><circle cx="144" cy="70" r="13" fill="#d9caa9"/><circle cx="183" cy="70" r="13" fill="#d9caa9"/>`;
  return `${body}${elite ? `<path d="M210 18l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#c9a24f"/>` : ""}`;
}
function cart() {
  return `<rect x="60" y="34" width="120" height="36" rx="6"/><circle cx="90" cy="74" r="12" fill="#d9caa9"/><circle cx="160" cy="74" r="12" fill="#d9caa9"/><path d="M70 34l20-16h60l20 16"/>`;
}

const weapons = {
  type38: rifle({ length: 205, wood: 118, bayonet: true }),
  zhongzheng: rifle({ length: 185, wood: 104 }),
  mosin: rifle({ length: 208, wood: 124, bayonet: true }),
  ppsh50: rifle({ length: 150, wood: 80, mag: "drum" }),
  zb26: rifle({ length: 185, wood: 90, mag: "top" }),
  dp28: rifle({ length: 190, wood: 90, mag: "pan" }),
  mortar60: mortar(0.75),
  mortar82: mortar(1.15),
  bazooka: bazooka(),
  t34_85: tank("t34"),
  m1_garand: rifle({ length: 190, wood: 118 }),
  m1_carbine: rifle({ length: 158, wood: 87, mag: "box" }),
  m1919: m1919(),
  m1_mortar: mortar(1.05),
  m2_mortar: mortar(0.8),
  sherman: tank("sherman"),
  lee_enfield: rifle({ length: 200, wood: 110 }),
  bren: rifle({ length: 180, wood: 88, mag: "top" }),
  mac24: rifle({ length: 175, wood: 85, mag: "top" }),
  centurion: tank("sherman"),
  mosin_m44_marksman: rifle({ length: 200, wood: 110, scope: true }),
  m1d_sniper: rifle({ length: 190, wood: 110, scope: true }),
  bar_m1918a2: rifle({ length: 170, wood: 90, mag: "box" }),
  m2hb: m1919(),
  type92_infantry_gun: mortar(1.0),
  type75: mortar(0.95),
  m2a1_howitzer: mortar(1.2),
  mortar120: mortar(1.3),
  m2_4_2_mortar: mortar(1.35),
  qf25: mortar(1.15),
  zis3: mortar(1.1),
  m30_122: mortar(1.25),
  bm13: tank("ac"),
  m1_155: mortar(1.4),
  supply_cart: cart(),
  arsks: rifle({ length: 185, wood: 100, mag: "box" }),
  type53_carbine: rifle({ length: 160, wood: 90 }),
  pps43: rifle({ length: 145, wood: 70, mag: "box" }),
  thompson: rifle({ length: 155, wood: 75, mag: "box" }),
  ppsh_drum_elite: rifle({ length: 150, wood: 80, mag: "drum", elite: true }),
  mosin_scoped_hero: rifle({ length: 208, wood: 120, scope: true, elite: true }),
  rpg43: bazooka(),
  panzerfaust: bazooka(true),
  sg43: m1919(),
  type24_maxim: m1919(),
  m2hb_quad: m1919(),
  mortar70_type: mortar(0.7),
  mortar120_guard: mortar(1.35, true),
  type41_75: mortar(0.9),
  bm13_guards: tank("ac", true),
  ba64: tank("ac"),
  m8_greyhound: tank("ac"),
  su76: tank("ac"),
  m24_chaffee: tank("ac", true),
  t34_85_215: tank("t34", true),
};
for (const [id, body] of Object.entries(weapons))
  await writeFile(join(weaponDir, `${id}.svg`), shell(body, id), "utf8");

const itemSvg = (glyph) =>
  shell(`<circle cx="128" cy="48" r="34" fill="#c9b896"/><text x="128" y="56" text-anchor="middle" font-size="28" fill="#34372f" stroke="none">${glyph}</text>`, "item", "0 0 256 96");
const items = {
  plasma_unit: "血",
  surgeon_kit: "医",
  compressed_ration: "粮",
  bangalore: "爆",
  shaped_charge_elite: "破",
  smoke_screen: "烟",
  corps_arty: "炮",
  night_attack_notes: "夜",
  hero_citation: "奖",
  flare: "信",
};
for (const [id, glyph] of Object.entries(items))
  await writeFile(join(itemDir, `${id}.svg`), itemSvg(glyph), "utf8");

const attachGlyph = {
  engineer_tools: "工",
  pack_train: "马",
  field_telephone: "话",
  ammo_carrier: "弹",
  camouflage_net: "伪",
  winter_kit: "寒",
  medic_team: "卫",
  motor_transport: "车",
  artillery_tractor: "牵",
  scr300_radio: "电",
  rangefinder: "镜",
  t52_vest: "甲",
};
for (const [id, glyph] of Object.entries(attachGlyph))
  await writeFile(join(attachDir, `${id}.svg`), itemSvg(glyph), "utf8");

const classColors = {
  rifle: ["#6b8f5a", "#4f7a3f", "#3d6b2e", "#c9a24f"],
  mg: ["#7a7a7a", "#5c5c5c", "#3f3f3f", "#2a2a2a"],
  fire: ["#4a6f9a", "#3a5f8a", "#a8443a", "#8a2f28"],
  logi: ["#8a6a4e", "#7a5a3e", "#6a4a2e", "#5a3a1e"],
  armor: ["#4a6a6a", "#3a5a5a", "#c9a24f", "#d4b45a"],
};
function classRing(color, stage) {
  const sweep = stage === 0 ? 120 : stage === 1 ? 200 : 360;
  const star = stage >= 3 ? `<path d="M128 28l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#c9a24f"/>` : "";
  return `<circle cx="128" cy="48" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${(sweep / 360) * 214} 214" transform="rotate(-90 128 48)"/>${star}`;
}
const classIds = [
  ["rifle_0", "rifle", 0],
  ["rifle_1", "rifle", 1],
  ["rifle_2", "rifle", 2],
  ["rifle_3", "rifle", 3],
  ["mg_0", "mg", 0],
  ["mg_1", "mg", 1],
  ["mg_2", "mg", 2],
  ["mg_3", "mg", 3],
  ["fire_0", "fire", 0],
  ["fire_1", "fire", 1],
  ["fire_2", "fire", 2],
  ["fire_3", "fire", 3],
  ["logi_0", "logi", 0],
  ["logi_1a", "logi", 1],
  ["logi_1b", "logi", 1],
  ["logi_2", "logi", 2],
  ["logi_3", "logi", 3],
  ["armor_0", "armor", 0],
  ["armor_1", "armor", 1],
  ["armor_2", "armor", 2],
  ["armor_3", "armor", 3],
];
for (const [id, branch, stage] of classIds) {
  const color = classColors[branch][Math.min(stage, 3)];
  await writeFile(join(classDir, `${id}.svg`), shell(classRing(color, stage), id, "0 0 256 96"), "utf8");
}

console.log(
  `generated ${Object.keys(ranks).length} rank, ${Object.keys(roles).length} role, ${Object.keys(weapons).length} weapon, ${Object.keys(items).length} item, ${Object.keys(attachGlyph).length} attachment, ${classIds.length} class assets`,
);
