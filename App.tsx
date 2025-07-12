import React, { useState } from 'react'
import { TldrawProvider } from './providers/TldrawProvider'
import Canvas from './components/canvas/Canvas'
import VoiceChat from './components/VoiceChat'

const App: React.FC = () => {
  // 임시: 사용자 이름 상태 관리 (실제 tldraw 연동은 추후)
  const [userName, setUserName] = useState('User1')
  return (
    <TldrawProvider>
      <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#f8fafc', position: 'relative' }}>
        <VoiceChat userName={userName} />
        {/* Whisper 실시간 전사, 녹음 시작 UI 완전 제거 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Canvas />
        </div>
      </div>
    </TldrawProvider>
  )
}

export default App 