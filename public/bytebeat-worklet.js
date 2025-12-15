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
    this._lastRawL = 0;
    this._lastRawR = 0;
    
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
        this._t = 0;
        this._phase = 0;
        this._fn = () => 0;
        this._lastGoodFn = this._fn;
        deleteUserGlobals();
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channelL = output[0];
    const channelR = output[1] || channelL;
    const stereo = output.length > 1;
    const fn = this._fn;
    try {
      let t = this._t | 0;
      let phase = this._phase;
      let lastRawL = this._lastRawL;
      let lastRawR = this._lastRawR;
      const ratio = this._targetRate / sampleRate;

      if (t === 0 && phase === 0) {
        const result = fn(0);
        if (this._mode === 'float') {
          if (Array.isArray(result)) {
            lastRawL = Math.max(-1, Math.min(1, Number(result[0]) || 0));
            lastRawR = Math.max(-1, Math.min(1, Number(result[1]) || 0));
          } else {
            const v = Math.max(-1, Math.min(1, Number(result) || 0));
            lastRawL = v;
            lastRawR = v;
          }
        } else {
          if (Array.isArray(result)) {
            lastRawL = result[0] | 0;
            lastRawR = result[1] | 0;
          } else {
            lastRawL = result | 0;
            lastRawR = lastRawL;
          }
        }
      }

      if (this._mode === 'float') {
        for (let i = 0; i < channelL.length; i += 1) {
          phase += ratio;
          if (phase >= 1) {
            const steps = Math.floor(phase);
            phase -= steps;
            t += steps;
            const result = fn(t);
            if (Array.isArray(result)) {
              lastRawL = Math.max(-1, Math.min(1, Number(result[0]) || 0));
              lastRawR = Math.max(-1, Math.min(1, Number(result[1]) || 0));
            } else {
              const v = Math.max(-1, Math.min(1, Number(result) || 0));
              lastRawL = v;
              lastRawR = v;
            }
          }

          channelL[i] = lastRawL;
          if (stereo) channelR[i] = lastRawR;
          this._levelSumSquares += lastRawL * lastRawL;
          this._levelSampleCount += 1;
        }
      } else {
        for (let i = 0; i < channelL.length; i += 1) {
          phase += ratio;
          if (phase >= 1) {
            const steps = Math.floor(phase);
            phase -= steps;
            t += steps;
            const result = fn(t);
            if (Array.isArray(result)) {
              lastRawL = result[0] | 0;
              lastRawR = result[1] | 0;
            } else {
              lastRawL = result | 0;
              lastRawR = lastRawL;
            }
          }

          const byteL = this._mode === 'uint8' ? lastRawL & 0xff : (lastRawL + 128) & 0xff;
          const byteR = this._mode === 'uint8' ? lastRawR & 0xff : (lastRawR + 128) & 0xff;
          const sampleL = (byteL - 128) / 128;
          const sampleR = (byteR - 128) / 128;
          channelL[i] = sampleL;
          if (stereo) channelR[i] = sampleR;
          this._levelSumSquares += sampleL * sampleL;
          this._levelSampleCount += 1;
        }
      }

      this._t = t;
      this._phase = phase;
      this._lastRawL = lastRawL;
      this._lastRawR = lastRawR;

      if (this._fn) {
        this._lastGoodFn = this._fn;
      }
    } catch (e) {
      for (let i = 0; i < channelL.length; i += 1) {
        channelL[i] = 0;
        if (stereo) channelR[i] = 0;
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
