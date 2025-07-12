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
  const [micOn, setMicOn] = useState(true)
  const [connected, setConnected] = useState(false)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({})
  const peerRef = useRef<Peer | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const connectedPeers = useRef<Set<string>>(new Set())

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
            if (otherId !== myId && !connectedPeers.current.has(otherId)) {
              try {
                const call = peer.call(otherId, localStreamRef.current as MediaStream)
                call.on('stream', (remoteStream) => {
                  if (!audioRefs.current[otherId]) {
                    const audio = new window.Audio()
                    audio.srcObject = remoteStream
                    audio.autoplay = true
                    audioRefs.current[otherId] = audio
                  }
                })
                call.on('close', () => {
                  if (audioRefs.current[otherId]) {
                    audioRefs.current[otherId].remove()
                    delete audioRefs.current[otherId]
                  }
                  connectedPeers.current.delete(otherId)
                })
                call.on('error', () => {
                  connectedPeers.current.delete(otherId)
                })
                connectedPeers.current.add(otherId)
              } catch (e) {
                // ignore
              }
            }
          })
        })
    }

    peer.on('open', (id) => {
      setPeerId(id)
      connectToRoomPeers(id)
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
      call.on('close', () => {
        if (audioRefs.current[call.peer]) {
          audioRefs.current[call.peer].remove()
          delete audioRefs.current[call.peer]
        }
        connectedPeers.current.delete(call.peer)
      })
      call.on('error', () => {
        connectedPeers.current.delete(call.peer)
      })
      connectedPeers.current.add(call.peer)
    })
    return () => {
      destroyed = true
      peer.destroy()
      Object.values(audioRefs.current).forEach((audio) => audio.remove())
      if (pollingRef.current) clearInterval(pollingRef.current)
      connectedPeers.current.clear()
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

  // 4. Minimal UI: small round button, bottom left, tooltip on hover
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