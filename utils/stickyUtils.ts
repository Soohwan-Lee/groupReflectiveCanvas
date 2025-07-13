export type StickyRecord = {
  id: string
  text: string
  createdBy: string
  userName: string
  createdAt: number
}

/**
 * Get all sticky-note shape records from the editor store.
 */
export function getAllStickies(editor: any): StickyRecord[] {
  const records: StickyRecord[] = []
  const all = editor.store.allRecords?.() ?? []
  all.forEach((rec: any) => {
    if (rec.type === 'note') {
      let plain = ''
      // tldraw note stores text in richText (TipTap JSON). Extract plain text if possible.
      const rt = rec.props?.richText
      if (typeof rt === 'string') {
        plain = rt
      } else if (rt && Array.isArray(rt.content)) {
        // naive deep walk to concatenate text nodes
        const walk = (node: any): string => {
          if (!node) return ''
          if (node.type === 'text') return node.text ?? ''
          if (Array.isArray(node.content)) return node.content.map(walk).join('')
          return ''
        }
        plain = walk(rt)
      }
      if (!plain) {
        plain = rec.props?.text ?? ''
      }
      records.push({
        id: rec.id,
        text: plain,
        createdBy: rec.meta?.createdBy ?? 'unknown',
        userName: rec.meta?.userName ?? '',
        createdAt: rec.meta?.createdAt ?? 0,
      })
    }
  })
  return records
}

/**
 * Group sticky notes by their author ID.
 */
export function getStickiesByUser(editor: any): Record<string, StickyRecord[]> {
  const byUser: Record<string, StickyRecord[]> = {}
  getAllStickies(editor).forEach((s) => {
    if (!byUser[s.createdBy]) byUser[s.createdBy] = []
    byUser[s.createdBy].push(s)
  })
  return byUser
} 