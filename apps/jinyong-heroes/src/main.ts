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
        没有 DOS 原版文件时，引擎按公开攻略重建《连城诀》一条链。
        <strong>仍未导入原版资源</strong>：自绘高清占位、攻略转写对白，战斗公式未对照二进制。
      </p>
      <ul class="worlds">
        <li><strong>行走</strong><span>方向键走大地图，走进屋子。隐洞没有图钉，得自己走到福威南面才能进。</span></li>
        <li><strong>面对</strong><span>空格对面前的人或箱子交谈、搜查。ESC 打开状态、物品与存档。战斗在可见棋盘上移格、邻格攻击。</span></li>
        <li><strong>狄云</strong><span>开局品德约 50，低于 60 时狄云不入队，这是攻略里写明的条件。</span></li>
        <li><strong>资源</strong><span>本仓与 R2 不托管 DAT/GRP。有原版后再锁哈希、换黄金样本。</span></li>
      </ul>
      <nav class="links">
        <a href="./index.html?play=1">打开试玩</a>
        <a href="../games/index.html">游戏目录</a>
        <a href="../index.html">决战朝鲜</a>
      </nav>
    </main>
  `;
}
