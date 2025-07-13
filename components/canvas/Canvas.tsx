import React, { useImperativeHandle, forwardRef, useRef } from 'react'
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
  /**
   * ID of the current user (e.g. Daily participantId). Used to tag new stickies.
   */
  currentUserId: string
  /**
   * Human-readable name of the current user. Stored alongside metadata.
   */
  currentUserName: string
}

/**
 * Canvas component renders a tldraw editor that fills its parent container.
 * Adds real-time collaboration (prototype level) via useSyncDemo.
 */
const Canvas = forwardRef<any, CanvasProps>(
  ({ className, style, currentUserId, currentUserName }, ref) => {
    // 프로토타입: 고정 roomId 사용 (실제 서비스는 URL 등에서 동적으로 할당)
    const store = useSyncDemo({ roomId: 'demo-room' })

    const editorRef = useRef<any>(null)
    /**
     * When the editor mounts, register a listener that tags every newly created
     * sticky-note shape with author metadata. This runs only for the *local* user
     * thanks to the `{ source: 'user' }` filter.
     */
    const handleMount = (editor: any) => {
      editorRef.current = editor
      editor.store.listen(
        (update: any) => {
          const addedRecords = Object.values(update.changes.added ?? {})
          addedRecords.forEach((rec: any) => {
            if (rec.typeName === 'shape' && rec.type === 'sticky') {
              // Already tagged? skip.
              if (rec.meta?.createdBy) return

              editor.updateShape({
                id: rec.id,
                meta: {
                  ...rec.meta,
                  createdBy: currentUserId,
                  userName: currentUserName,
                  createdAt: Date.now(),
                },
              })
            }
          })
        },
        { scope: 'document', source: 'user' }
      )
    }

    useImperativeHandle(ref, () => ({
      getEditor: () => editorRef.current
    }), [])

    return (
      <div
        className={className}
        style={{ position: 'relative', width: '100%', height: '100%', ...style }}
      >
        <Tldraw store={store} onMount={handleMount} />
      </div>
    )
  }
)

export default Canvas 