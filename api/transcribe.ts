/*  /api/transcribe.ts  -----------------------------------------------
 *  Whisper-1 실시간 전사용 Vercel Serverless Function
 *  – multipart/form-data 파싱 : busboy
 *  – OpenAI Whisper 호출     : fetch + FormData (formdata-node)
 *  – Supabase 저장           : transcripts 테이블 (segments별)
 *  ------------------------------------------------------------------*/

import Busboy from 'busboy';
import type { Readable } from 'stream';
import { FormData, Blob, File } from 'formdata-node';
import { createClient } from '@supabase/supabase-js';

const logs: Array<{ timestamp: string; userId: string; text: string }> = [];

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 30,
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const ct = req.headers['content-type'] ?? '';
  if (!ct.startsWith('multipart/form-data'))
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });

  let userId = '';
  let timestamp = '';
  let audioBuffer: Buffer | null = null;

  const bb = Busboy({ headers: req.headers });
  const parsingDone = new Promise<void>((resolve, reject) => {
    bb.on('file', (_name: string, file: Readable) => {
      const chunks: Buffer[] = [];
      file.on('data', (d: Buffer) => chunks.push(d));
      file.on('end', () => { audioBuffer = Buffer.concat(chunks); });
    });
    bb.on('field', (name: string, val: string) => {
      if (name === 'userId')     userId = val;
      if (name === 'timestamp')  timestamp = val;
    });
    bb.on('error', reject).on('finish', resolve);
  });
  req.pipe(bb);
  await parsingDone;

  if (!audioBuffer || !userId || !timestamp)
    return res.status(400).json({ error: 'Missing audio, userId, or timestamp' });

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey)
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

  // Whisper 호출 (verbose_json)
  const webmBlob = new Blob([audioBuffer], { type: 'audio/webm' });
  const form = new FormData();
  form.append('file', webmBlob, 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'ko');
  form.append('response_format', 'verbose_json');

  const whisperRes = await fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form as any,
    },
  );

  if (!whisperRes.ok) {
    const errBody = await whisperRes.text();
    console.error('Whisper error', whisperRes.status, errBody);
    return res.status(500).json({ error: 'OpenAI API error', detail: errBody });
  }

  const whisperData = await whisperRes.json();
  const { segments = [] } = whisperData;
  const baseTime = Date.parse(timestamp);

  // segments별로 Supabase에 저장
  let inserted = 0;
  for (const seg of segments) {
    const start_time = new Date(baseTime + seg.start * 1000);
    const end_time = new Date(baseTime + seg.end * 1000);
    const text = seg.text;
    const { error: supabaseError } = await supabase
      .from('transcripts')
      .insert([
        {
          session_id: userId,      // 임시: userId를 session_id로 사용
          participant_id: userId,  // 임시: userId를 participant_id로 사용
          start_time,
          end_time,
          text,
        },
      ]);
    if (supabaseError) {
      console.error('Supabase insert error:', supabaseError);
    } else {
      inserted++;
    }
  }

  // 마지막 segment만 반환 (원하면 전체 반환도 가능)
  const last = segments.length > 0 ? segments[segments.length - 1] : null;
  const entry = last
    ? {
        timestamp,
        userId,
        text: last.text,
        start_time: new Date(baseTime + last.start * 1000),
        end_time: new Date(baseTime + last.end * 1000),
      }
    : { timestamp, userId, text: '' };
  logs.push(entry);
  console.log(entry);

  return res.status(200).json(entry);
} 