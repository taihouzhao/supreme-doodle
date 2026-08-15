export type SoundCue = "deploy" | "shot" | "hit" | "leak" | "win" | "lose";

export class SoundBank {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volume = 0.65;

  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.context) {
      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
      } catch {
        return null;
      }
    }
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  play(cue: SoundCue): void {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const settings: Record<SoundCue, { frequency: number; duration: number; type: OscillatorType }> = {
      deploy: { frequency: 340, duration: 0.12, type: "triangle" },
      shot: { frequency: 180, duration: 0.06, type: "square" },
      hit: { frequency: 90, duration: 0.1, type: "sawtooth" },
      leak: { frequency: 70, duration: 0.25, type: "sawtooth" },
      win: { frequency: 520, duration: 0.4, type: "sine" },
      lose: { frequency: 120, duration: 0.45, type: "sine" },
    };
    const setting = settings[cue];
    const now = context.currentTime;
    oscillator.type = setting.type;
    oscillator.frequency.setValueAtTime(setting.frequency, now);
    if (cue === "win") oscillator.frequency.linearRampToValueAtTime(setting.frequency * 1.8, now + setting.duration);
    if (cue === "lose") oscillator.frequency.linearRampToValueAtTime(setting.frequency * 0.55, now + setting.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + setting.duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + setting.duration + 0.02);
  }
}
