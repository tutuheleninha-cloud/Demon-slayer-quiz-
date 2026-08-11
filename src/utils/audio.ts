class AudioEngine {
  ctx: AudioContext | null = null;
  
  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }
  
  bgmOsc: OscillatorNode | null = null;
  bgmGain: GainNode | null = null;
  bgmMuted: boolean = true;
  currentBgmTopic: string | null = null;

  setBgmMuted(muted: boolean) {
    this.bgmMuted = muted;
    if (muted) {
      this.stopBgm();
    } else if (this.currentBgmTopic) {
      this.playBgm(this.currentBgmTopic);
    }
  }

  stopBgm() {
    if (this.bgmOsc) {
      try {
        this.bgmOsc.stop();
        this.bgmOsc.disconnect();
      } catch (e) {}
      this.bgmOsc = null;
    }
    if (this.bgmGain) {
      try {
        this.bgmGain.disconnect();
      } catch (e) {}
      this.bgmGain = null;
    }
  }

  playBgm(topic: string) {
    this.currentBgmTopic = topic;
    if (this.bgmMuted) return;

    this.init();
    if (!this.ctx) return;
    
    // Clean up existing BGM
    this.stopBgm();

    try {
      this.bgmOsc = this.ctx.createOscillator();
      this.bgmGain = this.ctx.createGain();
      
      this.bgmOsc.connect(this.bgmGain);
      this.bgmGain.connect(this.ctx.destination);

      let freq = 200;
      let type: OscillatorType = 'sine';
      
      switch (topic) {
        case 'Tanjiro Kamado':
          freq = 220; type = 'sine'; break;
        case 'The Hashira':
          freq = 440; type = 'triangle'; break;
        case 'The Twelve Kizuki':
          freq = 110; type = 'sawtooth'; break;
        case 'Breathing Styles':
          freq = 330; type = 'sine'; break;
        case 'Daily Challenge':
          freq = 550; type = 'triangle'; break;
        default:
          freq = 261.63; type = 'sine'; break; // Middle C
      }

      this.bgmOsc.type = type;
      this.bgmOsc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      // Gentle modulation for atmosphere
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.2; // 0.2 Hz slow pulse
      lfoGain.gain.value = 10;
      lfo.connect(lfoGain);
      lfoGain.connect(this.bgmOsc.frequency);
      lfo.start();
      
      this.bgmGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.bgmGain.gain.linearRampToValueAtTime(0.03, this.ctx.currentTime + 2); // Soft volume

      this.bgmOsc.start();
    } catch (e) {
      console.error("BGM Error", e);
    }
  }

  playStartSound(difficulty: string) {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      const now = this.ctx.currentTime;
      
      if (difficulty === 'Death Match') {
        // 'Draw sword' - metallic scrape, high pitched sawtooth sweep
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(2000, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (difficulty === 'Easy') {
        // 'Calm breath' - slow sine sweep with low pitch
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(150, now + 0.5);
        osc.frequency.linearRampToValueAtTime(100, now + 1.0);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.5);
        gain.gain.linearRampToValueAtTime(0, now + 1.0);
        osc.start(now);
        osc.stop(now + 1.0);
      } else {
        // Standard start chime for Medium/Hard
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (e) {}
  }

  playClick() {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {}
  }
  
  playCorrect() {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.setValueAtTime(554.37, this.ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    } catch (e) {}
  }
  
  playIncorrect() {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (e) {}
  }
}

export const audio = new AudioEngine();
