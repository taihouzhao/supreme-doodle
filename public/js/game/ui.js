export class UI {
  constructor() {
    this.panelTitle = document.getElementById("panel-title");
    this.panelPaused = document.getElementById("panel-paused");
    this.panelGameover = document.getElementById("panel-gameover");
    this.hud = document.getElementById("hud");
    this.scoreEl = document.getElementById("score");
    this.livesEl = document.getElementById("lives");
    this.finalScoreEl = document.getElementById("final-score");
    this.stick = document.getElementById("stick");
  }

  /**
   * @param {'title' | 'playing' | 'paused' | 'gameover'} state
   * @param {{ score?: number, lives?: number }} [data]
   */
  setState(state, data = {}) {
    this.panelTitle.hidden = state !== "title";
    this.panelPaused.hidden = state !== "paused";
    this.panelGameover.hidden = state !== "gameover";
    this.hud.hidden = state !== "playing" && state !== "paused";
    this.stick.hidden = state !== "playing";

    if (typeof data.score === "number") {
      this.scoreEl.textContent = String(data.score);
      this.finalScoreEl.textContent = String(data.score);
    }
    if (typeof data.lives === "number") {
      this.livesEl.textContent = "♥".repeat(Math.max(0, data.lives));
    }
  }

  /**
   * @param {number} score
   * @param {number} lives
   */
  updateHud(score, lives) {
    this.scoreEl.textContent = String(score);
    this.livesEl.textContent = "♥".repeat(Math.max(0, lives));
  }
}
