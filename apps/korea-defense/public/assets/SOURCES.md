# 温井塔防首版资源来源

当前版本复用仓库内已有的、无外部运行时依赖的图标，并使用 Canvas 2D 绘制战术层：

| 目标 | 来源（`apps/korea-tactics/public/assets/`） | 用途 |
| --- | --- | --- |
| `roles/rifle.svg` | `roles/rifle.svg` | 步兵班部署按钮 |
| `roles/mg.svg` | `roles/mg.svg` | 机枪阵地部署按钮 |
| `roles/mortar.svg` | `roles/mortar.svg` | 迫击炮组部署按钮 |
| `ui/faction-pva.png` | `ui/faction-pva.png` | 温井指挥所阵营标识 |
| `ui/weather-snow.svg` | `ui/weather-snow.svg` | 雪夜天气标识 |
| `ui/result-win.png` / `ui/result-lose.png` | 同名文件 | 结果面板图标 |
| `terrain/road-snow.png` / `forest-snow.png` / `hill-snow.png` | `terrain/` 同名文件 | 运行时 Canvas 2D 地形纹理 |
| `units/enemy-atlas.webp` | OpenAI ImageGen 生成，参考 `terrain/forest-snow.png` 的雪夜俯视质感；经色键透明化并压缩为 WebP | rifle / runner / heavy / armored 四类敌军战场 Sprite 图集 |

这些文件不代表原版素材导入；《守卫温井》明确是依据地形和参战编成的塔防玩法改编。敌军图集的生成中间文件不随运行时资源部署。
