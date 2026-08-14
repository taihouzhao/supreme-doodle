const app = document.querySelector("#app");
if (!app) throw new Error("缺少 #app");

app.innerHTML = `
  <main class="page">
    <div class="seal">筹备中</div>
    <h1>金庸群侠传</h1>
    <p class="lede">
      开放世界武侠。从中原到西域，门派、江湖与侠义会慢慢铺开。
      现在还没有可玩关卡，这是 monorepo 里的空项目壳。
    </p>
    <ul class="worlds">
      <li><strong>中原</strong><span>射雕、神雕一线的中原门派与江湖恩怨</span></li>
      <li><strong>江南</strong><span>笑傲江湖的庙堂与绿林</span></li>
      <li><strong>大理 / 西夏</strong><span>天龙八部的边地与佛门</span></li>
    </ul>
    <nav class="links">
      <a href="../games/index.html">游戏目录</a>
      <a href="../index.html">决战朝鲜</a>
    </nav>
  </main>
`;
