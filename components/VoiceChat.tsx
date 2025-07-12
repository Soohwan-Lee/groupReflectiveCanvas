// Vite env type for TypeScript
/// <reference types="vite/client" />
import React, { useEffect, useRef, useState } from 'react'
import DailyIframe, { DailyCall, DailyEventObjectParticipant, DailyEventObjectTrack } from '@daily-co/daily-js'

const ROOM_URL = 'https://soohwan.daily.co/xL84zG8xEXXiCrrARCR6'

export default function VoiceChat() {
  const [micOn, setMicOn] = useState(true)
  const callRef = useRef<DailyCall | null>(null)
  const [joined, setJoined] = useState(false)
  const [audioWorking, setAudioWorking] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const audioElements = useRef<{ [id: string]: HTMLAudioElement }>({})

  // 1. Join/leave logic (user gesture required)
  const handleJoin = async () => {
    setJoining(true)
    try {
      const call = DailyIframe.createCallObject({
        userName: 'User',
        audioSource: true,
        videoSource: false,
        subscribeToTracksAutomatically: false,
      })
      callRef.current = call
      call.on('joined-meeting', (e) => {
        console.log('[Daily] joined-meeting', e)
        setJoined(true)
        setJoining(false)
        // Subscribe to all remote audio tracks
        const participants = call.participants()
        Object.keys(participants).forEach((id) => {
          if (id !== 'local') subscribeToAudio(id)
        })
      })
      call.on('left-meeting', (e) => {
        console.log('[Daily] left-meeting', e)
        setJoined(false)
        setJoining(false)
        cleanupAudioElements()
      })
      call.on('participant-joined', (e: DailyEventObjectParticipant) => {
        console.log('[Daily] participant-joined', e)
        if (e.participant && e.participant.session_id !== call.participants().local.session_id) {
          subscribeToAudio(e.participant.session_id)
        }
      })
      call.on('participant-updated', (e: DailyEventObjectParticipant) => {
        console.log('[Daily] participant-updated', e)
        if (e.participant && e.participant.session_id !== call.participants().local.session_id) {
          subscribeToAudio(e.participant.session_id)
        }
      })
      call.on('track-started', (e: DailyEventObjectTrack) => {
        console.log('[Daily] track-started', e)
        if (e.participant && e.participant.session_id !== call.participants().local.session_id && e.track && e.track.kind === 'audio') {
          attachAudio(e.participant.session_id, e.track)
          setAudioWorking(true)
        }
      })
      call.on('track-stopped', (e: DailyEventObjectTrack) => {
        console.log('[Daily] track-stopped', e)
        if (e.participant && e.participant.session_id !== call.participants().local.session_id && e.track && e.track.kind === 'audio') {
          detachAudio(e.participant.session_id)
        }
      })
      call.on('participant-left', (e: { participant: { session_id: string } }) => {
        console.log('[Daily] participant-left', e)
        if (e.participant && e.participant.session_id) {
          detachAudio(e.participant.session_id)
        }
      })
      call.on('error', (e) => {
        console.error('[Daily] error', e)
        setErrorMsg('Audio connection error')
        setAudioWorking(false)
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

  // 3. Manual audio subscribe/attach/detach
  function subscribeToAudio(sessionId: string) {
    if (!callRef.current) return
    callRef.current.updateParticipant(sessionId, { setSubscribedTracks: { audio: true } })
  }
  function attachAudio(sessionId: string, track: MediaStreamTrack) {
    if (audioElements.current[sessionId]) return
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.srcObject = new MediaStream([track])
    audio.style.display = 'none'
    document.body.appendChild(audio)
    audioElements.current[sessionId] = audio
  }
  function detachAudio(sessionId: string) {
    const audio = audioElements.current[sessionId]
    if (audio) {
      audio.pause()
      audio.srcObject = null
      if (audio.parentNode) audio.parentNode.removeChild(audio)
      delete audioElements.current[sessionId]
    }
  }
  function cleanupAudioElements() {
    Object.keys(audioElements.current).forEach(detachAudio)
  }

  // 4. Minimal UI: join/leave/mic, bottom left, error indicator if audio not working
  return (
    <div style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 30, display: 'flex', gap: 8 }}>
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
  )
} 