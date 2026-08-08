# 美术方向与生成记录

全部生成图均采用内置 image generation 路径生成，再复制到 `public/assets/`。主角肖像只生成一次并在所有关卡复用；当前 23 位历史将领均有稳定肖像映射，8 张地图兵种头像和 16 张地形从固定网格母版裁切。金钟五、钟国楚因本轮史实纠错单独补绘，并沿用相同裁切、色调与光照。所有将领图均是风格化重建，不冒充档案原照。

## 统一视觉规范

- 媒介：将领/兵种采用克制的上色档案照质感，地形采用俯视水粉贴图，功能图标采用单色军用手册式 SVG。
- 色彩：志愿军为低饱和橄榄绿、卡其、木色；联合国军增加低饱和砖红识别色。
- 年代：只允许1950—1953年服装、钢盔、枪械与车辆轮廓。
- 禁止：现代迷彩、战术背心、导轨光学瞄具、M16、M249、AK系、RPG-7、现代肩章和现代装甲车辆。
- 肖像用途：游戏化复合绘画，不冒充档案照片。

## 2026-08-08 刷新提示词记录

以下是本轮资产母版采用的提示词集合；所有调用均使用产品内置图像生成模式。

### 志愿军历史将领（早期 5 人母版，已局部废止）

下列提示词是早期生成记录，其中“吴瑞林”对应的旧图已不再映射到任何关卡；M11 已按史料改用钟国楚。保留记录只为资产溯源，不代表当前史实结论。

```text
Create a rigid five-panel Korean War commander portrait atlas: Wen Yucheng, Liang Xingchu, Fu Chongbi, Wu Ruilin, Yang Yong. Historically grounded colorized archival-photo game portraits, chest-up, matching war-time age, plain 1950–1953 Chinese People's Volunteers field uniform and cap, no shoulder boards, no 1955 rank insignia, no invented medals. Unified muted olive/khaki/charcoal grading, consistent crop and lighting, exact named order, no text, flags, watermark or extra people.
```

### 本轮补绘：金钟五与钟国楚

```text
Kim Jong-oh: warm sepia/olive restored 1950s archival game portrait, centered chest-up, historically plausible 1950 Republic of Korea Army field uniform, no text or watermark; clearly presented as a stylized reconstruction rather than an original photograph.

Zhong Guochu: warm sepia/olive restored 1953 archival game portrait, centered chest-up, Chinese People's Volunteers duty-system field uniform with no rank shoulder boards or rank insignia, no text or watermark; clearly presented as a stylized reconstruction rather than an original photograph.
```

### 联合国军历史将领（两组母版）

```text
Group A, exact order: Paik Sun-yup (ROK major general), Hobart R. Gay (US major general), Walton H. Walker (US lieutenant general), Edward M. Almond (US major-general-period portrait), Paul L. Freeman Jr. (US colonel), Ralph Monclar (temporary French lieutenant colonel). Group B, exact order: James Carne (British lieutenant colonel), James Van Fleet (US lieutenant general), Wayne C. Smith (US major general), Arthur Trudeau (US major general), Maxwell Taylor (US lieutenant general). Colorized 1950–1953 archival-photo game portraits, historically plausible age and service uniform, same chest-up crop and neutral field-map background. No text, watermark, flags, anachronistic ribbons or modern uniform.
```

### 地图兵种人物头像（4×2母版）

```text
Exact 4-column by 2-row atlas of square head-and-shoulders military portrait photographs. Columns: rifleman, machine-gunner, mortar crewman, tank crewman. Top row Chinese People's Volunteers; bottom row United Nations forces. 1950–1953 uniforms and headgear only, stable face and crop, subdued colorized archival-photo finish, no full weapon blocking the face, no role symbol, text, rank, flag, watermark, modern camouflage or post-war equipment. Role is identified in UI by a separate small icon.
```

### 常态与雪地地形（各4×2母版）

