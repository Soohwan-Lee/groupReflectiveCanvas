import React, { useRef, useState } from 'react';

interface TranscriptLog {
  timestamp: string;
  userId: string;
  text: string;
}

const USER_ID = `user-${Math.random().toString(36).slice(2, 8)}`;

export default function VoiceTranscriber() {
  const [recording, setRecording] = useState(false);
  const [logs, setLogs] = useState<TranscriptLog[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const handleStart = async () => {
    if (recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new window.MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const form = new FormData();
        form.append('file', e.data, 'audio.webm');
        form.append('userId', USER_ID);
        form.append('timestamp', new Date().toISOString());
        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: form,
          });
          const data = await res.json();
          if (data.text) {
            setLogs((prev) => [...prev, { timestamp: data.timestamp, userId: data.userId, text: data.text }]);
            console.log(`[Whisper] [${data.timestamp}] ${data.userId}: ${data.text}`);
          }
        } catch (err) {
          console.error('Transcribe error', err);
        }
      }
    };
    recorder.start(3000); // 3초마다 청크 전송 (VAD 미적용)
    setRecording(true);
  };

  const handleStop = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    setRecording(false);
  };

  return (
    <div style={{ position: 'fixed', left: 20, bottom: 120, zIndex: 30, background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px #0002', minWidth: 240 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>Whisper 실시간 전사 (DEMO)</div>
      <button onClick={recording ? handleStop : handleStart} style={{ marginBottom: 12, padding: '8px 16px', borderRadius: 8, background: recording ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
        {recording ? '녹음 중지' : '녹음 시작'}
      </button>
      <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 14 }}>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <span style={{ color: '#888', fontSize: 12 }}>{log.timestamp.slice(11, 19)}</span> <b>{log.userId}</b>: {log.text}
          </div>
        ))}
      </div>
    </div>
  );
} 