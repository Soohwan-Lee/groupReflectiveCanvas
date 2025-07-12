// Vite env type for TypeScript
/// <reference types="vite/client" />
import React, { useEffect, useRef, useState } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'

const ROOM_URL = 'https://soohwan.daily.co/xL84zG8xEXXiCrrARCR6'

// 트랜스크립션 메시지 타입 정의
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
  // Track remote audio elements by participant session_id
  const audioElements = useRef<{ [id: string]: HTMLAudioElement }>({})
  const [transcripts, setTranscripts] = useState<{
    id: string
    text: string
    user: string
    isFinal: boolean
  }[]>([])
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)

  // 1. Join/leave logic (user gesture required)
  const handleJoin = async () => {
    setJoining(true)
    try {
      const call = DailyIframe.createCallObject({
        userName: 'User',
        audioSource: true,
        videoSource: false,
      })
      callRef.current = call
      call.on('joined-meeting', async (e) => {
        console.log('[Daily] joined-meeting', e)
        setJoined(true)
        setJoining(false)
        // 트랜스크립션 자동 시작 (오너 권한 필요)
        try {
          setIsTranscribing(true)
          await call.startTranscription()
        } catch (err: any) {
          setTranscriptionError('Failed to start transcription')
          setIsTranscribing(false)
        }
      })
      call.on('left-meeting', (e) => {
        console.log('[Daily] left-meeting', e)
        setJoined(false)
        setJoining(false)
        setIsTranscribing(false)
        setTranscriptionError(null)
        setTranscripts([])
        cleanupAudioElements()
      })
      call.on('error', (e) => {
        console.error('[Daily] error', e)
        setErrorMsg('Audio connection error')
        setAudioWorking(false)
      })
      // 트랜스크립션 관련 이벤트 등록
      call.on('transcription-started', () => {
        setIsTranscribing(true)
        setTranscriptionError(null)
      })
      call.on('transcription-stopped', () => {
        setIsTranscribing(false)
      })
      call.on('transcription-error', (e: any) => {
        setTranscriptionError('Transcription error')
        setIsTranscribing(false)
      })
      // 실시간 자막 메시지 수신
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
          },
        ])
      })
      await call.join({ url: ROOM_URL })
      call.setLocalAudio(micOn)
    } catch (err: any) {
      setErrorMsg('Failed to join audio room')
      setAudioWorking(false)
      setJoining(false)
      console.error('[Daily] join error', err)
    }
  }

  const handleLeave = () => {
    if (callRef.current) {
      callRef.current.leave()
      callRef.current.destroy()
      callRef.current = null
    }
    setJoined(false)
    setAudioWorking(true)
    setErrorMsg(null)
    setIsTranscribing(false)
    setTranscriptionError(null)
    setTranscripts([])
    cleanupAudioElements()
  }

  // 2. Mic toggle (only after join)
  const handleMicToggle = () => {
    setMicOn((on) => {
      if (callRef.current) {
        callRef.current.setLocalAudio(!on)
      }
      return !on
    })
  }

  // 3. Minimal audio attach/detach logic per Daily best practice
  useEffect(() => {
    const call = callRef.current
    if (!call) return
    // Attach remote audio on track-started
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
      audio.play().catch((err) => {
        console.error('Audio play() failed:', err)
        setErrorMsg('Audio playback blocked by browser')
        setAudioWorking(false)
      })
    }
    // Remove audio on track-stopped
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

  // 4. Minimal UI: join/leave/mic, bottom left, error indicator if audio not working
  // 5. 실시간 트랜스크립션 UI (하단 중앙)
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
              {!audioWorking && (
                <span style={{ position: 'absolute', top: 2, right: 2 }} title={errorMsg || 'Audio not working'}>
                  <svg width="14" height="14" fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1"/></svg>
                </span>
              )}
            </button>
          </>
        )}
      </div>
      {/* 트랜스크립션 자막 UI */}
      {joined && (
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
            opacity: transcriptToShow ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
        >
          {isTranscribing ? (
            transcriptToShow ? (
              <>
                <span style={{ color: '#38bdf8', marginRight: 8 }}>{transcriptToShow.user}:</span>
                <span>{transcriptToShow.text}</span>
              </>
            ) : (
              <span style={{ color: '#94a3b8' }}>Listening...</span>
            )
          ) : transcriptionError ? (
            <span style={{ color: '#f87171' }}>{transcriptionError}</span>
          ) : null}
        </div>
      )}
    </>
  )
} 