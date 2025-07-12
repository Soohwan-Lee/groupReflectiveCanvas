// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useEffect, useRef, useState } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'

const ROOM_URL = 'https://soohwan.daily.co/upOFJOWxqCOhRYldrIsR'

interface TranscriptionMessage {
  text: string
  is_final: boolean
  session_id: string
  user_name?: string
}

export default function VoiceChat() {
  const [micOn, setMicOn] = useState(true)
  const callRef = useRef<DailyCall | null>(null)
  const [joined, setJoined] = useState(false)
  const [audioWorking, setAudioWorking] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const audioElements = useRef<{ [id: string]: HTMLAudioElement }>({})
  const [transcripts, setTranscripts] = useState<{
    id: string
    text: string
    user: string
    isFinal: boolean
    source: 'daily' | 'whisper'
  }[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const whisperUserId = useRef(`user-${Math.random().toString(36).slice(2, 8)}`)
  const [dailySessionId, setDailySessionId] = useState<string | null>(null);

  // Join/leave logic
  const handleJoin = async () => {
    setJoining(true)
    try {
      // 1. 마이크 스트림 획득 (한 번만)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const audioTrack = stream.getAudioTracks()[0]
      // 2. Daily에 오디오 트랙만 전달
      const call = DailyIframe.createCallObject({
        userName: 'User',
        audioSource: audioTrack,
        videoSource: false,
      })
      callRef.current = call
      call.on('joined-meeting', (e) => {
        setJoined(true)
        setJoining(false)
        // Daily 참가자 session_id 저장
        if (call && call.participants().local) {
          setDailySessionId(call.participants().local.session_id)
        }
      })
      call.on('left-meeting', (e) => {
        setJoined(false)
        setJoining(false)
        setTranscripts([])
        cleanupAudioElements()
      })
      call.on('error', (e) => {
        setErrorMsg('Audio connection error')
        setAudioWorking(false)
      })
      // Daily transcription-message (자막 UI용, 필요시)
      call.on('transcription-message', (ev: any) => {
        const msg = ev.data as TranscriptionMessage
        if (!msg || !msg.text) return
        setTranscripts((prev) => [
          ...prev,
          {
            id: `${msg.session_id}-${Date.now()}`,
            text: msg.text,
            user: msg.user_name || msg.session_id,
            isFinal: msg.is_final,
            source: 'daily',
          },
        ])
      })
      await call.join({ url: ROOM_URL })
      call.setLocalAudio(micOn)
      // 3. Whisper용 MediaRecorder 시작 (3초마다 청크)
      const recorder = new window.MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0 && dailySessionId) {
          const form = new FormData()
          form.append('file', e.data, 'audio.webm')
          form.append('userId', dailySessionId)
          form.append('timestamp', new Date().toISOString())
          try {
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              body: form,
            })
            const contentType = res.headers.get('content-type') || ''
            if (res.ok && contentType.includes('application/json')) {
              const data = await res.json()
              if (data.text) {
                // 콘솔에 실시간 출력
                console.log(`[Whisper][${data.timestamp}] ${data.userId}: ${data.text}`)
                setTranscripts((prev) => [
                  ...prev,
                  {
                    id: `whisper-${data.timestamp}`,
                    text: data.text,
                    user: data.userId,
                    isFinal: true,
                    source: 'whisper',
                  },
                ])
              }
            } else {
              const errText = await res.text()
              console.error('Transcribe error', errText)
            }
          } catch (err) {
            console.error('Transcribe error', err)
          }
        }
      }
      recorder.start(3000) // 3초마다 청크
    } catch (err: any) {
      setErrorMsg('Failed to join audio room')
      setAudioWorking(false)
      setJoining(false)
    }
  }

  const handleLeave = () => {
    if (callRef.current) {
      callRef.current.leave()
      callRef.current.destroy()
      callRef.current = null
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    setJoined(false)
    setAudioWorking(true)
    setErrorMsg(null)
    setTranscripts([])
    cleanupAudioElements()
  }

  const handleMicToggle = () => {
    setMicOn((on) => {
      if (callRef.current) {
        callRef.current.setLocalAudio(!on)
      }
      return !on
    })
  }

  useEffect(() => {
    const call = callRef.current
    if (!call) return
    const onTrackStarted = (ev: any) => {
      if (ev.track.kind !== 'audio' || ev.participant.local) return
      const sessionId = ev.participant.session_id
      if (audioElements.current[sessionId]) return
      const audio = document.createElement('audio') as HTMLAudioElement & { playsInline?: boolean }
      audio.autoplay = true
      audio.playsInline = true
      audio.srcObject = new MediaStream([ev.track])
      audio.style.display = 'none'
      document.body.appendChild(audio)
      audioElements.current[sessionId] = audio
      audio.play().catch(() => {
        setErrorMsg('Audio playback blocked by browser')
        setAudioWorking(false)
      })
    }
    const onTrackStopped = (ev: any) => {
      if (ev.track.kind !== 'audio' || ev.participant.local) return
      const sessionId = ev.participant.session_id
      const audio = audioElements.current[sessionId]
      if (audio) {
        audio.pause()
        audio.srcObject = null
        if (audio.parentNode) audio.parentNode.removeChild(audio)
        delete audioElements.current[sessionId]
      }
    }
    call.on('track-started', onTrackStarted)
    call.on('track-stopped', onTrackStopped)
    return () => {
      call.off('track-started', onTrackStarted)
      call.off('track-stopped', onTrackStopped)
      cleanupAudioElements()
    }
  }, [callRef.current])

  function cleanupAudioElements() {
    Object.values(audioElements.current).forEach((audio) => {
      audio.pause()
      audio.srcObject = null
      if (audio.parentNode) audio.parentNode.removeChild(audio)
    })
    audioElements.current = {}
  }

  // 가장 최근 transcript (whisper > daily 우선)
  const transcriptToShow = transcripts.length > 0 ? transcripts[transcripts.length - 1] : null

  return (
    <>
      {/* 기존 음성 UI */}
      <div style={{ position: 'fixed', left: 20, bottom: 60, zIndex: 30, display: 'flex', gap: 8 }}>
        {!joined ? (
          <button
            onClick={handleJoin}
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
              onClick={handleLeave}
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
      </div>
      {/* 트랜스크립션 자막 UI (whisper > daily 우선) */}
      {joined && transcriptToShow && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 20,
            transform: 'translateX(-50%)',
            background: 'rgba(30,41,59,0.92)',
            color: '#fff',
            borderRadius: 16,
            padding: '8px 20px',
            fontSize: 18,
            fontWeight: 500,
            minWidth: 200,
            maxWidth: 600,
            textAlign: 'center',
            boxShadow: '0 2px 12px #0003',
            zIndex: 40,
            pointerEvents: 'none',
            opacity: 1,
            transition: 'opacity 0.2s',
          }}
        >
          <span style={{ color: transcriptToShow.source === 'whisper' ? '#38bdf8' : '#fbbf24', marginRight: 8 }}>{transcriptToShow.user}:</span>
          <span>{transcriptToShow.text}</span>
          {transcriptToShow.source === 'whisper' && <span style={{ fontSize: 12, color: '#38bdf8', marginLeft: 8 }}>(AI)</span>}
        </div>
      )}
    </>
  )
} 