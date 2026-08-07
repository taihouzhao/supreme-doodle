import { Game } from "./game/game.js";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("缺少游戏画布 #game");
}

new Game(canvas);
