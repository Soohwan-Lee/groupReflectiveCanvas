import React, { useEffect, useRef, useState } from 'react'
import Peer, { MediaConnection } from 'peerjs'

const ROOM_ID = 'demo-room'
const POLL_INTERVAL = 5000 // ms

const peerConfig = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  }
}

export default function VoiceChat() {
  const [peerId, setPeerId] = useState<string | null>(null)
  const [peers, setPeers] = useState<{ [id: string]: MediaConnection }>({})
  const [micOn, setMicOn] = useState(true)
  const [connected, setConnected] = useState(false)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({})
  const peerRef = useRef<Peer | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 1. Get local mic stream
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      localStreamRef.current = stream
      setConnected(true)
    })
  }, [])

  // 2. Setup PeerJS with TURN/STUN and connect to all peers in the room
  useEffect(() => {
    if (!localStreamRef.current) return
    const peer = new Peer('', peerConfig)
    peerRef.current = peer
    let destroyed = false

    function connectToRoomPeers(myId: string) {
      fetch(`https://0.peerjs.com/peers/${ROOM_ID}`)
        .then((res) => res.json())
        .then((ids: string[]) => {
          ids.forEach((otherId) => {
            if (otherId !== myId && !peers[otherId]) {
              const call = peer.call(otherId, localStreamRef.current as MediaStream)
              call.on('stream', (remoteStream) => {
                if (!audioRefs.current[otherId]) {
                  const audio = new window.Audio()
                  audio.srcObject = remoteStream
                  audio.autoplay = true
                  audioRefs.current[otherId] = audio
                }
              })
              setPeers((prev) => ({ ...prev, [otherId]: call }))
            }
          })
        })
    }

    peer.on('open', (id) => {
      setPeerId(id)
      connectToRoomPeers(id)
      // Poll for new peers every few seconds
      pollingRef.current = setInterval(() => {
        if (!destroyed) connectToRoomPeers(id)
      }, POLL_INTERVAL)
    })
    peer.on('call', (call) => {
      call.answer(localStreamRef.current as MediaStream)
      call.on('stream', (remoteStream) => {
        if (!audioRefs.current[call.peer]) {
          const audio = new window.Audio()
          audio.srcObject = remoteStream
          audio.autoplay = true
          audioRefs.current[call.peer] = audio
        }
      })
      setPeers((prev) => ({ ...prev, [call.peer]: call }))
    })
    return () => {
      destroyed = true
      peer.destroy()
      Object.values(audioRefs.current).forEach((audio) => audio.remove())
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [connected])

  // 3. Mic toggle
  const handleMicToggle = () => {
    setMicOn((on) => {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => (track.enabled = !on))
      }
      return !on
    })
  }

  // 4. UI: Modern floating button at bottom left
  return (
    <div style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <button
        onClick={handleMicToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: micOn ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
          color: '#fff',
          border: 'none',
          borderRadius: 24,
          padding: '12px 20px',
          fontWeight: 600,
          fontSize: 16,
          boxShadow: '0 2px 12px #0002',
          cursor: 'pointer',
          transition: 'background 0.2s',
          minWidth: 120,
        }}
        aria-label={micOn ? 'Turn mic off' : 'Turn mic on'}
      >
        {micOn ? (
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
        ) : (
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        )}
        {micOn ? 'Mic On' : 'Mic Off'}
      </button>
      <div style={{ marginTop: 8, color: '#222', fontSize: 13, fontWeight: 500, background: 'rgba(255,255,255,0.85)', borderRadius: 8, padding: '6px 14px', boxShadow: '0 1px 4px #0001' }}>
        {connected ? 'Voice chat ready' : 'Connecting...'}
      </div>
      <div style={{ marginTop: 2, color: '#888', fontSize: 12, fontFamily: 'monospace' }}>
        {peerId ? `ID: ${peerId}` : 'ID: ...'}
      </div>
    </div>
  )
} 