import React from 'react'
import { TldrawProvider } from './providers/TldrawProvider'
import Canvas from './components/canvas/Canvas'
import VoiceChat from './components/VoiceChat'

const App: React.FC = () => {
  return (
    <TldrawProvider>
      <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#f8fafc', position: 'relative' }}>
        <VoiceChat />
        {/* AI/Voice/Sidebar components can be added here */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Canvas />
        </div>
      </div>
    </TldrawProvider>
  )
}

export default App 