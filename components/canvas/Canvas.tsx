import React from 'react'
import { Tldraw } from 'tldraw'
import { useSyncDemo } from '@tldraw/sync'
import 'tldraw/tldraw.css'

export type CanvasProps = {
  /**
   * Optional className for custom styling
   */
  className?: string
  /**
   * Optional style overrides
   */
  style?: React.CSSProperties
}

/**
 * Canvas component renders a tldraw editor that fills its parent container.
 * Adds real-time collaboration (prototype level) via useSyncDemo.
 */
const Canvas: React.FC<CanvasProps> = ({ className, style }) => {
  // 프로토타입: 고정 roomId 사용 (실제 서비스는 URL 등에서 동적으로 할당)
  const store = useSyncDemo({ roomId: 'demo-room' })

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <Tldraw store={store} />
    </div>
  )
}

export default Canvas 