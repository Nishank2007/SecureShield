/**
 * SecureShield — FIRE ALARM Security Breach Engine
 * ═══════════════════════════════════════════════════
 * Authentic fire alarm T-3 temporal pattern (NFPA 72 standard):
 *   → 3 blasts (500ms ON / 500ms OFF) + 1500ms silence → REPEAT
 * 
 * Sound design: Pure piercing tone at 3100 Hz (real Wheelock/System Sensor freq)
 *   + second harmonic at 2350 Hz for thickness
 *   + sweeping modulation for that unmistakable "GET OUT NOW" urgency
 * 
 * Also plays an external Zedge MP3 "breach-alarm.mp3" in the background.
 * Optional: robotic TTS "Security breach detected. System locked."
 */

class SecurityAlarm {
  constructor(options = {}) {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this._scheduledNodes = [];
    this._loopTimer = null;

    // ── External MP3 Sound ─────────────────────────────────────────
    this.audioElement = new Audio('breach-alarm.mp3');
    this.audioElement.loop = true;
    this.audioElement.volume = options.volume ?? 1.0;

    // ── Tuning (realistic fire alarm defaults) ──────────────────
    this.primaryFreq   = options.primaryFreq   ?? 3100;    // Hz — real fire alarm freq
    this.secondaryFreq = options.secondaryFreq ?? 2350;    // Hz — harmonic layer
    this.blastDuration = options.blastDuration ?? 500;     // ms — each blast ON time
    this.blastGap      = options.blastGap      ?? 500;     // ms — gap between blasts within burst
    this.burstPause    = options.burstPause    ?? 1500;    // ms — silence after 3 blasts
    this.blastsPerCycle = options.blastsPerCycle ?? 3;
    this.volume        = options.volume        ?? 0.85;

    this.voiceEnabled  = options.voiceEnabled !== false;
    this.voiceInterval = options.voiceInterval ?? 8000;    // repeat voice every N ms
    this.onCycleStart  = options.onCycleStart  ?? null;

    this._voiceTimer = null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUDIO CONTEXT
  // ═══════════════════════════════════════════════════════════════

  _ensureCtx() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ═══════════════════════════════════════════════════════════════
  //  SINGLE FIRE ALARM BLAST — the piercing screech
  // ═══════════════════════════════════════════════════════════════

  _fireBlast(startTime, durationMs) {
    const ctx = this.ctx;
    const dur = durationMs / 1000;
    const t0  = startTime;
    const t1  = t0 + dur;

    // ── Layer 1: Primary piercing square wave (3100 Hz) ──────────
    const osc1 = ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(this.primaryFreq, t0);
    // Slight upward sweep within each blast (adds urgency)
    osc1.frequency.linearRampToValueAtTime(this.primaryFreq + 200, t1);

    // ── Layer 2: Secondary harmonic (2350 Hz) ────────────────────
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(this.secondaryFreq, t0);
    osc2.frequency.linearRampToValueAtTime(this.secondaryFreq + 150, t1);
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.6;

    // ── Layer 3: Low frequency throb (adds body/impact) ──────────
    const osc3 = ctx.createOscillator();
    osc3.type = 'sawtooth';
    osc3.frequency.setValueAtTime(this.primaryFreq / 2, t0);
    const osc3Gain = ctx.createGain();
    osc3Gain.gain.value = 0.2;

    // ── Layer 4: Rapid modulator — the "whine" texture ───────────
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 12;  // 12 Hz amplitude modulation
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15; // subtle AM wobble

    // ── Envelope: hard attack, sustained, hard cut ───────────────
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1.0, t0 + 0.005);  // 5ms attack — SNAP on
    env.gain.setValueAtTime(1.0, t1 - 0.005);
    env.gain.linearRampToValueAtTime(0, t1);              // 5ms release — SNAP off

    // ── Resonant bandpass filter (fire alarm "nasal" character) ───
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = this.primaryFreq;
    bp.Q.value = 4;  // narrow resonance = piercing

    // ── High shelf to add "air" / brightness ─────────────────────
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 4000;
    highShelf.gain.value = 6;  // boost highs = more piercing

    // ── Routing ──────────────────────────────────────────────────
    osc1.connect(bp);
    osc2.connect(osc2Gain); osc2Gain.connect(bp);
    osc3.connect(osc3Gain); osc3Gain.connect(bp);
    lfo.connect(lfoGain);   lfoGain.connect(env.gain); // AM modulation

    bp.connect(highShelf);
    highShelf.connect(env);
    env.connect(this.masterGain);

    // ── Schedule ─────────────────────────────────────────────────
    const nodes = [osc1, osc2, osc3, lfo];
    nodes.forEach(n => { n.start(t0); n.stop(t1 + 0.01); });
    this._scheduledNodes.push(...nodes);
  }

  // ═══════════════════════════════════════════════════════════════
  //  BURST CYCLE — 3 blasts → pause → repeat
  // ═══════════════════════════════════════════════════════════════

  _scheduleCycle() {
    if (!this.isPlaying) return;
    this._ensureCtx();
    if (this.onCycleStart) this.onCycleStart();

    const blastSec = this.blastDuration / 1000;
    const gapSec   = this.blastGap / 1000;
    const pauseSec = this.burstPause / 1000;

    let t = this.ctx.currentTime + 0.02; // tiny offset to avoid glitch

    for (let i = 0; i < this.blastsPerCycle; i++) {
      this._fireBlast(t, this.blastDuration);
      t += blastSec;
      if (i < this.blastsPerCycle - 1) t += gapSec;
    }

    // Total cycle time in ms
    const cycleTotalMs =
      (this.blastsPerCycle * this.blastDuration) +
      ((this.blastsPerCycle - 1) * this.blastGap) +
      this.burstPause;

    this._loopTimer = setTimeout(() => this._scheduleCycle(), cycleTotalMs);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ROBOTIC VOICE
  // ═══════════════════════════════════════════════════════════════

  _speak() {
    if (!this.voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const msg = new SpeechSynthesisUtterance(
      'ALERT. Security breach detected. System locked. ALERT.'
    );
    msg.rate   = 0.65;   // slow = menacing
    msg.pitch  = 0.3;    // very low = robotic
    msg.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const pick = voices.find(v => /david|zira|google us|alex|samantha/i.test(v.name))
              || voices.find(v => v.lang.startsWith('en'))
              || voices[0];
    if (pick) msg.voice = pick;

    window.speechSynthesis.speak(msg);
  }

  _startVoiceLoop() {
    if (!this.voiceEnabled) return;

    // Initial speak
    const doSpeak = () => {
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', () => this._speak(), { once: true });
      } else {
        this._speak();
      }
    };

    setTimeout(doSpeak, 500);
    this._voiceTimer = setInterval(doSpeak, this.voiceInterval);
  }

  _stopVoiceLoop() {
    clearInterval(this._voiceTimer);
    window.speechSynthesis?.cancel();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this._ensureCtx();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this._scheduleCycle();
    this._startVoiceLoop();

    // Also play the external MP3 sound
    this.audioElement.currentTime = 0;
    this.audioElement.play().catch(e => console.error("Alarm playback failed:", e));
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this._loopTimer);
    this._stopVoiceLoop();

    if (this.ctx && this.masterGain) {
      try {
        this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);
      } catch (_) {}
      setTimeout(() => {
        try { this.ctx.close(); } catch (_) {}
        this.ctx = null;
        this._scheduledNodes = [];
      }, 150);
    }

    // Pause external MP3 sound
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
  }

  toggle() {
    this.isPlaying ? this.stop() : this.start();
  }
}

// ── Export ────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SecurityAlarm };
}
