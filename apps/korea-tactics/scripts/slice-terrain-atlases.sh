#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
normal_atlas="$project_root/public/assets/masters/terrain-atlas-normal-v2.png"
snow_atlas="$project_root/public/assets/masters/terrain-atlas-snow-v2.png"
terrain_dir="$project_root/public/assets/terrain"

command -v convert >/dev/null || {
  echo "ImageMagick convert is required." >&2
  exit 1
}

terrain_names=(plain road forest hill village fort river cliff)
terrain_x=(4 448 893 1338 4 448 893 1338)
terrain_y=(4 4 4 4 449 449 449 449)

for terrain_index in "${!terrain_names[@]}"; do
  terrain_name="${terrain_names[$terrain_index]}"
  crop="432x432+${terrain_x[$terrain_index]}+${terrain_y[$terrain_index]}"
  convert "$normal_atlas" -crop "$crop" +repage -filter Lanczos -resize 128x128 \
    "$terrain_dir/$terrain_name.png"
  convert "$snow_atlas" -crop "$crop" +repage -filter Lanczos -resize 128x128 \
    "$terrain_dir/$terrain_name-snow.png"
done

echo "Refreshed 16 terrain tiles from the two v2 master atlases."
