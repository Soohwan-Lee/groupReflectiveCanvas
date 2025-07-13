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
    if (rec.typeName === 'shape' && rec.type === 'sticky') {
      records.push({
        id: rec.id,
        text: rec.props?.text ?? '',
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