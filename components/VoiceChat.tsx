// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useRef, useState, useEffect } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'

interface VoiceChatProps {
  userName: string;
}

export default function VoiceChat({ userName }: VoiceChatProps) {
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null)
  const callRef = useRef<DailyCall | null>(null)
  const remoteAudios = useRef<Record<string, HTMLAudioElement>>({})
  const [transcripts, setTranscripts] = useState<{ user: string; text: string }[]>([])

  // Daily 룸 URL (퍼블릭 룸, 토큰 불필요)
  const DAILY_URL = 'https://soohwan.daily.co/upOFJOWxqCOhRYldrIsR';

  useEffect(() => {
    return () => {
      if (callRef.current) {
        callRef.current.leave();
        callRef.current.destroy();
        callRef.current = null;
      }
    };
  }, []);

  // remote audio attach / detach helpers
  const attachRemoteAudio = (participantId: string, track: MediaStreamTrack) => {
    const stream = new MediaStream([track])
    const audioEl = new Audio()
    audioEl.srcObject = stream
    audioEl.autoplay = true
    audioEl.setAttribute('playsinline', 'true')
    audioEl.muted = false
    // 꼬여서 무음이 되는 것을 방지하기 위해 volume 1 유지
    audioEl.volume = 1
    remoteAudios.current[participantId] = audioEl
  }

  const detachRemoteAudio = (participantId: string) => {
    const audioEl = remoteAudios.current[participantId]
    if (audioEl) {
      audioEl.pause()
      // 스트림 정리
      const stream = audioEl.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      audioEl.srcObject = null
      delete remoteAudios.current[participantId]
    }
  }

  // register track-started / track-stopped / participant-left listeners once after call object exists
  useEffect(() => {
    if (!callRef.current) return

    const handleTrackStarted = (ev: any) => {
      if (ev.track.kind === 'audio' && ev.participant.session_id !== callRef.current?.participants().local?.session_id) {
        attachRemoteAudio(ev.participant.session_id, ev.track)
      }
    }
    const handleTrackStopped = (ev: any) => {
      if (ev.track.kind === 'audio') {
        detachRemoteAudio(ev.participant.session_id)
      }
    }
    const handleParticipantLeft = (ev: any) => {
      detachRemoteAudio(ev.participant.session_id)
    }

    callRef.current.on('track-started', handleTrackStarted)
    callRef.current.on('track-stopped', handleTrackStopped)
    callRef.current.on('participant-left', handleParticipantLeft)

    return () => {
      callRef.current?.off('track-started', handleTrackStarted)
      callRef.current?.off('track-stopped', handleTrackStopped)
      callRef.current?.off('participant-left', handleParticipantLeft)
    }
  }, [callRef.current])

  // transcription-message handler 등록
  useEffect(() => {
    if (!callRef.current) return

    const handleTransMsg = async (msg: any) => {
      // Daily docs: msg contains fields: text, silent, speaker, timestamp, words
      if (!msg?.text) return
      const participantId = msg.speaker
      const participant = callRef.current?.participants()[participantId]
      const userNameFromDaily = participant?.user_name || 'Unknown'
      const sessionIdStr = DAILY_URL
      const payload = {
        session_id: sessionIdStr,
        participant_id: participantId,
        user_name: userNameFromDaily,
        start_time: new Date().toISOString(),
        text: msg.text,
      }
      // Optimistic UI 업데이트
      setTranscripts((prev) => [...prev.slice(-19), { user: userNameFromDaily, text: msg.text }])
      try {
        await fetch('/api/save-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch (e) {
        console.error('save-transcript error', e)
      }
    }

    callRef.current.on('transcription-message', handleTransMsg)
    return () => {
      callRef.current?.off('transcription-message', handleTransMsg)
    }
  }, [callRef.current])

  // 수정: joined 후 startTranscription()
  const joinCall = async () => {
    setJoining(true)
    try {
      if (!callRef.current) {
        callRef.current = DailyIframe.createCallObject();
      }
      callRef.current.on('joined-meeting', async () => {
        setJoined(true);
        setJoining(false);
        setErrorMsg(null);
        try {
          await callRef.current?.startTranscription()
        } catch (e) {
          console.warn('startTranscription error', e)
        }
      });
      callRef.current.on('left-meeting', () => {
        setJoined(false);
        setJoining(false);
      });
      callRef.current.on('active-speaker-change', (ev) => {
        setCurrentSpeakerId(ev.activeSpeaker.peerId);
      });
      callRef.current.on('error', (ev) => {
        setErrorMsg('Daily error: ' + ev.errorMsg);
      });
      await callRef.current.join({
        url: DAILY_URL,
        userName,
        audioSource: true,
        videoSource: false,
      });
    } catch (err) {
      setErrorMsg('Failed to join Daily call');
      setJoining(false);
    }
  };

  const leaveCall = () => {
    if (callRef.current) {
      callRef.current.leave();
    }
  };

  const handleMicToggle = () => {
    setMicOn((on) => {
      if (callRef.current) {
        callRef.current.setLocalAudio(!on);
      }
      return !on;
    });
  };

  // 오디오 트랙 상태는 participant-updated 이벤트에서 확인 가능 (필요시 확장)
  useEffect(() => {
    if (!callRef.current) return;
    const handler = (ev: any) => {
      // ev.participant 오브젝트에 오디오 상태 등 정보가 있음
      // 예: ev.participant.audio, ev.participant.user_name 등
      // 필요시 상태 업데이트 가능
      // console.log('participant-updated', ev.participant);
    };
    callRef.current.on('participant-updated', handler);
    return () => {
      callRef.current?.off('participant-updated', handler);
    };
  }, [callRef.current]);

  return (
    <div style={{ position: 'fixed', left: 20, bottom: 60, zIndex: 30, display: 'flex', gap: 8 }}>
      {!joined ? (
        <button
          onClick={joinCall}
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
            onClick={leaveCall}
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
      {errorMsg && <div style={{ color: 'red' }}>{errorMsg}</div>}
      {transcripts.slice(-3).map((t, i) => (
        <div key={i} style={{ fontSize: 14, color: '#222' }}>
          <b>{t.user}:</b> {t.text}
        </div>
      ))}
    </div>
  )
} 