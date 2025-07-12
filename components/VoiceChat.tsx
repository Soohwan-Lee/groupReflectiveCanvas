// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useRef, useState } from 'react'
import * as VAD from '@ricky0123/vad'

interface VoiceChatProps {
  userName: string;
}

export default function VoiceChat({ userName }: VoiceChatProps) {
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<any[]>([])
  const vadRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  // 음성 구간이 감지될 때마다 Whisper로 전송
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
    const form = new FormData();
    form.append('file', audioBlob, 'audio.wav');
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

  const startVAD = async () => {
    setJoining(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext
      vadRef.current = await VAD.MicVAD.new({
        onSpeechStart: () => {},
        onSpeechEnd: async (audio: Float32Array) => {
          if (audio.length > 0 && micOn) {
            await sendAudioBufferToWhisper(audio)
          }
        },
      })
      setJoined(true)
      setJoining(false)
    } catch (err) {
      setErrorMsg('Failed to start voice chat')
      setJoining(false)
    }
  }

  const stopVAD = () => {
    if (vadRef.current) vadRef.current.pause()
    if (audioContextRef.current) audioContextRef.current.close()
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
          onClick={startVAD}
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
            onClick={stopVAD}
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