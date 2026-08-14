#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
master_dir="$project_root/public/assets/masters"
output_dir="$project_root/public/assets/unit-identities"

mkdir -p "$output_dir"

groups=(pva rok us uk fr)

for group in "${groups[@]}"; do
  source="$master_dir/unit-identities-$group.png"
  if [[ ! -f "$source" ]]; then
    echo "缺少母版: $source" >&2
    exit 1
  fi

  dimensions="$(identify -format '%w %h' "$source")"
  width="${dimensions%% *}"
  height="${dimensions##* }"
  cell_width=$((width / 4))
  cell_height=$((height / 2))
  if ((cell_width < cell_height)); then
    square="$cell_width"
  else
    square="$cell_height"
  fi
  inset_x=$(((cell_width - square) / 2))
  inset_y=$(((cell_height - square) / 2))

  for index in $(seq 0 7); do
    col=$((index % 4))
    row=$((index / 4))
    x=$((col * cell_width + inset_x))
    y=$((row * cell_height + inset_y))
    number=$(printf '%02d' $((index + 1)))

    convert "$source" \
      -crop "${square}x${square}+${x}+${y}" \
      +repage \
      -resize 384x384 \
      -strip \
      -define png:compression-level=9 \
      "$output_dir/$group-$number.png"
  done
done

echo "已生成 40 张单位身份头像 → $output_dir"
