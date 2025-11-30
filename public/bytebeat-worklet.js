const expressionApi = `const abs = Math.abs;
const sin = Math.sin;
const cos = Math.cos;
const tan = Math.tan;
const asin = Math.asin;
const acos = Math.acos;
const atan = Math.atan;
const tanh = Math.tanh;
const floor = Math.floor;
const ceil = Math.ceil;
const round = Math.round;
const sqrt = Math.sqrt;
const log = Math.log;
const exp = Math.exp;
const pow = Math.pow;
const PI = Math.PI;
const TAU = Math.PI * 2;
const min = Math.min;
const max = Math.max;
const random = Math.random;`;

class BytebeatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Shared state
    this._t = 0;
    this._fn = (t) => 0;
    this._lastGoodFn = this._fn;

    // Modern mode: evaluate at device rate with fractional t
    this._step = 8000 / sampleRate; // default target 8 kHz

    // Classic mode: emulate rendering at target SR with naive resampling
    this._classic = false;
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
      const { type, expression, sampleRate: targetSampleRate, classic, float } = event.data || {};
      if (type === 'setExpression' && typeof expression === 'string') {
        try {
          // eslint-disable-next-line no-new-func
          const fnBody = `
${expressionApi}
function plot(x) { return x; }
return Number((${expression})) || 0;
`;
          const fn = new Function('t', fnBody);
          // Install the newly compiled function; it will be promoted to
          // _lastGoodFn only after a process() block runs without error.
          this._fn = fn;
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

          this._classic = !!classic;
          this._float = !!float;

          if (this._classic) {
            // Classic: integer t, sample-and-hold resampling
            // Preserve time counter; only reset resampling phase so the
            // transition is smooth but time base stays continuous.
            this._phase = 0;
          } else {
            // Modern: fractional t stepping
            const effectiveRate = hasTarget ? this._targetRate : 8000;
            this._step = effectiveRate / sampleRate;
          }
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
      if (this._classic) {
        // Classic mode: emulate rendering at target SR then resample to device SR.
        // In 8-bit mode we use integer sample-and-hold; in float mode we sample-and-hold
        // float values in [-1, 1].
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
      } else {
        // Modern mode: evaluate expression once per device sample at fractional t
        let t = this._t;
        const step = this._step;

        if (this._float) {
          for (let i = 0; i < channel.length; i += 1) {
            const tSeconds = t / this._targetRate;
            const v = Number(fn(tSeconds)) || 0;
            const sample = Math.max(-1, Math.min(1, v));
            const out = sample * gain;
            channel[i] = out;
            this._levelSumSquares += out * out;
            this._levelSampleCount += 1;
            t += step;
          }
        } else {
          for (let i = 0; i < channel.length; i += 1) {
            const raw = fn(t) | 0; // integer sample
            const byteValue = raw & 0xff;
            const sample = ((byteValue - 128) / 128) * gain;
            channel[i] = sample;
            this._levelSumSquares += sample * sample;
            this._levelSampleCount += 1;
            t += step;
          }
        }

        this._t = t;
      }
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
