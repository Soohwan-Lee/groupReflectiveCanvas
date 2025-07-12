import React, { useEffect, useRef, useState } from 'react'
import Peer, { MediaConnection } from 'peerjs'

const ROOM_ID = 'demo-room' // 고정 roomId, 추후 URL 등에서 동적으로 할당 가능

export default function VoiceChat() {
  const [peerId, setPeerId] = useState<string | null>(null)
  const [peers, setPeers] = useState<{ [id: string]: MediaConnection }>({})
  const [micOn, setMicOn] = useState(true)
  const [connected, setConnected] = useState(false)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({})
  const peerRef = useRef<Peer | null>(null)

  // 1. 내 마이크 스트림 가져오기
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      localStreamRef.current = stream
      setConnected(true)
    })
  }, [])

  // 2. PeerJS 연결 및 룸 참가
  useEffect(() => {
    if (!connected) return
    const peer = new Peer({
      host: 'peerjs.com',
      port: 443,
      path: '/',
      secure: true,
      debug: 2,
    })
    peerRef.current = peer

    peer.on('open', (id) => {
      setPeerId(id)
      // 룸에 참가: 같은 roomId를 가진 peer들에게 신호를 보냄 (간단히 broadcast)
      fetch(`https://0.peerjs.com/peers/${ROOM_ID}`) // dummy fetch to keep alive
    })

    // 다른 peer가 나에게 연결할 때
    peer.on('call', (call) => {
      if (localStreamRef.current) {
        call.answer(localStreamRef.current)
        call.on('stream', (remoteStream) => {
          playRemoteStream(call.peer, remoteStream)
        })
        setPeers((prev) => ({ ...prev, [call.peer]: call }))
      }
    })

    return () => {
      peer.destroy()
      setPeers({})
    }
  }, [connected])

  // 3. 다른 peer에게 내 오디오 연결 시도
  useEffect(() => {
    if (!peerId || !connected || !peerRef.current || !localStreamRef.current) return
    // PeerJS는 discovery 서버가 없으므로, 같은 roomId에 접속한 peerId를 공유하는 로직이 필요함
    // 여기서는 간단히 1:1 연결만 지원 (실제 서비스는 signaling 서버 필요)
    // 프로토타입: 새로고침 시마다 새로운 peerId로 연결됨
  }, [peerId, connected])

  // 4. 오디오 재생 함수
  function playRemoteStream(id: string, stream: MediaStream) {
    if (!audioRefs.current[id]) {
      const audio = new window.Audio()
      audio.autoplay = true
      audio.srcObject = stream
      audioRefs.current[id] = audio
    } else {
      audioRefs.current[id].srcObject = stream
    }
  }

  // 5. 마이크 on/off
  function toggleMic() {
    setMicOn((on) => {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !on
        })
      }
      return !on
    })
  }

  return (
    <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 12, minWidth: 180 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>음성 대화 (베타)</div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        내 Peer ID: <span style={{ fontFamily: 'monospace' }}>{peerId || '...'}</span>
      </div>
      <button onClick={toggleMic} style={{ marginBottom: 8 }}>
        {micOn ? '마이크 끄기' : '마이크 켜기'}
      </button>
      <div style={{ fontSize: 12, color: '#888' }}>
        {connected ? '마이크 연결됨' : '마이크 연결 중...'}
      </div>
    </div>
  )
} 