// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useRef, useState } from 'react'
// 기존 VAD/Whisper 관련 import 제거
// import DailyIframe, { DailyCall } from '@daily-co/daily-js'
// import { MicVAD } from '@ricky0123/vad'

interface VoiceChatProps {
  userName: string;
}

export default function VoiceChat({ userName }: VoiceChatProps) {
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<any[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  // WebSocket으로 오디오 스트림 전송
  const startRealtimeTranscription = async () => {
    setJoining(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const ws = new WebSocket('wss://api.openai.com/v1/audio/realtime?api_key=YOUR_OPENAI_KEY')
      wsRef.current = ws
      ws.onopen = () => {
        setJoined(true)
        setJoining(false)
        const audioContext = new AudioContext({ sampleRate: 16000 })
        audioContextRef.current = audioContext
        const source = audioContext.createMediaStreamSource(stream)
        sourceNodeRef.current = source
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor
        source.connect(processor)
        processor.connect(audioContext.destination)
        processor.onaudioprocess = (e) => {
          if (!micOn) return
          const input = e.inputBuffer.getChannelData(0)
          const pcm = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            let s = Math.max(-1, Math.min(1, input[i]))
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          ws.send(pcm.buffer)
        }
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            turn_detection: {
              type: 'server_vad', // 또는 'semantic_vad'
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        }))
      }
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'input_audio_buffer.speech_started') {
          // 음성 시작 이벤트 처리 (원하면 UI 표시)
        }
        if (data.type === 'input_audio_buffer.speech_stopped') {
          // 음성 종료 이벤트 처리 (원하면 UI 표시)
        }
        if (data.type === 'transcript') {
          setTranscripts((prev) => [...prev, { ...data, userName }])
        }
      }
      ws.onerror = (e) => {
        setErrorMsg('WebSocket error')
        setJoining(false)
      }
      ws.onclose = () => {
        setJoined(false)
        setJoining(false)
      }
    } catch (err) {
      setErrorMsg('Failed to start voice chat')
      setJoining(false)
    }
  }

  const stopRealtimeTranscription = () => {
    if (wsRef.current) wsRef.current.close()
    if (processorRef.current) processorRef.current.disconnect()
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect()
    if (audioContextRef.current) audioContextRef.current.close()
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop())
    setJoined(false)
    setJoining(false)
  }

  const handleMicToggle = () => {
    setMicOn((on) => !on)
  }

  return (
    <div style={{ position: 'fixed', left: 20, bottom: 60, zIndex: 30, display: 'flex', gap: 8 }}>
      {!joined ? (
        <button
          onClick={startRealtimeTranscription}
          style={{
            minWidth: 100,
            height: 40,
            borderRadius: 20,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            fontSize: 15,
            boxShadow: '0 2px 8px #0002',
            cursor: 'pointer',
            transition: 'background 0.2s',
            padding: '0 20px',
            opacity: joining ? 0.6 : 1,
          }}
          disabled={joining}
        >
          {joining ? 'Joining...' : 'Join Voice'}
        </button>
      ) : (
        <>
          <button
            onClick={stopRealtimeTranscription}
            style={{
              minWidth: 40,
              height: 40,
              borderRadius: 20,
              background: '#e11d48',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: 15,
              boxShadow: '0 2px 8px #0002',
              cursor: 'pointer',
              transition: 'background 0.2s',
              padding: '0 16px',
            }}
          >
            Leave
          </button>
          <button
            onClick={handleMicToggle}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: micOn ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)',
              color: '#fff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px #0002',
              cursor: 'pointer',
              transition: 'background 0.2s',
              position: 'relative',
            }}
            aria-label={micOn ? 'Turn mic off' : 'Turn mic on'}
            title={micOn ? 'Mic On' : 'Mic Off'}
          >
            {micOn ? (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
            ) : (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            )}
          </button>
        </>
      )}
      <div style={{ marginLeft: 16 }}>
        {transcripts.slice(-3).map((t, i) => (
          <div key={i} style={{ fontSize: 14, color: '#222' }}>
            <b>{t.userName}:</b> {t.text}
          </div>
        ))}
      </div>
      {errorMsg && <div style={{ color: 'red' }}>{errorMsg}</div>}
    </div>
  )
} 