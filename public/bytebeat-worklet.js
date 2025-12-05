const expressionApi = `
const PI = Math.PI;
const TAU = Math.PI * 2;
const abs = Math.abs;
const acos = Math.acos;
const asin = Math.asin;
const atan = Math.atan;
const ceil = Math.ceil;
const cos = Math.cos;
const exp = Math.exp;
const floor = Math.floor;
const log = Math.log;
const max = Math.max;
const min = Math.min;
const pow = Math.pow;
const random = Math.random;
const round = Math.round;
const sin = Math.sin;
const sqrt = Math.sqrt;
const tan = Math.tan;
const tanh = Math.tanh;
`;

class BytebeatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Shared state
    this._t = 0;
    this._fn = () => 0;
    this._lastGoodFn = this._fn;

    this._float = false;
    this._targetRate = 8000;
    this._phase = 0;
    this._lastRaw = 0;
    this._gain = 0.5;

    // For lightweight RMS metering
    this._levelSumSquares = 0;
    this._levelSampleCount = 0;
    this._levelTargetSamples = 2048;

    this.port.onmessage = (event) => {
      const { type, expression, sampleRate: targetSampleRate, float } = event.data || {};
      if (type === 'setExpression' && typeof expression === 'string') {
        try {
          const fnBody = `
${expressionApi}
return Number((${expression})) || 0;
`;
          // Install the newly compiled function; it will be promoted to
          // _lastGoodFn only after a process() block runs without error.
          this._fn = new Function('t', fnBody);
          const hasTarget =
            typeof targetSampleRate === 'number' &&
            isFinite(targetSampleRate) &&
            targetSampleRate > 0;
          if (hasTarget) {
            this._targetRate = targetSampleRate;
          }
          if (this._levelSampleCount >= this._levelTargetSamples) {
            const rms = Math.sqrt(this._levelSumSquares / this._levelSampleCount) || 0;
            this.port.postMessage({ type: 'level', rms });
            this._levelSumSquares = 0;
            this._levelSampleCount = 0;
          }

          this._float = !!float;
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
    const gain = this._gain;
    try {
      let t = this._t | 0;
      let phase = this._phase;
      let lastRaw = this._lastRaw;
      const ratio = this._targetRate / sampleRate; // target samples per device sample

      if (this._float) {
        for (let i = 0; i < channel.length; i += 1) {
          phase += ratio;
          if (phase >= 1) {
            const steps = Math.floor(phase);
            phase -= steps;
            t += steps;
            const tSeconds = t / this._targetRate;
            const v = Number(fn(tSeconds)) || 0;
            // clamp to [-1,1]
            lastRaw = Math.max(-1, Math.min(1, v));
          }

          const sample = lastRaw * gain;
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

          const byteValue = lastRaw & 0xff;
          const sample = ((byteValue - 128) / 128) * gain;
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
      // If the expression throws (e.g. ReferenceError during editing),
      // silence this buffer but keep the last valid function and report error
      for (let i = 0; i < channel.length; i += 1) {
        channel[i] = 0;
      }
      this.port.postMessage({
        type: 'runtimeError',
        message: String(e && e.message ? e.message : e),
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
