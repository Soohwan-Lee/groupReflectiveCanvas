import { VADClient, SpeechSegment } from './vadClient'

export class ParticipantTranscriber {
  private vad: VADClient
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private participantId: string

  constructor(participantId: string, stream: MediaStream) {
    this.participantId = participantId

    this.vad = new VADClient({
      stream,
      onSpeechStart: () => {
        // fresh recorder for each utterance
        this.chunks = []
        try {
          this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 48000,
          })
        } catch (e) {
          console.error('MediaRecorder init error', e)
          return
        }
        this.mediaRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) this.chunks.push(ev.data)
        }
        this.mediaRecorder.start()
      },
      onSpeechEnd: seg => this.handleSpeechEnd(seg),
    })
  }

  async start() {
    await this.vad.start()
  }

  stop() {
    this.vad.stop()
    this.mediaRecorder?.stop()
  }

  dispose() {
    this.vad.dispose()
    this.mediaRecorder?.stop()
    this.mediaRecorder = null
  }

  private async handleSpeechEnd(_seg: SpeechSegment) {
    if (!this.mediaRecorder) return
    // Wait for recorder to deliver final data
    await new Promise((resolve) => {
      this.mediaRecorder!.onstop = resolve
      this.mediaRecorder!.stop()
    })

    const blob = new Blob(this.chunks, { type: 'audio/webm' })
    console.log(`[VAD] utterance captured (${(blob.size / 1024).toFixed(1)} KB) for`, this.participantId)

    try {
      const res = await fetch('/api/whisper-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: blob,
      })
      const json = await res.json()
      if (res.ok && json.text) {
        console.log(`[Whisper][${this.participantId}]`, json.text)
      } else {
        console.warn('whisper error', json)
      }
    } catch (e) {
      console.error('fetch whisper error', e)
    }
  }
} 