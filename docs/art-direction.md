# 美术方向与生成记录

全部生成图均采用内置 image generation 路径生成，再复制到 `public/assets/`。所有将领图均是风格化重建，不冒充档案原照。2026-08-09 起进入 V2 迁移：不再追求“上色档案照”，而改用清晰、彩色、可缩略识别的战场绘画；每张肖像作为独立资产生成和审校，不再从新母版中批量裁切。

## 统一视觉规范

- 媒介：将领/兵种采用鲜明但克制的手绘战棋角色画，地形采用俯视水粉贴图，功能图标采用单色军用手册式 SVG。
- 色彩：保留橄榄绿、卡其、木色与钢蓝的历史基底，但增加冷暖明暗分离；禁止统一褐色滤镜。
- 年代：只允许1950—1953年服装、钢盔、枪械与车辆轮廓。
- 禁止：现代迷彩、战术背心、导轨光学瞄具、M16、M249、AK系、RPG-7、现代肩章和现代装甲车辆。
- 肖像用途：游戏化复合绘画，不冒充档案照片；48px 缩略图仍须能辨认脸、军种与阵营。
- 禁止质感：褪色、胶片颗粒、裂纸、旧相框、统一棕褐色、假档案编号。

## 2026-08-09 V2 迁移

首批已替换高大全、彭德怀、金钟五、李奇微四张核心肖像，炒面袋、绷带、爆破筒、阵中手册四个独立物品图标，以及志愿军、韩国陆军各 8 张普通单位肖像。美、英、法普通单位与其余历史将领仍保留稳定旧文件，后续按关卡逐批迁移，避免一次替换导致人物身份漂移。

肖像统一提示词骨架：

```text
STYLE-TRANSFER EDIT for an existing Korean War tactical RPG portrait. Preserve the same person, facial identity, age, gaze, pose, headgear and historically plausible 1950-1953 uniform. Change only the rendering: vivid hand-painted tactical game portrait, crisp graphic shapes, natural olive-drab/khaki/steel-blue/muted earth palette, strong readable key light, restrained battlefield atmosphere, chest-up centered composition, readable at 48px. No sepia, monochrome, faded old-photo look, film grain, cracked paper, antique border, text, watermark, invented medals, fantasy armor or modern gear.
```

物品统一提示词骨架：

```text
A single square Korean War tactical RPG inventory icon. One historically plausible 1950s field object, vivid hand-painted gouache, crisp silhouette, natural olive/khaki/charcoal palette, isolated on a simple dark neutral painted background, generous padding, readable at 48px. No sepia photo effect, antique paper, text, logo, flag, watermark or modern packaging.
```

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

## 地图连接件

- 道路与河流不能把同一张直线贴图机械铺满。渲染时读取北、东、南、西相邻地块，自动选择纵向、横向、斜向转弯、三岔或交叉连接。
- 双格宽道路和宽河面按主轴合并识别，避免把并排行车带或水面误画成连续十字路口。
- 道路穿过河带不等于桥梁：只有历史地点或目标明确标为“公路桥/桥梁”时使用桥面贴图；“渡河带”“桥头堡”和普通河谷仍表现为浅滩或渡口。
- 桥面和河流必须正交，常态与雪地各有独立贴图；横向桥可由纵向基础件旋转得到。

常态桥梁提示词：

```text
Create one square, top-down orthographic terrain tile for a serious Korean War operational tactics game, autumn Korea circa 1950. A narrow shallow blue-green river flows clearly from the LEFT edge to the RIGHT edge, with visible directional ripples and rocky muddy banks that connect seamlessly at both horizontal edges. A single-lane weathered timber-and-earth military road bridge crosses from the TOP edge to the BOTTOM edge, with the dirt road connecting seamlessly at both vertical edges. The bridge deck must visibly sit above and perpendicular to the water, with simple timber rails and abutments. Hand-painted realistic game texture, muted olive, umber, slate blue and tan palette, crisp tactical readability at small size, even overhead lighting, no cast perspective, no units, no vehicles, no people, no text, no symbols, no border, no grid lines, no UI, no transparent background. The tile must read correctly when cropped square and downscaled to 128x128.
```

雪地桥梁提示词：

```text
Create one square, top-down orthographic WINTER terrain tile for a serious Korean War operational tactics game, winter Korea circa 1950. A narrow partly icy blue-gray river flows clearly from the LEFT edge to the RIGHT edge, with visible current lanes, broken thin ice and rocky snow-lined banks that connect seamlessly at both horizontal edges. A single-lane weathered timber-and-packed-snow military road bridge crosses from the TOP edge to the BOTTOM edge, with the snowy dirt road connecting seamlessly at both vertical edges. The bridge deck must visibly sit above and perpendicular to the water, with simple timber rails, abutments, wheel-worn snow and restrained frost. Hand-painted realistic game texture, muted cold gray-blue, off-white, umber and charcoal palette, crisp tactical readability at small size, even overhead lighting, no cast perspective, no units, no vehicles, no people, no text, no symbols, no border, no grid lines, no UI, no transparent background. The tile must read correctly when cropped square and downscaled to 128x128.
```
