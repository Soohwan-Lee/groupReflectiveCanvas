// Vite env type for TypeScript
/// <reference types="vite/client" />
// 공식 문서: https://docs.daily.co/guides/products/transcription
// auto_start_transcription(C 방식) 적용: join만 하면 자동으로 트랜스크립션이 시작됨
// 별도의 startTranscription() 호출, 권한/토큰 관리 불필요

import React, { useRef, useState, useEffect } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'
import { getAllStickies } from '../utils/stickyUtils'

interface VoiceChatProps {
  userName: string;
  getEditor: () => any;
}

export default function VoiceChat({ userName, getEditor }: VoiceChatProps) {
  // Dashboard state
  const [concepts, setConcepts] = useState<string[]>([])
  const [summary, setSummary] = useState<string>('')
  const [loadingSummary, setLoadingSummary] = useState(false)

  // Poll stickies and update summary every 5s
  useEffect(() => {
    let mounted = true
    async function fetchSummary() {
      const editor = getEditor?.()
      if (!editor) return
      const stickies = getAllStickies(editor).map(s => s.text).filter(Boolean)
      if (stickies.length === 0) {
        setConcepts([])
        setSummary('')
        return
      }
      setLoadingSummary(true)
      try {
        const res = await fetch('/api/gpt-summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stickies }),
        })
        const data = await res.json()
        if (mounted) {
          setConcepts(Array.isArray(data.concepts) ? data.concepts : [])
          setSummary(data.summary || '')
        }
      } catch (e) {
        if (mounted) setSummary('AI summary error')
      } finally {
        if (mounted) setLoadingSummary(false)
      }
    }
    fetchSummary()
    const interval = setInterval(fetchSummary, 5000)
    return () => { mounted = false; clearInterval(interval) }
  }, [getEditor])

  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null)
  const callRef = useRef<DailyCall | null>(null)
  const remoteAudios = useRef<Record<string, HTMLAudioElement>>({})
  const transcribers = useRef<Record<string, any>>({})
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
  const attachAudio = (participantId: string, track: MediaStreamTrack) => {
    const stream = new MediaStream([track])
    const audioEl = new Audio()
    audioEl.srcObject = stream
    audioEl.autoplay = true
    audioEl.setAttribute('playsinline', 'true')
    audioEl.muted = false
    // 꼬여서 무음이 되는 것을 방지하기 위해 volume 1 유지
    audioEl.volume = 1
    remoteAudios.current[participantId] = audioEl

    // Start per-participant VAD+Whisper transcriber
    import('../utils/participantTranscriber').then(({ ParticipantTranscriber }) => {
      const isLocal = participantId === callRef.current?.participants().local?.session_id
      const displayName = isLocal ? userName : ''
      const t = new ParticipantTranscriber({
        sessionId: DAILY_URL,
        participantId,
        stream,
        userName: displayName,
      })
      transcribers.current[participantId] = t
      t.start()
    })
  }

  const detachAudio = (participantId: string) => {
    const audioEl = remoteAudios.current[participantId]
    if (audioEl) {
      audioEl.pause()
      // 스트림 정리
      const stream = audioEl.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      audioEl.srcObject = null
      delete remoteAudios.current[participantId]

      // Clean up transcriber
      const t = transcribers.current[participantId]
      if (t) {
        t.dispose()
        delete transcribers.current[participantId]
      }
    }
  }

  // register track-started / track-stopped / participant-left listeners once after call object exists
  useEffect(() => {
    if (!callRef.current) return

    const handleTrackStarted = (ev: any) => {
      if (ev.track.kind === 'audio') {
        attachAudio(ev.participant.session_id, ev.track)
      }
    }
    const handleTrackStopped = (ev: any) => {
      if (ev.track.kind === 'audio') {
        detachAudio(ev.participant.session_id)
      }
    }
    const handleParticipantLeft = (ev: any) => {
      detachAudio(ev.participant.session_id)
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

  // Daily transcription 비활성화: transcription-message 리스너 제거

  const ROOM_NAME = 'upOFJOWxqCOhRYldrIsR'

  // 수정: joined 후 startTranscription()
  const joinCall = async () => {
    setJoining(true)
    try {
      // 1) 서버에서 meeting token 발급 (owner 권한 포함 → transcription 가능)
      const tokenRes = await fetch('/api/daily-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: ROOM_NAME, userName }),
      })
      const tokenJson = await tokenRes.json()
      const meetingToken = tokenJson.token as string | undefined

      if (!callRef.current) {
        callRef.current = DailyIframe.createCallObject();
      }
      callRef.current.on('joined-meeting', async () => {
        setJoined(true);
        setJoining(false);
        setErrorMsg(null);
        // Daily transcription 사용하지 않음
        // UI·콘솔 노이즈 최소화를 위해 startTranscription 호출을 제거한다.
        // Whisper(VAD) 경로에서만 전사 결과를 처리한다.
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
        token: meetingToken,
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
    <div style={{ position: 'fixed', left: 20, bottom: 60, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      {/* Dashboard: Idea Landscape */}
      <div style={{
        minWidth: 220,
        minHeight: 80,
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 2px 12px #0002',
        padding: '16px 20px 12px 20px',
        marginBottom: 8,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Idea Landscape</div>
        {loadingSummary ? (
          <div style={{ color: '#888', fontSize: 13 }}>Analyzing...</div>
        ) : concepts.length === 0 ? (
          <div style={{ color: '#aaa', fontSize: 13 }}>No sticky notes yet</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 4 }}>
            {concepts.map((c, i) => (
              <div key={i} style={{
                borderRadius: '50%',
                background: '#f1f5f9',
                border: '2px solid #2563eb',
                minWidth: 48,
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 14,
                padding: '0 10px',
                textAlign: 'center',
                boxShadow: '0 1px 4px #0001',
              }}>{c}</div>
            ))}
          </div>
        )}
        {summary && (
          <div style={{ fontSize: 13, color: '#333', textAlign: 'center', marginTop: 2 }}>{summary}</div>
        )}
      </div>
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
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
        </div>
      )}
      {errorMsg && <div style={{ color: 'red' }}>{errorMsg}</div>}
      {transcripts.slice(-3).map((t, i) => (
        <div key={i} style={{ fontSize: 14, color: '#222' }}>
          <b>{t.user}:</b> {t.text}
        </div>
      ))}

      {/* 라이브 자막 표시 */}
      {transcripts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            maxHeight: 120,
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: 14,
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          {transcripts.slice(-5).map((t, idx) => (
            <div key={idx} style={{ marginBottom: 2 }}>
              <strong>{t.user}: </strong>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 