```text
Top-down orthographic Korean War tactics terrain atlas, exact 4×2 equal square panels. Order: plain, vertical dirt road, Korean pine forest, rocky contour hill / period mountain village, field trenches and sandbags, vertical river, sheer cliff. Restrained hand-painted gouache, muted 1950s field-map palette, readable at 128px, no people, vehicle, weapon, text, border or modern object. Produce a matching deep-winter variant with snow, ice shelves and the identical panel order.
```

## 主角标准像提示词

```text
Use case: historical-scene
Asset type: square commander portrait for a 1950-1953 Korean War turn-based strategy game
Primary request: Create the definitive portrait of the fictional Chinese People's Volunteer Army commander 高大全 (Gao Daquan), age 38, to be reused unchanged across twelve campaign missions.
Subject: Chinese male field commander, broad square face, high cheekbones, calm direct gaze, short black hair mostly under cap, subtle healed scar through the left eyebrow, weathered skin, disciplined and humane expression. Chest-up three-quarter pose looking slightly toward camera.
Historical accuracy: late-1950 Chinese People's Volunteers quilted cotton winter jacket and soft field cap, plain practical uniform, small period-correct red star only, canvas map case strap. No modern PLA insignia, no shoulder boards, no medals, no camouflage, no modern gear.
Style/medium: unified premium 2D strategy-game character art; restrained gouache and ink over aged field-map paper; realistic anatomy and recognizable face; subtle 1950s black-and-white archive-photo influence translated into muted olive, khaki, charcoal and faded red.
Composition/framing: centered chest-up portrait, square canvas, generous padding, simple dark olive-to-parchment vignette, readable at 96px and polished at large size.
Lighting/mood: cold diffuse winter daylight, resolute but not propagandistic.
Constraints: fictional person, historically plausible, one person only, no text, no watermark, no flags, no weapons crossing the face.
```

## 兵种与武器母版提示词

```text
Use case: historical-scene
Asset type: master sprite sheet for eight square unit/weapon icons in a 1950-1953 Korean War turn-based strategy game
Primary request: Create exactly eight separate square illustrated emblems arranged in a rigid 4-column by 2-row grid, with equal cells, clean gutters, and no overlap.
Grid order:
Top row, Chinese People's Volunteers: infantryman with Type 38 or Mosin-Nagant; ZB-26 / DP-28 machine-gun team; 82mm mortar team; T-34-85 tank.
Bottom row, United Nations forces: US infantryman with M1 Garand; Browning M1919 team; M1 81mm mortar team; M4A3E8 Sherman.
Historical accuracy: Korean War only. No M16, M249, RPG-7, AK-pattern rifles, modern body armor, modern helmets, optics, rails, camouflage uniforms, missiles, or post-1953 vehicles.
Style/medium: same premium restrained gouache-and-ink strategy-game art as an aged field manual; strong readable silhouettes, muted olive/khaki/charcoal, PVA accents in desaturated green, UN accents in desaturated brick red.
Composition/framing: centered subjects, consistent scale, rigid equal cells suitable for deterministic cropping.
Constraints: exactly 8 cells in 4x2 arrangement; no words, letters, numbers, logos, flags, watermark, or extra panels.
```

## 历史将领母版提示词

```text
Use case: historical-scene
Asset type: master portrait sheet for six historical Korean War commanders, used in mission briefings
Primary request: Create exactly six chest-up portraits in a rigid 3-column by 2-row grid.
Grid order: Peng Dehuai; Wu Xinquan; Song Shilun; Qin Jiwei; Matthew B. Ridgway; Oliver P. Smith.
Reference approach: historically grounded in well-known 1950-1953 archival photographs; preserve age, facial structure, eyewear and period uniform without glamorization.
Style/medium: restrained gouache-and-ink strategy-game portraits over aged field-map paper; realistic anatomy; muted olive, khaki, charcoal and faded brick red.
Composition/framing: same angle, scale and square cell framing; suitable for deterministic cropping and readable at 80px.
Constraints: no text, nameplates, flags, invented medals, modern insignia, watermark, or extra people.
```
