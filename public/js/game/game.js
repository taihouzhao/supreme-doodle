import { BALANCE, CANVAS, COLORS } from "./constants.js";
import { Blot, Player, Star, circlesOverlap } from "./entities.js";
import { Input } from "./input.js";
import { UI } from "./ui.js";

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = new Input();
    this.ui = new UI();

    this.state = "title";
    this.score = 0;
    this.lives = BALANCE.initialLives;
    this.player = new Player();
    this.star = new Star();
    /** @type {Blot[]} */
    this.blots = [];
    this.lastTs = 0;
    this.raf = 0;

    this.input.bindStick(
      document.querySelector(".stick__base"),
      document.getElementById("stick-knob"),
    );

    this._bindUi();
    this.ui.setState("title");
    this._drawBackground();
    this._loop = this._loop.bind(this);
    this.raf = requestAnimationFrame(this._loop);
  }

  _bindUi() {
    document.getElementById("btn-start").addEventListener("click", () => this.start());
    document.getElementById("btn-restart").addEventListener("click", () => this.start());
    document.getElementById("btn-resume").addEventListener("click", () => this.resume());
    document.getElementById("btn-to-title").addEventListener("click", () => this.toTitle());
    document.getElementById("btn-pause").addEventListener("click", () => this.pause());
  }

  start() {
    this.score = 0;
    this.lives = BALANCE.initialLives;
    this.player.reset();
    this.star.respawn(this.player.x, this.player.y);
    this.blots = Array.from({ length: BALANCE.initialBlots }, () => new Blot());
    this.state = "playing";
    this.ui.setState("playing", { score: this.score, lives: this.lives });
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.ui.setState("paused", { score: this.score, lives: this.lives });
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.ui.setState("playing", { score: this.score, lives: this.lives });
  }

  toTitle() {
    this.state = "title";
    this.ui.setState("title");
  }

  gameOver() {
    this.state = "gameover";
    this.ui.setState("gameover", { score: this.score, lives: this.lives });
  }

  /** @param {number} desired */
  _syncBlotCount(desired) {
    while (this.blots.length < desired) this.blots.push(new Blot());
  }

  /**
   * @param {number} dt
   * @param {number} now
   */
  _update(dt, now) {
    if (this.input.consumePauseToggle()) {
      if (this.state === "playing") this.pause();
      else if (this.state === "paused") this.resume();
    }

    if (this.state !== "playing") return;

    const move = this.input.getMoveVector();
    this.player.update(dt, move, now);
    this.star.update(dt);
    for (const blot of this.blots) blot.update(dt);

    if (circlesOverlap(this.player, this.star)) {
      this.score += 1;
      this.star.respawn(this.player.x, this.player.y);
      const desired = Math.min(
        BALANCE.maxBlots,
        BALANCE.initialBlots + Math.floor(this.score / BALANCE.blotPerScore),
      );
      this._syncBlotCount(desired);
      this.ui.updateHud(this.score, this.lives);
    }

    if (!this.player.isInvincible(now)) {
      for (const blot of this.blots) {
        if (circlesOverlap(this.player, blot)) {
          this.lives -= 1;
          this.player.hurt(now);
          this.ui.updateHud(this.score, this.lives);
          if (this.lives <= 0) {
            this.gameOver();
          }
          break;
        }
      }
    }
  }

  _drawBackground() {
    const { ctx } = this;
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = step; x < CANVAS.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS.height);
      ctx.stroke();
    }
    for (let y = step; y < CANVAS.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS.width, y);
      ctx.stroke();
    }

    // sketch margin doodle
    ctx.save();
    ctx.strokeStyle = "rgba(28, 43, 58, 0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 40);
    ctx.bezierCurveTo(60, 20, 100, 70, 140, 36);
    ctx.stroke();
    ctx.restore();
  }

  _draw() {
    this._drawBackground();

    if (this.state === "title") {
      // idle preview doodle
      this.ctx.save();
      this.ctx.globalAlpha = 0.55;
      this.player.x = CANVAS.width / 2;
      this.player.y = CANVAS.height * 0.58;
      this.player.draw(this.ctx);
      this.ctx.restore();
      return;
    }

    this.star.draw(this.ctx);
    for (const blot of this.blots) blot.draw(this.ctx);
    this.player.draw(this.ctx);
  }

  /** @param {number} ts */
  _loop(ts) {
    const now = ts;
    const dt = Math.min(0.033, (now - (this.lastTs || now)) / 1000);
    this.lastTs = now;
    this._update(dt, now);
    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  }
}
