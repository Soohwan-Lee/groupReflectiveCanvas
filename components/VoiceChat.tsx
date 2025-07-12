// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useRef, useState, useEffect } from 'react'
// import * as VAD from '@ricky0123/vad'  // VAD 완전 제거

interface VoiceChatProps {
  userName: string;
}

export default function VoiceChat({ userName }: VoiceChatProps) {
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<any[]>([])
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null) // Daily 연동용
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Daily active-speaker-change 이벤트로 speakerId 추적 (실제 연동 시 아래 코드 사용)
  // useEffect(() => {
  //   call.on('active-speaker-change', p => setCurrentSpeakerId(p.session_id));
  // }, []);

  // 임시: userName을 speakerId로 사용
  useEffect(() => {
    setCurrentSpeakerId(userName)
  }, [userName])

  // 오디오 chunk를 Whisper로 전송
  const sendAudioChunkToWhisper = async (audioBlob: Blob) => {
    if (!audioBlob || audioBlob.size < 1000) return;
    const form = new FormData();
    form.append('file', audioBlob, 'audio.webm');
    form.append('userName', userName);
    form.append('sessionId', currentSpeakerId || 'unknown');
    // 아래 3개는 실제 Whisper 결과로 채워야 하지만, 우선 임시값으로라도 채움
    form.append('start_time', new Date().toISOString());
    form.append('end_time', new Date(Date.now() + 1000).toISOString());
    form.append('text', '[transcript placeholder]');
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: form,
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.text) {
          setTranscripts((prev) => [...prev, { ...data, userName }])
        }
      } else {
        const errText = await res.text();
        setErrorMsg('Transcribe error: ' + errText)
      }
    } catch (err) {
      setErrorMsg('Transcribe error')
    }
  }

  const startRecording = async () => {
    setJoining(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && micOn) {
          sendAudioChunkToWhisper(e.data)
        }
      }
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
      }
      mediaRecorder.start(15000) // 15초마다 chunk
      setJoined(true)
      setJoining(false)
    } catch (err) {
      setErrorMsg('Failed to start voice chat')
      setJoining(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
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
          onClick={startRecording}
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
            onClick={stopRecording}
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