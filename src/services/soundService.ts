// ============================================================
// ZHINO — Sound Service
// Subtle premium audio feedback for key interactions
// ============================================================

type SoundType =
  | 'addToCart'
  | 'removeFromCart'
  | 'quantityChange'
  | 'primaryButton'
  | 'orderComplete'
  | 'freeShipping';

const SOUND_PREF_KEY = 'zhino_sound_enabled';

interface WindowWithWebkitAudio {
  webkitAudioContext?: typeof AudioContext;
}

class SoundService {
  private context: AudioContext | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = true;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(SOUND_PREF_KEY);
        this.enabled = stored === null ? true : stored === 'true';
      }
    } catch {
      this.enabled = true;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(val: boolean) {
    this.enabled = val;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(SOUND_PREF_KEY, String(val));
      }
    } catch {
      // Storage unavailable — preference still applies in memory
    }
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  private getContext(): AudioContext | null {
    try {
      if (typeof window === 'undefined') return null;
      const Ctor =
        window.AudioContext ??
        (window as unknown as WindowWithWebkitAudio).webkitAudioContext;
      if (!Ctor) return null;
      if (!this.context) {
        this.context = new Ctor();
      }
      // Browsers start AudioContext suspended until a user gesture; resume so
      // the first tap still produces feedback instead of silence.
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => undefined);
      }
      return this.context;
    } catch {
      return null;
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 0.15,
    delay = 0,
  ) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.95,
        ctx.currentTime + delay + duration,
      );

      gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
      gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      oscillator.start(ctx.currentTime + delay);
      oscillator.stop(ctx.currentTime + delay + duration);
    } catch {
      // Silently fail — sound is enhancement not requirement
    }
  }

  play(sound: SoundType) {
    if (!this.enabled) return;

    switch (sound) {
      case 'addToCart':
        // Two gentle ascending tones — satisfying confirmation
        this.playTone(523, 0.12, 'sine', 0.12);
        this.playTone(659, 0.15, 'sine', 0.1, 0.1);
        this.playTone(784, 0.2, 'sine', 0.08, 0.22);
        break;

      case 'removeFromCart':
        // Soft descending single tone
        this.playTone(440, 0.15, 'sine', 0.08);
        this.playTone(330, 0.18, 'sine', 0.06, 0.1);
        break;

      case 'quantityChange':
        // Very subtle tick
        this.playTone(880, 0.08, 'sine', 0.06);
        break;

      case 'primaryButton':
        // Single gentle confirmation
        this.playTone(600, 0.1, 'sine', 0.08);
        break;

      case 'orderComplete':
        // Celebratory arpeggio
        this.playTone(523, 0.15, 'sine', 0.12);
        this.playTone(659, 0.15, 'sine', 0.12, 0.15);
        this.playTone(784, 0.15, 'sine', 0.12, 0.3);
        this.playTone(1047, 0.3, 'sine', 0.1, 0.45);
        break;

      case 'freeShipping':
        // Warm celebratory chord
        this.playTone(523, 0.25, 'sine', 0.1);
        this.playTone(659, 0.25, 'sine', 0.08, 0.05);
        this.playTone(784, 0.3, 'sine', 0.08, 0.1);
        this.playTone(1047, 0.4, 'sine', 0.06, 0.2);
        break;
    }
  }
}

export const soundService = new SoundService();
