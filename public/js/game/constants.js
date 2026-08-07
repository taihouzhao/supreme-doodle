/** @type {const} */
export const CANVAS = {
  width: 480,
  height: 720,
};

export const COLORS = {
  paper: "#eef3f7",
  grid: "rgba(28, 43, 58, 0.06)",
  ink: "#1c2b3a",
  player: "#2a9d8f",
  playerStroke: "#1c2b3a",
  star: "#f0b429",
  starStroke: "#c48912",
  blot: "#3d5266",
  blotCore: "#1c2b3a",
  hurt: "#e85d4c",
};

export const BALANCE = {
  playerRadius: 18,
  playerSpeed: 260,
  starRadius: 12,
  blotRadiusMin: 14,
  blotRadiusMax: 26,
  blotSpeedMin: 70,
  blotSpeedMax: 140,
  initialLives: 3,
  initialBlots: 3,
  maxBlots: 10,
  blotPerScore: 4,
  invincibleMs: 1200,
  spawnPadding: 48,
};
