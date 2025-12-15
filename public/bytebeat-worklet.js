const mathParams = Object.getOwnPropertyNames(Math);
const mathValues = mathParams.map(k => Math[k]);

// Whitelist of built-in globalThis properties captured at module init
const builtinGlobals = new Set(Object.getOwnPropertyNames(globalThis));

function deleteUserGlobals() {
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (!builtinGlobals.has(key)) {
      delete globalThis[key];
    }
  }
}

function checkMode(mode) {
  switch (mode) {
    case 'float':
      return 'float';
    case 'int8':
      return 'int8';
    default:
    case 'uint8':
      return 'uint8';
  }
}

class BytebeatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Shared state
    this._t = 0;
    this._fn = () => 0;
    this._lastGoodFn = this._fn;

    this._mode = 'uint8';
    this._targetRate = 8000;
    this._phase = 0;
    this._lastRaw = 0;
    
    // For lightweight RMS metering
    this._levelSumSquares = 0;
    this._levelSampleCount = 0;
    this._levelTargetSamples = 2048;

    this.port.onmessage = (event) => {
      const { type, expression, sampleRate: targetSampleRate, mode } = event.data || {};
      if (type === 'setExpression' && typeof expression === 'string') {
        try {
          // Update target rate first so SR gets the right value
          const hasTarget =
            typeof targetSampleRate === 'number' &&
            isFinite(targetSampleRate) &&
            targetSampleRate > 0;
          if (hasTarget) {
            this._targetRate = targetSampleRate;
          }
          deleteUserGlobals();
          const sr = this._targetRate;
          const params = [...mathParams, 'int', 'window', 'SR', 't'];
          const values = [...mathValues, Math.floor, globalThis, sr];
          this._fn = new Function(...params, `return 0,\n${expression || 0};`).bind(globalThis, ...values);
          if (this._levelSampleCount >= this._levelTargetSamples) {
            const rms = Math.sqrt(this._levelSumSquares / this._levelSampleCount) || 0;
            this.port.postMessage({ type: 'level', rms });
            this._levelSumSquares = 0;
            this._levelSampleCount = 0;
          }

          this._mode = checkMode(mode);
          this._phase = 0;
        } catch (e) {
          // On compile error, keep the previous function but notify the UI
          this.port.postMessage({
            type: 'compileError',
            message: String(e && e.message ? e.message : e),
          });
        }
      } else if (type === 'reset') {
        // Explicit reset from main thread (e.g. on Play)
        this._t = 0;
        this._phase = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channel = output[0];
    const fn = this._fn;
    try {
      let t = this._t | 0;
      let phase = this._phase;
      let lastRaw = this._lastRaw;
      const ratio = this._targetRate / sampleRate; // target samples per device sample

      // Ensure fn(0) is called on first sample for t||(init) patterns
      if (t === 0 && phase === 0) {
        if (this._mode === 'float') {
          const v = Number(fn(0)) || 0;
          lastRaw = Math.max(-1, Math.min(1, v));
        } else {
          lastRaw = fn(0) | 0;
        }
      }

      if (this._mode === 'float') {
        for (let i = 0; i < channel.length; i += 1) {
          phase += ratio;
          if (phase >= 1) {
            const steps = Math.floor(phase);
            phase -= steps;
            t += steps;
            const v = Number(fn(t)) || 0;
            lastRaw = Math.max(-1, Math.min(1, v));
          }

          const sample = lastRaw;
          channel[i] = sample;
          this._levelSumSquares += sample * sample;
          this._levelSampleCount += 1;
        }
      } else {
        for (let i = 0; i < channel.length; i += 1) {
          phase += ratio;
          if (phase >= 1) {
            const steps = Math.floor(phase);
            phase -= steps;
            t += steps;
            lastRaw = fn(t) | 0;
          }

          const byteValue = this._mode === 'uint8' ? lastRaw & 0xff : (lastRaw + 128) & 0xff;
          const sample = (byteValue - 128) / 128;
          channel[i] = sample;
          this._levelSumSquares += sample * sample;
          this._levelSampleCount += 1;
        }
      }

      this._t = t;
      this._phase = phase;
      this._lastRaw = lastRaw;

      // If we reach here without throwing, remember this function as the
      // last known-good implementation.
      if (this._fn) {
        this._lastGoodFn = this._fn;
      }
    } catch (e) {
      for (let i = 0; i < channel.length; i += 1) {
        channel[i] = 0;
      }
      this.port.postMessage({
        type: 'runtimeError',
        message: `Runtime error at t=${this._t}: ${String(e && e.message ? e.message : e)}`,
      });
      // Revert to last known-good function for subsequent blocks
      if (this._lastGoodFn) {
        this._fn = this._lastGoodFn;
      }
    }
    return true;
  }
}

// Required for AudioWorkletProcessor subclasses
registerProcessor('bytebeat-processor', BytebeatProcessor);
