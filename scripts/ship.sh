#!/usr/bin/env bash
# 玩法变更收尾：蒙特卡洛门槛 → 构建 → 推送触发 R2 部署
set -euo pipefail
cd "$(dirname "$0")/.."

SEEDS="${SEEDS:-100}"
CAMPAIGN_SEEDS="${CAMPAIGN_SEEDS:-30}"
SKIP_PUSH="${SKIP_PUSH:-0}"

echo "==> 蒙特卡洛模拟（靶心：基础战役全胜 ≈ 60%）"
npm run sim -- --seeds="$SEEDS" --campaign-seeds="$CAMPAIGN_SEEDS"

echo "==> 构建"
npm run build

if [[ "$SKIP_PUSH" == "1" ]]; then
  echo "SKIP_PUSH=1，跳过推送。本地产物在 dist/。"
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
  echo "不在具名分支上，请手工推送以触发部署。"
  exit 1
fi

echo "==> 推送 $BRANCH（触发 Deploy to R2）"
git push -u origin "$BRANCH"

echo ""
echo "部署流水线已触发。试玩："
echo "  https://korea-tactics.dashjie.net/index.html"
echo "请强制刷新（Ctrl/Cmd+Shift+R）。"
