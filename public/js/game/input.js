export class Input {
  constructor() {
    /** @type {Set<string>} */
    this.keys = new Set();
    this.axis = { x: 0, y: 0 };
    this._stickActive = false;

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
  }

  /**
   * @param {HTMLElement} base
   * @param {HTMLElement} knob
   */
  bindStick(base, knob) {
    const max = 28;

    const setFromPoint = (clientX, clientY) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, max);
      dx = (dx / len) * clamped;
      dy = (dy / len) * clamped;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.axis.x = dx / max;
      this.axis.y = dy / max;
      this._stickActive = true;
    };

    const reset = () => {
      knob.style.transform = "translate(-50%, -50%)";
      this.axis.x = 0;
      this.axis.y = 0;
      this._stickActive = false;
    };

    const onDown = (e) => {
      e.preventDefault();
      const point = "touches" in e ? e.touches[0] : e;
      setFromPoint(point.clientX, point.clientY);
    };

    const onMove = (e) => {
      if (!this._stickActive) return;
      e.preventDefault();
      const point = "touches" in e ? e.touches[0] : e;
      if (!point) return;
      setFromPoint(point.clientX, point.clientY);
    };

    base.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", reset);
    window.addEventListener("pointercancel", reset);
  }

  /** @returns {{ x: number, y: number }} */
  getMoveVector() {
    let x = 0;
    let y = 0;

    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) x -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) x += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) y -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) y += 1;

    if (this._stickActive) {
      x += this.axis.x;
      y += this.axis.y;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  consumePauseToggle() {
    const pressed = this.keys.has("KeyP") || this.keys.has("Escape");
    if (!pressed) return false;
    this.keys.delete("KeyP");
    this.keys.delete("Escape");
    return true;
  }
}
