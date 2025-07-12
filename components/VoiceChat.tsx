import React, { useEffect, useRef, useState } from 'react'
import Peer, { MediaConnection } from 'peerjs'

const ROOM_ID = 'demo-room' // Fixed roomId for now

// Add TURN/STUN servers for better connectivity
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

  // 1. Get local mic stream
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      localStreamRef.current = stream
      setConnected(true)
    })
  }, [])

  // 2. Setup PeerJS with TURN/STUN
  useEffect(() => {
    if (!localStreamRef.current) return
    const peer = new Peer('', peerConfig)
    peerRef.current = peer
    peer.on('open', (id) => {
      setPeerId(id)
      // Join room by connecting to all peers in the room
      fetch(`https://0.peerjs.com/peers/${ROOM_ID}`)
        .then((res) => res.json())
        .then((ids: string[]) => {
          ids.forEach((otherId) => {
            if (otherId !== id) {
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
      peer.destroy()
      Object.values(audioRefs.current).forEach((audio) => audio.remove())
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

  return (
    <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 16, minWidth: 200 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Voice Chat (Beta)</div>
      <div style={{ marginBottom: 8 }}>
        <span>Status: </span>
        <span style={{ color: connected ? 'green' : 'red' }}>{connected ? 'Connected' : 'Not connected'}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span>Peer ID: </span>
        <span style={{ fontFamily: 'monospace' }}>{peerId || '...'}</span>
      </div>
      <button onClick={handleMicToggle} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc', background: micOn ? '#e0ffe0' : '#ffe0e0', cursor: 'pointer' }}>
        {micOn ? 'Mute Mic' : 'Unmute Mic'}
      </button>
    </div>
  )
} 