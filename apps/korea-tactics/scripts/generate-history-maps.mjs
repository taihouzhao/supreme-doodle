import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../History/", import.meta.url).pathname;

const battles = [
  {
    dir: "m1-onjong", title: "温井—两水洞战术切片", subtitle: "1950-10-25 · 北在上 · 非等比例",
    roads: ["M360 30 C350 125 385 245 350 405"],
    waters: ["M35 354 C190 330 245 380 420 350 S610 342 685 365"],
    areas: [[235,145,245,120,"伏击峡谷"]],
    points: [[360,62,"北镇方向","route"],[282,176,"239.8 / 216 / 409.5 高地","hill"],[350,345,"温井","town"],[530,360,"九龙江","water"]],
    arrows: [[235,150,340,205,"两翼伏击"],[490,165,390,220,""]],
  },
  {
    dir: "m2-unsan", title: "云山城—南撤公路战术切片", subtitle: "1950-11-01—03 · 桥名不确定，按功能标注",
    roads: ["M360 35 C345 140 365 235 415 405"], waters: ["M40 268 C190 238 320 300 680 255"],
    areas: [[250,92,225,122,"云山防御区"]],
    points: [[360,145,"云山城","town"],[410,268,"城南公路桥","bridge"],[425,390,"南撤方向","route"]],
    arrows: [[170,95,315,135,"西北突击"],[560,80,410,135,"东北突击"],[510,330,425,285,"封锁退路"]],
  },
  {
    dir: "m3-chongchon", title: "三所里—龙源里公路阻断切片", subtitle: "1950-11-28—30 · 聚焦第38军敌后穿插",
    roads: ["M80 285 C240 260 450 300 655 265","M315 35 C330 150 390 240 470 390"], waters: ["M35 95 C170 120 250 80 680 115"],
    areas: [[215,180,330,135,"南撤道路走廊"]],
    points: [[250,270,"三所里","town"],[495,278,"龙源里","town"],[470,385,"顺川方向","route"],[350,105,"清川江战线（战役背景）","water"]],
    arrows: [[190,390,245,295,"急行穿插"],[610,390,505,300,""]],
  },
  {
    dir: "m4-chosin", title: "柳潭里—死鹰岭—下碣隅里", subtitle: "1950-11-27—12-04 · 长津湖西岸唯一主补给路",
    roads: ["M155 55 C230 120 280 205 395 355"], waters: ["M505 25 C465 125 540 220 490 415"],
    areas: [[205,142,245,145,"死鹰岭道路瓶颈"]],
    points: [[150,58,"柳潭里","town"],[302,215,"死鹰岭 / Toktong Pass","hill"],[405,360,"下碣隅里","town"],[565,220,"长津湖","water"]],
    arrows: [[180,305,300,235,"断路攻击"],[420,115,320,200,""]],
  },
  {
    dir: "m5-third-offensive", title: "临津江—议政府突破走廊", subtitle: "1950-12-31—1951-01-04 · 战役级纵深压缩为走廊",
    roads: ["M360 35 C350 150 390 270 375 405"], waters: ["M35 130 C205 95 360 160 685 120"],
    areas: [[245,155,250,150,"议政府北侧山口走廊"]],
    points: [[360,125,"临津江渡河带","bridge"],[370,255,"北侧山口","hill"],[375,390,"议政府 / 汉城方向","town"]],
    arrows: [[285,50,350,105,"夜间突破"],[445,55,380,108,""]],
  },
  {
    dir: "m6-hoengsong", title: "横城北部突出部战术切片", subtitle: "1951-02-11—13 · 山谷公路与两翼迂回",
    roads: ["M360 35 C330 150 380 255 350 405","M350 295 C240 315 165 340 80 385"], waters: [],
    areas: [[230,95,290,205,"韩军突出部"]],
    points: [[350,315,"横城北侧公路节点","town"],[95,385,"砥平里方向","route"],[360,55,"洪川方向","route"]],
    arrows: [[150,150,310,250,"西翼迂回"],[570,145,405,245,"东翼迂回"]],
  },
  {
    dir: "m7-chipyongni", title: "砥平里环形阵地与解围轴", subtitle: "1951-02-13—15 · 守军守住；玩家任务为施压后脱离",
    roads: ["M360 420 C365 325 350 260 360 170"], waters: [],
    areas: [[225,105,270,205,"美法环形防御圈"]],
    points: [[360,205,"砥平里","town"],[360,405,"装甲解围来向","route"],[350,45,"北撤山路","route"]],
    arrows: [[360,375,360,290,"克伦贝特遣队"],[180,225,250,215,"外线压迫"],[540,220,470,212,""]],
  },
  {
    dir: "m8-imjin", title: "临津江—雪马里—235高地", subtitle: "1951-04-22—25 · 北岸渡河后沿谷地逐次推进",
    roads: ["M350 55 C335 155 365 280 395 405"], waters: ["M35 115 C205 150 390 80 685 125"],
    areas: [[275,140,190,200,"雪马里谷地"]],
    points: [[350,118,"临津江渡口","bridge"],[365,255,"雪马里","town"],[400,365,"235高地 / Gloster Hill","hill"]],
    arrows: [[300,45,340,95,"夜渡"],[350,145,365,225,""]],
  },
  {
    dir: "m9-cheorwon", title: "铁原南侧多道阻击线", subtitle: "1951-05末—06初 · 联合国军自南向北追击",
    roads: ["M360 420 C350 305 385 175 360 30"], waters: [],
    areas: [[180,115,360,215,"铁原盆地与道路走廊"]],
    points: [[360,55,"铁原 / 北撤纵深","town"],[260,175,"第二阻击线","hill"],[455,250,"第一阻击线","hill"],[360,405,"涟川方向（追击来向）","route"]],
    arrows: [[315,385,340,300,"步坦追击"],[410,385,385,300,""]],
  },
  {
    dir: "m10-triangle-hill", title: "五圣山南麓两高地", subtitle: "1952-10-14—11-25 · 表面阵地—坑道—反击",
    roads: ["M360 415 C345 315 370 235 360 140"], waters: [],
    areas: [[190,170,340,150,"3.7 km²核心战场"]],
    points: [[360,55,"五圣山纵深","hill"],[270,215,"597.9高地","hill"],[455,235,"537.7北山","hill"],[350,305,"上甘岭村 / 坑道后口","town"],[360,405,"金化 / 进攻来向","route"]],
    arrows: [[300,390,280,250,"美7师方向"],[450,390,450,270,"韩2师方向"]],
  },
  {
    dir: "m11-pork-chop", title: "猪排山单一前哨山脊", subtitle: "1953-07-06—11 · 前哨并非两座相离山头",
    roads: ["M360 415 C350 330 370 260 360 195"], waters: [],
    areas: [[190,145,340,135,"猪排山壕沟—地堡体系"]],
    points: [[360,55,"志愿军主阵地","route"],[275,210,"西支撑点","hill"],[445,220,"东支撑点","hill"],[360,405,"美军主抵抗线 / 增援来向","route"]],
    arrows: [[310,70,300,180,"夜雨接近"],[420,70,420,185,""]],
  },
  {
    dir: "m12-kumsong", title: "金城战役中央集团：轿岩山切片", subtitle: "1953-07-13—16 · 不与东翼北汉江混画",
    roads: ["M360 420 C350 310 380 200 360 35"], waters: ["M35 365 C210 335 410 390 685 350"],
    areas: [[160,120,410,195,"轿岩山三峰坚固阵地"]],
    points: [[360,55,"志愿军进攻出发线","route"],[245,220,"西峰 / 主峰","hill"],[360,190,"中峰","hill"],[475,225,"东峰","hill"],[410,355,"金城川（纵深线）","water"]],
    arrows: [[295,65,265,180,"中央集团突击"],[420,65,400,160,""]],
  },
];

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function icon(x, y, type) {
  if (type === "town") return `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" fill="#cda96b" stroke="#281f18"/>`;
  if (type === "hill") return `<path d="M${x - 12} ${y + 8} L${x} ${y - 10} L${x + 12} ${y + 8}Z" fill="#87906c" stroke="#281f18"/>`;
  if (type === "bridge") return `<path d="M${x - 11} ${y}H${x + 11} M${x - 7} ${y - 5}V${y + 5} M${x + 7} ${y - 5}V${y + 5}" stroke="#d8bd86" stroke-width="4"/>`;
  if (type === "water") return `<path d="M${x - 12} ${y}q6-6 12 0t12 0" fill="none" stroke="#7fa1a1" stroke-width="4"/>`;
  return `<circle cx="${x}" cy="${y}" r="7" fill="#c47159" stroke="#281f18"/>`;
}

