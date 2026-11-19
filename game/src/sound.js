// A tiny synthesized sound set (WebAudio, no audio files): pickup blips, a crash
// thud, a punch, a mission fanfare and a two-tone police siren. The context is
// created on the first user gesture, so the browser's autoplay rules never block
// it, and M mutes everything.

export function createSound() {
  let context = null;
  let master = null;
  let muted = false;
  let sirenNodes = null;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, seconds, type, volume, when) {
    if (context === null) return;
    const start = context.currentTime + (when ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  return {
    /** Call from a user gesture so the context is allowed to start. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    setMuted(value) {
      muted = value;
      if (master !== null) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    pickup() {
      if (!ensure()) return;
      blip(880, 0.12, 'sine', 0.5);
      blip(1318, 0.16, 'sine', 0.5, 0.08);
    },
    crash() {
      if (!ensure()) return;
      blip(110, 0.22, 'square', 0.5);
      blip(70, 0.3, 'triangle', 0.4, 0.02);
    },
    punch() {
      if (!ensure()) return;
      blip(220, 0.09, 'square', 0.45);
    },
    mission() {
      if (!ensure()) return;
      blip(523, 0.14, 'sine', 0.5);
      blip(659, 0.14, 'sine', 0.5, 0.12);
      blip(784, 0.14, 'sine', 0.5, 0.24);
      blip(1046, 0.24, 'sine', 0.5, 0.36);
    },
    /** The two-tone siren runs while the player is wanted, and stops after. */
    setSiren(on) {
      if (on) {
        if (sirenNodes !== null || !ensure()) return;
        const oscillator = context.createOscillator();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        const gain = context.createGain();
        oscillator.type = 'square';
        oscillator.frequency.value = 820;
        lfo.type = 'sine';
        lfo.frequency.value = 0.9;
        lfoGain.gain.value = 220;
        gain.gain.value = 0.05;
        lfo.connect(lfoGain);
        lfoGain.connect(oscillator.frequency);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start();
        lfo.start();
        sirenNodes = { oscillator, lfo, gain };
      } else if (sirenNodes !== null) {
        try {
          sirenNodes.oscillator.stop();
          sirenNodes.lfo.stop();
        } catch {
          // Already stopped.
        }
        sirenNodes = null;
      }
    },
  };
}
