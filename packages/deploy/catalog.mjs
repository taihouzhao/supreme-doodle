/**
 * 本仓所有可部署站点。新增游戏时：在 apps/ 建包，并在这里登记 prefix。
 * prefix 为空表示桶根（决战朝鲜沿用 korea-tactics.dashjie.net/index.html）。
 */
export const GAMES = [
  {
    id: "korea-tactics",
    name: "决战朝鲜",
    dist: "apps/korea-tactics/dist",
    prefix: "",
    preservePrefixes: ["jinyong-heroes/", "korea-defense/", "games/"],
    url: "https://korea-tactics.dashjie.net/index.html",
  },
  {
    id: "korea-defense",
    name: "决战朝鲜：塔防",
    dist: "apps/korea-defense/dist",
    prefix: "korea-defense",
    url: "https://korea-tactics.dashjie.net/korea-defense/",
  },
  {
    id: "jinyong-heroes",
    name: "金庸群侠传",
    dist: "apps/jinyong-heroes/dist",
    prefix: "jinyong-heroes",
    url: "https://korea-tactics.dashjie.net/jinyong-heroes/",
  },
  {
    id: "studio-site",
    name: "游戏目录",
    dist: "apps/studio-site/dist",
    prefix: "games",
    url: "https://korea-tactics.dashjie.net/games/",
  },
];
