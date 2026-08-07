import { BALANCE, CANVAS, COLORS } from "./constants.js";

/**
 * @param {number} min
 * @param {number} max
 */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * @param {{ x: number, y: number, r: number }} a
 * @param {{ x: number, y: number, r: number }} b
 */
export function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.r + b.r;
  return dx * dx + dy * dy < rr * rr;
}

export class Player {
  constructor() {
    this.x = CANVAS.width / 2;
    this.y = CANVAS.height / 2;
    this.r = BALANCE.playerRadius;
    this.invincibleUntil = 0;
    this.flash = 0;
  }

  reset() {
    this.x = CANVAS.width / 2;
    this.y = CANVAS.height * 0.65;
    this.invincibleUntil = 0;
    this.flash = 0;
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y: number }} move
   * @param {number} now
   */
  update(dt, move, now) {
    this.x += move.x * BALANCE.playerSpeed * dt;
    this.y += move.y * BALANCE.playerSpeed * dt;
    this.x = Math.max(this.r, Math.min(CANVAS.width - this.r, this.x));
    this.y = Math.max(this.r, Math.min(CANVAS.height - this.r, this.y));
    if (now < this.invincibleUntil) {
      this.flash += dt * 12;
    } else {
      this.flash = 0;
    }
  }

  /** @param {number} now */
  hurt(now) {
    this.invincibleUntil = now + BALANCE.invincibleMs;
  }

  /** @param {number} now */
  isInvincible(now) {
    return now < this.invincibleUntil;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    if (this.flash && Math.floor(this.flash) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // body
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.player;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.playerStroke;
    ctx.stroke();

    // doodle face
    ctx.strokeStyle = COLORS.playerStroke;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(-6, -3, 2.2, 0, Math.PI * 2);
    ctx.arc(6, -3, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 4, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // pencil tuft
    ctx.beginPath();
    ctx.moveTo(-4, -this.r + 2);
    ctx.quadraticCurveTo(0, -this.r - 10, 6, -this.r + 1);
    ctx.stroke();

    ctx.restore();
  }
}

export class Star {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.r = BALANCE.starRadius;
    this.spin = 0;
    this.pop = 0;
    this.respawn();
  }

  respawn(avoidX = -999, avoidY = -999) {
    const pad = BALANCE.spawnPadding;
    let tries = 0;
    do {
      this.x = rand(pad, CANVAS.width - pad);
      this.y = rand(pad + 40, CANVAS.height - pad);
      tries += 1;
    } while (tries < 20 && Math.hypot(this.x - avoidX, this.y - avoidY) < 80);
    this.pop = 0.35;
  }

  /** @param {number} dt */
  update(dt) {
    this.spin += dt * 2.2;
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt);
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    const scale = 1 + this.pop * 0.8;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    ctx.scale(scale, scale);

    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const b = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * this.r, Math.sin(a) * this.r);
      ctx.lineTo(Math.cos(b) * this.r * 0.45, Math.sin(b) * this.r * 0.45);
    }
    ctx.closePath();
    ctx.fillStyle = COLORS.star;
    ctx.fill();
    ctx.strokeStyle = COLORS.starStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

export class Blot {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.r = BALANCE.blotRadiusMin;
    this.vx = 0;
    this.vy = 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.reset();
  }

  reset() {
    const edge = Math.floor(Math.random() * 4);
    const pad = BALANCE.spawnPadding;
    this.r = rand(BALANCE.blotRadiusMin, BALANCE.blotRadiusMax);
    const speed = rand(BALANCE.blotSpeedMin, BALANCE.blotSpeedMax);

    if (edge === 0) {
      this.x = rand(pad, CANVAS.width - pad);
      this.y = -this.r;
      this.vx = rand(-40, 40);
      this.vy = speed;
    } else if (edge === 1) {
      this.x = CANVAS.width + this.r;
      this.y = rand(pad, CANVAS.height - pad);
      this.vx = -speed;
      this.vy = rand(-40, 40);
    } else if (edge === 2) {
      this.x = rand(pad, CANVAS.width - pad);
      this.y = CANVAS.height + this.r;
      this.vx = rand(-40, 40);
      this.vy = -speed;
    } else {
      this.x = -this.r;
      this.y = rand(pad, CANVAS.height - pad);
      this.vx = speed;
      this.vy = rand(-40, 40);
    }
  }

  /** @param {number} dt */
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.wobble += dt * 3;
    if (
      this.x < -60 ||
      this.x > CANVAS.width + 60 ||
      this.y < -60 ||
      this.y > CANVAS.height + 60
    ) {
      this.reset();
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const wob = Math.sin(this.wobble) * 2;

    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const rr = this.r + ((i % 2 === 0 ? 3 : -2) + wob * 0.3);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = COLORS.blot;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(-this.r * 0.2, -this.r * 0.15, this.r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.blotCore;
    ctx.fill();
    ctx.restore();
  }
}
