/*  /api/transcribe.ts  -----------------------------------------------
 *  Whisper-1 실시간 전사용 Vercel Serverless Function
 *  – multipart/form-data 파싱 : busboy
 *  – OpenAI Whisper 호출     : fetch + FormData (formdata-node)
 *  – Supabase 저장           : transcripts 테이블 (segments별)
 *  ------------------------------------------------------------------*/

import { createClient } from '@supabase/supabase-js';
const Busboy = require('busboy');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const fields: any = await new Promise((resolve, reject) => {
      const busboy = new Busboy({ headers: req.headers });
      const result: any = {};
      busboy.on('field', (fieldname, val) => {
        result[fieldname] = val;
      });
      busboy.on('finish', () => resolve(result));
      busboy.on('error', reject);
      req.pipe(busboy);
    });

    const { userName, sessionId, start_time, end_time, text } = fields;
    if (!userName || !sessionId || !start_time || !end_time || !text)
      return res.status(400).json({ error: 'Missing required fields' });

    const { error } = await supabase.from('transcripts').insert([
      {
        user_name: userName,
        session_id: sessionId,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        text,
      },
    ]);
    if (error) {
      return res.status(500).json({ error: 'Supabase insert error', detail: error });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
} 