function svg(b) {
  const areas = b.areas.map(([x,y,w,h,label]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w,h)/2}" fill="#9d8c6630" stroke="#9d8c66" stroke-dasharray="7 7"/><text x="${x+w/2}" y="${y+18}" text-anchor="middle" class="area">${esc(label)}</text>`).join("");
  const roads = b.roads.map(d => `<path d="${d}" class="road"/>`).join("");
  const waters = b.waters.map(d => `<path d="${d}" class="water"/>`).join("");
  const points = b.points.map(([x,y,label,type]) => `${icon(x,y,type)}<text x="${x+16}" y="${y+5}" class="label">${esc(label)}</text>`).join("");
  const arrows = b.arrows.map(([x1,y1,x2,y2,label]) => `<path d="M${x1} ${y1} L${x2} ${y2}" class="arrow" marker-end="url(#arrow)"/>${label ? `<text x="${(x1+x2)/2}" y="${(y1+y2)/2-8}" text-anchor="middle" class="arrow-label">${esc(label)}</text>` : ""}`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 440" role="img" aria-labelledby="title desc">
<title id="title">${esc(b.title)}</title><desc id="desc">${esc(b.subtitle)}。依据档案制作的方位关系示意图，不代表精确比例或国界。</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#b94f45"/></marker><filter id="paper"><feTurbulence baseFrequency=".8" numOctaves="3" stitchTiles="stitch" type="fractalNoise" result="n"/><feColorMatrix in="n" values="0 0 0 0 0.25 0 0 0 0 0.20 0 0 0 0 0.14 0 0 0 .08 0"/><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
<style>.label{font:600 14px system-ui,"Noto Sans SC",sans-serif;fill:#e9dcc1;paint-order:stroke;stroke:#211b16;stroke-width:3px}.area{font:12px system-ui,"Noto Sans SC",sans-serif;fill:#bfae88}.road{fill:none;stroke:#c8ae79;stroke-width:12;stroke-linecap:round;stroke-dasharray:18 5}.water{fill:none;stroke:#658d92;stroke-width:20;stroke-linecap:round;opacity:.9}.arrow{stroke:#b94f45;stroke-width:4;fill:none}.arrow-label{font:600 12px system-ui,"Noto Sans SC",sans-serif;fill:#e59a83;paint-order:stroke;stroke:#211b16;stroke-width:3px}.title{font:700 20px system-ui,"Noto Sans SC",sans-serif;fill:#f0e1c4}.sub{font:12px system-ui,"Noto Sans SC",sans-serif;fill:#b9a98c}</style>
<rect width="720" height="440" rx="16" fill="#29251f"/><path d="M0 80H720M0 160H720M0 240H720M0 320H720M120 0V440M240 0V440M360 0V440M480 0V440M600 0V440" stroke="#4a4235" stroke-width="1" opacity=".45"/>
<g filter="url(#paper)">${waters}${roads}${areas}${arrows}${points}</g>
<rect x="16" y="14" width="688" height="50" rx="8" fill="#181511dd"/><text x="30" y="38" class="title">${esc(b.title)}</text><text x="30" y="56" class="sub">${esc(b.subtitle)}</text>
<g transform="translate(674 78)"><path d="M0 25V0" stroke="#e8d8b7" stroke-width="3" marker-end="url(#arrow)"/><text x="0" y="39" text-anchor="middle" class="sub">北</text></g>
<text x="16" y="427" class="sub">档案制图：方向关系示意 · 实线/虚线仅供关卡设计，不用于导航或领土表达</text>
</svg>`;
}

for (const battle of battles) {
  const dir = join(root, battle.dir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "map-reference.svg"), svg(battle), "utf8");
}

console.log(`generated ${battles.length} archive maps`);
