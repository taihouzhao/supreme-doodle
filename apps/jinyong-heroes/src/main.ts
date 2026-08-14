const app = document.querySelector("#app");
if (!app) throw new Error("缺少 #app");

app.innerHTML = `
  <main class="page">
    <div class="seal">引擎开发中</div>
    <h1>金庸群侠传</h1>
    <p class="lede">
      Web Classic Engine：以 1996 年 DOS 版为唯一基准。网页只改操作、分辨率、存档与兼容性。
      <strong>尚未导入原版资源</strong>，这不是可玩复刻。公开站点不携带原作美术、音乐或台词。
    </p>
    <ul class="worlds">
      <li><strong>当前可验收</strong><span>无画面核心 + 《连城诀》最短路线的自动测试，不在浏览器里开战。</span></li>
      <li><strong>原典模式</strong><span>同一套数据和规则。增强模式以后只减操作摩擦，不降低探索难度。</span></li>
      <li><strong>资源</strong><span>将来由拥有原游戏的用户在本地导入；本仓与 R2 不托管 DAT/GRP。</span></li>
    </ul>
    <nav class="links">
      <a href="../games/index.html">游戏目录</a>
      <a href="../index.html">决战朝鲜</a>
    </nav>
  </main>
`;
