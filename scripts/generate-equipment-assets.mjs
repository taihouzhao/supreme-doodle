import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const publicRoot = new URL("../public/assets/", import.meta.url).pathname;
const rankDir = join(publicRoot, "ranks");
const roleDir = join(publicRoot, "roles");
const weaponDir = join(publicRoot, "weapons");
await Promise.all([rankDir, roleDir, weaponDir].map((dir) => mkdir(dir, { recursive: true })));

const shell = (body, label, viewBox = "0 0 256 96") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">
<defs><filter id="grain"><feTurbulence baseFrequency=".7" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix in="n" values="0 0 0 0 .18 0 0 0 0 .15 0 0 0 0 .1 0 0 0 .08 0"/><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
<rect width="100%" height="100%" rx="10" fill="#d9caa9"/><g filter="url(#grain)" fill="#34372f" stroke="#24251f" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

const stars = (count, color = "#e8e8df") => Array.from({ length: count }, (_, i) => {
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
  tank: `<circle cx="32" cy="32" r="27" fill="#514f42"/><path d="M11 38h42l-5 12H16zM22 29h23l5 9H17zM31 23h12v6H29zM43 25h14" fill="#d5bd87" stroke="#201f1a" stroke-width="2"/>`,
};
for (const [id, body] of Object.entries(roles)) await writeFile(join(roleDir, `${id}.svg`), shell(body, `${id} role`, "0 0 64 64"), "utf8");

function rifle({ length = 205, wood = 112, mag = "none", bayonet = false }) {
  const x = 22, y = 47, end = x + length;
  let extra = "";
  if (mag === "box") extra = `<path d="M126 51h18l-3 20h-12z"/>`;
  if (mag === "drum") extra = `<circle cx="137" cy="61" r="16"/>`;
  if (mag === "top") extra = `<path d="M112 42l16-24 16 5-12 22z"/>`;
  if (mag === "pan") extra = `<ellipse cx="127" cy="36" rx="28" ry="10"/>`;
  return `<path d="M${x} ${y+3}h${wood}l18-9h${end-x-wood-18}v8h-${end-x-wood-20}l-20 9h-${wood-18}l-18 18H${x+8}l8-16H${x}z"/>${extra}${bayonet ? `<path d="M${end} ${y+4}l22-4-22 9z"/>` : ""}<circle cx="102" cy="54" r="5" fill="#d9caa9"/>`;
}
function mortar(scale = 1) {
  const w = 12 * scale;
  return `<path d="M110 70l38-52 12 8-34 56z"/><ellipse cx="116" cy="78" rx="42" ry="9"/><path d="M137 55l-39 9M137 55l26 24" fill="none" stroke-width="7"/><ellipse cx="154" cy="22" rx="${w}" ry="7" fill="#d9caa9"/>`;
}
function bazooka() { return `<rect x="24" y="38" width="205" height="22" rx="8"/><rect x="60" y="31" width="26" height="36" rx="5"/><path d="M132 58v23h18V58M191 38l18-13 14 13"/><circle cx="43" cy="49" r="16" fill="#d9caa9"/>`; }
function m1919() { return `<rect x="55" y="34" width="145" height="30" rx="4"/><rect x="20" y="41" width="40" height="10"/><rect x="100" y="24" width="43" height="12"/><path d="M110 64L74 88M141 64l34 24M126 64v25" fill="none" stroke-width="7"/>`; }
function tank(kind) {
  if (kind === "t34") return `<path d="M33 55l23-26h113l31 26-14 22H49z"/><ellipse cx="126" cy="35" rx="44" ry="22"/><rect x="124" y="13" width="20" height="10"/><path d="M155 30h76v7h-76z"/><circle cx="70" cy="70" r="13" fill="#d9caa9"/><circle cx="105" cy="70" r="13" fill="#d9caa9"/><circle cx="140" cy="70" r="13" fill="#d9caa9"/><circle cx="175" cy="70" r="13" fill="#d9caa9"/>`;
  return `<path d="M29 54l25-22h128l23 22-12 24H43z"/><path d="M91 34q25-31 70 0z"/><path d="M150 26h84v7h-84z"/><circle cx="66" cy="70" r="13" fill="#d9caa9"/><circle cx="105" cy="70" r="13" fill="#d9caa9"/><circle cx="144" cy="70" r="13" fill="#d9caa9"/><circle cx="183" cy="70" r="13" fill="#d9caa9"/>`;
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
  sherman: tank("sherman"),
};
for (const [id, body] of Object.entries(weapons)) await writeFile(join(weaponDir, `${id}.svg`), shell(body, id), "utf8");

console.log(`generated ${Object.keys(ranks).length} rank, ${Object.keys(roles).length} role, ${Object.keys(weapons).length} weapon assets`);
