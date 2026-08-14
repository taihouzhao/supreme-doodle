import { mountPlayShell } from "./client/play-shell";

const app = document.querySelector("#app");
if (!(app instanceof HTMLElement)) throw new Error("缺少 #app");

const play = new URLSearchParams(window.location.search).has("play");
if (play) {
  document.body.classList.add("playing");
  mountPlayShell(app);
} else {
  app.innerHTML = `
    <main class="page">
      <div class="seal">攻略重建中</div>
      <h1>金庸群侠传</h1>
      <p class="lede">
        没有 DOS 原版文件时，引擎按公开攻略重建《连城诀》最短链。
        <strong>仍未导入原版资源</strong>，对话是攻略转写，战斗公式未对照二进制。
      </p>
      <ul class="worlds">
        <li><strong>江湖地图</strong><span>按公开攻略坐标画出大地图。只标已经听说或到达的地点，不揭示隐藏点。</span></li>
        <li><strong>文本试玩</strong><span>自宅搜刮 → 河洛客栈一两银子 → 南贤罗盘 → 福威隐洞唐诗选辑 → 北丑面盆 → 天宁寺佛像后。</span></li>
        <li><strong>狄云</strong><span>开局品德约 50，低于 60 时狄云不入队，这是攻略里写明的条件。</span></li>
        <li><strong>资源</strong><span>本仓与 R2 不托管 DAT/GRP。有原版后再锁哈希、换黄金样本。</span></li>
      </ul>
      <nav class="links">
        <a href="./index.html?play=1">打开文本壳</a>
        <a href="../games/index.html">游戏目录</a>
        <a href="../index.html">决战朝鲜</a>
      </nav>
    </main>
  `;
}
