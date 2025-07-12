// Vite env type for TypeScript
/// <reference types="vite/client" />
import React, { useEffect, useRef, useState } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'

const ROOM_URL = 'https://groupreflectivecanvas.daily.co/demo-room'

export default function VoiceChat() {
  const [micOn, setMicOn] = useState(true)
  const callRef = useRef<DailyCall | null>(null)
  const [joined, setJoined] = useState(false)
  const [audioWorking, setAudioWorking] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 1. Join the fixed Daily room on mount
  useEffect(() => {
    let isMounted = true
    async function joinRoom() {
      try {
        const call = DailyIframe.createCallObject({ userName: 'User', audioSource: true, videoSource: false })
        callRef.current = call
        call.on('joined-meeting', (e) => {
          console.log('[Daily] joined-meeting', e)
          setJoined(true)
        })
        call.on('left-meeting', (e) => {
          console.log('[Daily] left-meeting', e)
          setJoined(false)
        })
        call.on('participant-joined', (e) => {
          console.log('[Daily] participant-joined', e)
        })
        call.on('participant-updated', (e) => {
          console.log('[Daily] participant-updated', e)
        })
        call.on('track-started', (e) => {
          console.log('[Daily] track-started', e)
          if (e.track && e.track.kind === 'audio') {
            setAudioWorking(true)
          }
        })
        call.on('track-stopped', (e) => {
          console.log('[Daily] track-stopped', e)
        })
        call.on('error', (e) => {
          console.error('[Daily] error', e)
          setErrorMsg('Audio connection error')
          setAudioWorking(false)
        })
        call.on('app-message', (e) => {
          console.log('[Daily] app-message', e)
        })
        call.on('network-quality-change', (e) => {
          console.log('[Daily] network-quality-change', e)
        })
        await call.join({ url: ROOM_URL })
        call.setLocalAudio(micOn)
      } catch (err: any) {
        setErrorMsg('Failed to join audio room')
        setAudioWorking(false)
        console.error('[Daily] join error', err)
      }
    }
    joinRoom()
    return () => {
      isMounted = false
      if (callRef.current) {
        callRef.current.leave()
        callRef.current.destroy()
      }
    }
  }, [])

  // 2. Mic toggle
  const handleMicToggle = () => {
    setMicOn((on) => {
      if (callRef.current) {
        callRef.current.setLocalAudio(!on)
      }
      return !on
    })
  }

  // 3. Minimal UI: small round button, bottom left, tooltip on hover, error indicator if audio not working
  return (
    <div style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 30 }}>
      <button
        onClick={handleMicToggle}
        style={{
          width: 48,
          height: 48,
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
        disabled={!joined}
      >
        {micOn ? (
          <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
        ) : (
          <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        )}
        {!audioWorking && (
          <span style={{ position: 'absolute', top: 2, right: 2 }} title={errorMsg || 'Audio not working'}>
            <svg width="16" height="16" fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1"/></svg>
          </span>
        )}
      </button>
    </div>
  )
} 