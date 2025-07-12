// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useEffect, useRef, useState } from 'react'
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
        // 오디오 스트림을 ScriptProcessor로 PCM 청크로 변환해 WebSocket으로 전송
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
          // Float32Array -> Int16Array 변환 (PCM 16bit)
          const pcm = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            let s = Math.max(-1, Math.min(1, input[i]))
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          ws.send(pcm.buffer)
        }
        // 세션 설정: VAD 모드 등
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
          // 실시간 전사 결과 처리 (DB 저장 등)
          setTranscripts((prev) => [...prev, { ...data, userName }])
          // 필요시 Supabase에 저장 fetch('/api/saveTranscript', ...)
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

  return (
    <div style={{ position: 'fixed', left: 20, bottom: 60, zIndex: 30, display: 'flex', gap: 8 }}>
      {!joined ? (
        <button onClick={startRealtimeTranscription} disabled={joining}>
          {joining ? 'Joining...' : 'Join Voice'}
        </button>
      ) : (
        <button onClick={stopRealtimeTranscription}>Leave</button>
      )}
      {/* 실시간 전사 결과(예시) */}
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