const expressionApi = `
const E = Math.E;
const LN10 = Math.LN10;
const LN2 = Math.LN2;
const LOG2E = Math.LOG2E;
const PI = Math.PI;
const SQRT1_2 = Math.SQRT1_2;
const SQRT2 = Math.SQRT2;
const TAU = Math.PI * 2;
const abs = Math.abs;
const acos = Math.acos;
const acosh = Math.acosh;
const asin = Math.asin;
const asinh = Math.asinh;
const atan = Math.atan;
const atanh = Math.atanh;
const cbrt = Math.cbrt;
const ceil = Math.ceil;
const clz32 = Math.clz32;
const cos = Math.cos;
const cosh = Math.cosh;
const exp = Math.exp;
const expm1 = Math.expm1;
const floor = Math.floor;
const fround = Math.fround;
const hypot = Math.hypot;
const imul = Math.imul;
const log = Math.log;
const log10 = Math.log10;
const log1p = Math.log1p;
const log2 = Math.log2;
const max = Math.max;
const min = Math.min;
const pow = Math.pow;
const random = Math.random;
const round = Math.round;
const sign = Math.sign;
const sin = Math.sin;
const sinh = Math.sinh;
const sqrt = Math.sqrt;
const tan = Math.tan;
const tanh = Math.tanh;
const trunc = Math.trunc;
const SR = sr;
`;

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
          const fnBody = `
${expressionApi}
return Number((${expression})) || 0;
`;
          // Install the newly compiled function; it will be promoted to
          // _lastGoodFn only after a process() block runs without error.
          this._fn = new Function('t', 'sr', fnBody);
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

      if (this._mode === 'float') {
        for (let i = 0; i < channel.length; i += 1) {
          phase += ratio;
          if (phase >= 1) {
            const steps = Math.floor(phase);
            phase -= steps;
            t += steps;
            const tSeconds = t / this._targetRate;
            const v = Number(fn(tSeconds, this._targetRate)) || 0;
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
            lastRaw = fn(t, this._targetRate) | 0;
          }

          const byteValue = this._mode === 'uint8' ? (lastRaw & 0xff) : ((lastRaw + 128) & 0xff);
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
