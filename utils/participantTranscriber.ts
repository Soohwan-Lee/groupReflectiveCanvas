import { VADClient, SpeechSegment } from './vadClient'

export class ParticipantTranscriber {
  private vad: VADClient
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private participantId: string
  private sessionId: string
  private userName?: string

  constructor(args: { sessionId: string; participantId: string; stream: MediaStream; userName?: string }) {
    const { sessionId, participantId, stream, userName } = args
    this.participantId = participantId
    this.sessionId = sessionId
    this.userName = userName

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
    console.log(`[VAD] utterance captured ${(blob.size / 1024).toFixed(1)} KB`, this.participantId)

    try {
      const res = await fetch('/api/whisper-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: blob,
      })
      const json = await res.json()
      if (res.ok && json.text) {
        console.log(`[Whisper][${this.participantId}]`, json.text)

        // send to Supabase
        await fetch('/api/save-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: this.sessionId,
            participant_id: this.participantId,
            user_name: this.userName || null,
            start_time: new Date().toISOString(),
            text: json.text,
          }),
        })
      } else {
        console.warn('whisper error', json)
      }
    } catch (e) {
      console.error('whisper/supabase error', e)
    }
  }
} 