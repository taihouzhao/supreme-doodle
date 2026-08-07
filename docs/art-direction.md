# 美术方向与生成记录

全部生成图均采用内置 image generation 路径生成，再复制到 `public/assets/`。主角肖像只生成一次并在所有关卡复用；历史将领与兵种图标分别从固定网格母版裁切，因此不会在关卡间漂移。

## 统一视觉规范

- 媒介：克制的水粉与墨线，叠加旧作战地图纸张质感。
- 色彩：志愿军为低饱和橄榄绿、卡其、木色；联合国军增加低饱和砖红识别色。
- 年代：只允许1950—1953年服装、钢盔、枪械与车辆轮廓。
- 禁止：现代迷彩、战术背心、导轨光学瞄具、M16、M249、AK系、RPG-7、现代肩章和现代装甲车辆。
- 肖像用途：游戏化复合绘画，不冒充档案照片。

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

