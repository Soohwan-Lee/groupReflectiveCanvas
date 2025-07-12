// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useEffect, useRef, useState } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'
import { MicVAD } from '@ricky0123/vad'

const ROOM_URL = 'https://soohwan.daily.co/upOFJOWxqCOhRYldrIsR'

interface TranscriptionMessage {
  text: string
  is_final: boolean
  session_id: string
  user_name?: string
}

// 1. VoiceChat 컴포넌트가 userName: string prop을 받도록 수정
interface VoiceChatProps {
  userName: string;
}

export default function VoiceChat({ userName }: VoiceChatProps) {
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
  const vadRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferQueue = useRef<Float32Array[]>([]);
  const vadActiveRef = useRef(false);

  // 음성 구간이 감지될 때마다 오디오 버퍼를 모아서 Whisper로 전송
  const sendAudioBufferToWhisper = async (buffer: Float32Array) => {
    function encodeWAV(buffer: Float32Array, sampleRate: number) {
      const length = buffer.length;
      const wavBuffer = new ArrayBuffer(44 + length * 2);
      const view = new DataView(wavBuffer);
      view.setUint32(0, 0x52494646, false);
      view.setUint32(4, 36 + length * 2, true);
      view.setUint32(8, 0x57415645, false);
      view.setUint32(12, 0x666d7420, false);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      view.setUint32(36, 0x64617461, false);
      view.setUint32(40, length * 2, true);
      let offset = 44;
      for (let i = 0; i < buffer.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, buffer[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return new Blob([wavBuffer], { type: 'audio/wav' });
    }
    const sampleRate = audioContextRef.current?.sampleRate || 16000;
    const audioBlob = encodeWAV(buffer, sampleRate);
    if (audioBlob.size < 1000) return;
    if (!dailySessionId) return;
    const form = new FormData();
    form.append('file', audioBlob, 'audio.wav');
    form.append('userId', dailySessionId);
    form.append('userName', userName);
    form.append('timestamp', new Date().toISOString());
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: form,
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.text) {
          console.log(`[Whisper][${data.timestamp}] ${data.userId}(${data.userName}): ${data.text}`);
        }
      } else {
        const errText = await res.text();
        console.error('Transcribe error', errText);
      }
    } catch (err) {
      console.error('Transcribe error', err);
    }
  };

  // Join/leave logic
  const handleJoin = async () => {
    console.log('[VoiceChat] Starting to join voice chat...')
    setJoining(true)
    try {
      // 1. 마이크 스트림 획득 (한 번만)
      console.log('[VoiceChat] Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const audioTrack = stream.getAudioTracks()[0]
      console.log('[VoiceChat] Microphone access granted, audio track:', audioTrack)
      // 2. Daily에 오디오 트랙만 전달
      const call = DailyIframe.createCallObject({
        userName: 'User',
        audioSource: audioTrack,
        videoSource: false,
      })
      callRef.current = call
      call.on('joined-meeting', (e) => {
        console.log('[VoiceChat] Successfully joined meeting:', e)
        setJoined(true)
        setJoining(false)
        // Daily 참가자 session_id 저장
        if (call && call.participants().local) {
          const sessionId = call.participants().local.session_id
          setDailySessionId(sessionId)
          console.log('[VoiceChat] Daily session ID set:', sessionId)
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
      // VAD + Web Audio API (MicVAD)
      vadRef.current = await MicVAD.new({
        onSpeechStart: () => {
          vadActiveRef.current = true;
        },
        onSpeechEnd: async (audio: Float32Array) => {
          vadActiveRef.current = false;
          if (audio.length > 0) {
            await sendAudioBufferToWhisper(audio);
          }
        },
      });
    } catch (err: any) {
      console.error('[VoiceChat] Failed to join audio room:', err)
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
    </>
  )
} 