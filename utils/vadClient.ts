export type SpeechSegment = {
  /** UTC ms of speech start according to performance.now() */
  start: number
  /** UTC ms of speech end */
  end: number
  /** mono, 16 kHz, Float32 PCM samples for the entire utterance */
  audio: Float32Array
}

export interface VADClientOptions {
  /** The MediaStream to analyse. Should contain a single mono audio track. */
  stream: MediaStream
  /** Triggered when VAD first detects speech. */
  onSpeechStart?: () => void
  /** Triggered after speech ends and final audio is available. */
  onSpeechEnd?: (segment: SpeechSegment) => void
  /** Optional VAD sensitivity (0‒1, default 0.5). Lower = more sensitive. */
  threshold?: number
}

/**
 * Thin wrapper around `MicVAD` that works with arbitrary MediaStream tracks
 * (e.g. Daily participant audio). Designed to run in the browser – no Node.js
 * polyfills required. All audio is resampled to 16 kHz mono internally so it
 * can be sent directly to Whisper.
 */
export class VADClient {
  private micVad: any | undefined
  private opts!: VADClientOptions
  private _speechStartTs = 0

  constructor(opts: VADClientOptions) {
    this.opts = opts
  }

  /** Asynchronously initializes the underlying WASM VAD engine. */
  async init() {
    if (this.micVad) return // already ready

    // Lazy-load because onnxruntime-web & wasm bundle are ~5 MB
    const { MicVAD } = await import('@ricky0123/vad-web')

    this.micVad = await MicVAD.new({
      // Use provided stream instead of prompting new getUserMedia
      sourceMediaStream: this.opts.stream,
      // Adjust threshold if provided (defaults are usually fine)
      positiveSpeechThreshold: this.opts.threshold ?? 0.6,
      negativeSpeechThreshold: (this.opts.threshold ?? 0.6) / 2,

      onSpeechStart: () => {
        this._speechStartTs = performance.now()
        this.opts.onSpeechStart?.()
      },
      onSpeechEnd: (audio: Float32Array) => {
        const seg: SpeechSegment = {
          start: this._speechStartTs,
          end: performance.now(),
          audio,
        }
        this.opts.onSpeechEnd?.(seg)
      },
    } as any)
  }

  /** Begin analysing audio for speech. */
  async start() {
    if (!this.micVad) await this.init()
    await this.micVad?.start()
  }

  /** Stop analysing audio (VAD engine paused). */
  stop() {
    this.micVad?.pause()
  }

  /** Release WASM & AudioContext resources. */
  dispose() {
    this.micVad?.destroy()
    this.micVad = undefined
  }
} 