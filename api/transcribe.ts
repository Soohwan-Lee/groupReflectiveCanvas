/*  /api/transcribe.ts  -----------------------------------------------
 *  Whisper-1 실시간 전사용 Vercel Serverless Function
 *  – multipart/form-data 파싱 : busboy
 *  – OpenAI Whisper 호출     : fetch + FormData (formdata-node)
 *  – 인-메모리 로그          : logs[]
 *  – Supabase 저장           : transcripts 테이블
 *  ------------------------------------------------------------------*/

import Busboy from 'busboy';
import type { Readable } from 'stream';
import { FormData, Blob, File } from 'formdata-node';
import { createClient } from '@supabase/supabase-js';

// 메모리·디버깅용(필요 없으면 삭제 가능)
const logs: Array<{ timestamp: string; userId: string; text: string }> = [];

export const config = {
  runtime: 'nodejs20.x',        // (선택) 필요 시 vercel.json 대신 여기서 지정
  maxDuration: 30,              // Whisper 응답 지연 대비 (초)
};

// Supabase 클라이언트 생성 (환경변수 필요)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  console.log('[Transcribe API] Request received - Method:', req.method, 'Content-Type:', req.headers['content-type']);
  
  /* ───────────────────────────── 요청 검증 ───────────────────────────── */
  if (req.method !== 'POST') {
    console.log('[Transcribe API] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ct = req.headers['content-type'] ?? '';
  if (!ct.startsWith('multipart/form-data')) {
    console.log('[Transcribe API] Invalid content type:', ct);
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
  }

  /* ───────────────────── multipart/form-data 파싱 ───────────────────── */
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

  console.log('[Transcribe API] Parsed data - userId:', userId, 'timestamp:', timestamp, 'audioBuffer size:', audioBuffer?.length);

  if (!audioBuffer || !userId || !timestamp) {
    console.log('[Transcribe API] Missing required data - audioBuffer:', !!audioBuffer, 'userId:', userId, 'timestamp:', timestamp);
    return res.status(400).json({ error: 'Missing audio, userId, or timestamp' });
  }

  /* ───────────────────── Whisper-1 호출 준비 ───────────────────────── */
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error('[Transcribe API] OPENAI_API_KEY not found in environment variables');
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }
  console.log('[Transcribe API] OpenAI API key found, preparing Whisper request...');

  // ✅ MIME type 지정이 핵심! (안 주면 unsupported_format 오류)
  const webmBlob = new Blob([audioBuffer], { type: 'audio/webm' });
  const form = new FormData();
  form.append('file', webmBlob, 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'ko');           // 필요 시 'auto'
  form.append('response_format', 'json');  // 기본값이지만 명시

  /* ───────────────────── Whisper-1 호출 ────────────────────────────── */
  console.log('[Transcribe API] Sending request to OpenAI Whisper API...');
  const whisperRes = await fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form as any,                  // Node ≥18 내장 fetch + formdata-node
    },
  );

  console.log('[Transcribe API] Whisper API response status:', whisperRes.status);

  if (!whisperRes.ok) {
    const errBody = await whisperRes.text();
    console.error('[Transcribe API] Whisper API error - Status:', whisperRes.status, 'Body:', errBody);
    return res.status(500).json({ error: 'OpenAI API error', detail: errBody });
  }

  const whisperResponse = await whisperRes.json();
  console.log('[Transcribe API] Whisper API response:', whisperResponse);
  const { text = '' } = whisperResponse;

  /* ───────────────────── Supabase 저장 ────────────────────────────── */
  console.log('[Transcribe API] Saving transcription to Supabase...');
  const { error: supabaseError } = await supabase
    .from('transcripts')
    .insert([
      {
        session_id: userId, // 필요시 별도 세션ID 사용
        user_id: userId,
        text,
        timestamp: new Date(timestamp),
      },
    ]);
  if (supabaseError) {
    console.error('[Transcribe API] Supabase insert error:', supabaseError);
  } else {
    console.log('[Transcribe API] Supabase insert successful.');
  }

  /* ───────────────────── 결과 반환 & 로그 ──────────────────────────── */
  const entry = { timestamp, userId, text };
  logs.push(entry);
  console.log('[Transcribe API] Transcription successful:', entry);
  console.log('[Transcribe API] Total transcriptions in memory:', logs.length);

  return res.status(200).json(entry);
} 