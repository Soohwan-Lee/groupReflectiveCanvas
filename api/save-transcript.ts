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

    if (!session_id || !participant_id || !start_time || !text) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const { error } = await supabase.from('transcripts').insert([
      {
        session_id,
        participant_id,
        user_name: user_name || null,
        start_time: new Date(start_time),
        end_time: end_time ? new Date(end_time) : new Date(start_time),
        text,
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