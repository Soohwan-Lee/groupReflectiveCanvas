// Vite env type for TypeScript
/// <reference types="vite/client" />
import React, { useEffect, useRef, useState } from 'react'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'

const DAILY_API_KEY = import.meta.env.VITE_DAILY_API_KEY
const ROOM_URL = `https://api.daily.co/v1/rooms`

export default function VoiceChat() {
  const [micOn, setMicOn] = useState(true)
  const callRef = useRef<DailyCall | null>(null)
  const [joined, setJoined] = useState(false)

  // 1. Create or join a Daily room on mount
  useEffect(() => {
    let isMounted = true
    async function setupRoomAndJoin() {
      if (!DAILY_API_KEY) {
        alert('Daily.co API key is missing! Please set VITE_DAILY_API_KEY in your environment.')
        return
      }
      // 1. Create a new room (for demo, ephemeral)
      let roomUrl = ''
      try {
        const res = await fetch(ROOM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DAILY_API_KEY}`,
          },
          body: JSON.stringify({ properties: { enable_chat: false, enable_screenshare: false, exp: Math.floor(Date.now() / 1000) + 60 * 60 } }),
        })
        const data = await res.json()
        roomUrl = data.url
      } catch (e) {
        // fallback: use a fixed room (for demo)
        roomUrl = 'https://groupreflectivecanvas.daily.co/demo-room'
      }
      if (!isMounted) return
      // 2. Join the room (audio only)
      const call = DailyIframe.createCallObject({ userName: 'User', audioSource: true, videoSource: false })
      callRef.current = call
      call.on('joined-meeting', () => setJoined(true))
      call.on('left-meeting', () => setJoined(false))
      await call.join({ url: roomUrl })
      // Mute/unmute mic based on state
      call.setLocalAudio(micOn)
    }
    setupRoomAndJoin()
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

  // 3. Minimal UI: small round button, bottom left, tooltip on hover
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
      </button>
    </div>
  )
} 