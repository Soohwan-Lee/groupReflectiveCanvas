import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/save-transcript
// Expecting JSON body:
// {
//   session_id: string,
//   participant_id: string,
//   user_name: string,
//   start_time: string (ISO),
//   end_time?: string (ISO, optional),
//   text: string
// }
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      session_id,
      participant_id,
      user_name,
      start_time,
      end_time,
      text,
    } = req.body as Record<string, any>

    // Derive sensible defaults if some fields are missing so that we can still log the text.
    const safeSessionId = session_id || 'unknown-session'
    const safeParticipant = participant_id || 'unknown-participant'
    const safeStart = start_time ? new Date(start_time) : new Date()
    const safeEnd = end_time ? new Date(end_time) : safeStart

    const { error } = await supabase.from('transcripts').insert([
      {
        session_id: safeSessionId,
        participant_id: safeParticipant,
        user_name: user_name || null,
        start_time: safeStart,
        end_time: safeEnd,
        text: text || '',
      },
    ])

    if (error) {
      return res.status(500).json({ error: 'Supabase insert error', detail: error })
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) })
  }
} 