/*  /api/transcribe.ts  -----------------------------------------------
 *  Whisper-1 실시간 전사용 Vercel Serverless Function
 *  – multipart/form-data 파싱 : busboy
 *  – OpenAI Whisper 호출     : fetch + FormData (formdata-node)
 *  – 인-메모리 로그          : logs[]
 *  ------------------------------------------------------------------*/

import Busboy from 'busboy';
import type { Readable } from 'stream';
import { FormData, Blob, File } from 'formdata-node';

// 메모리·디버깅용(필요 없으면 삭제 가능)
const logs: Array<{ timestamp: string; userId: string; text: string }> = [];

export const config = {
  runtime: 'nodejs20.x',        // (선택) 필요 시 vercel.json 대신 여기서 지정
  maxDuration: 30,              // Whisper 응답 지연 대비 (초)
};

export default async function handler(req: any, res: any) {
  /* ───────────────────────────── 요청 검증 ───────────────────────────── */
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const ct = req.headers['content-type'] ?? '';
  if (!ct.startsWith('multipart/form-data'))
    return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });

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

  if (!audioBuffer || !userId || !timestamp)
    return res.status(400).json({ error: 'Missing audio, userId, or timestamp' });

  /* ───────────────────── Whisper-1 호출 준비 ───────────────────────── */
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey)
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

  // ✅ MIME type 지정이 핵심! (안 주면 unsupported_format 오류)
  const webmBlob = new Blob([audioBuffer], { type: 'audio/webm' });
  const form = new FormData();
  form.append('file', webmBlob, 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'ko');           // 필요 시 'auto'
  form.append('response_format', 'json');  // 기본값이지만 명시

  /* ───────────────────── Whisper-1 호출 ────────────────────────────── */
  const whisperRes = await fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form as any,                  // Node ≥18 내장 fetch + formdata-node
    },
  );

  if (!whisperRes.ok) {
    const errBody = await whisperRes.text();
    console.error('Whisper error', whisperRes.status, errBody);
    return res.status(500).json({ error: 'OpenAI API error', detail: errBody });
  }

  const { text = '' } = await whisperRes.json();

  /* ───────────────────── 결과 반환 & 로그 ──────────────────────────── */
  const entry = { timestamp, userId, text };
  logs.push(entry);
  console.log(entry);                      // 서버 로그에서도 확인 가능

  return res.status(200).json(entry);
}

// // import type { VercelRequest, VercelResponse } from '@vercel/node';
// import { Readable } from 'stream';
// import Busboy from 'busboy';
// import { FormData, Blob } from 'formdata-node';
// // node-fetch import 제거, Node 18+ 내장 fetch 사용

// const logs: Array<{ timestamp: string; userId: string; text: string }> = [];

// export default async function handler(req: any, res: any) {
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' });
//   }

//   try {
//     const contentType = req.headers['content-type'] || '';
//     if (!contentType.startsWith('multipart/form-data')) {
//       return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
//     }

//     // Parse multipart form
//     const bb = Busboy({ headers: req.headers });
//     let userId = '';
//     let timestamp = '';
//     let audioBuffer: Buffer | null = null;

//     await new Promise<void>((resolve, reject) => {
//       bb.on('file', (name: string, file: Readable, info: any) => {
//         const chunks: Buffer[] = [];
//         file.on('data', (data: Buffer) => chunks.push(data));
//         file.on('end', () => {
//           audioBuffer = Buffer.concat(chunks);
//         });
//       });
//       bb.on('field', (name: string, val: string) => {
//         if (name === 'userId') userId = val;
//         if (name === 'timestamp') timestamp = val;
//       });
//       bb.on('finish', resolve);
//       bb.on('error', reject);
//       req.pipe(bb);
//     });

//     if (!audioBuffer || !userId || !timestamp) {
//       return res.status(400).json({ error: 'Missing audio, userId, or timestamp' });
//     }

//     // Call OpenAI Whisper (whisper-1)
//     const openaiApiKey = process.env.OPENAI_API_KEY;
//     if (!openaiApiKey) {
//       return res.status(500).json({ error: 'Missing OpenAI API key' });
//     }

//     const formData = new FormData();
//     formData.append('file', new Blob([audioBuffer]), 'audio.webm'); // 확장자 webm으로!
//     formData.append('model', 'whisper-1');
//     formData.append('response_format', 'json');
//     formData.append('language', 'ko');

//     // Node 18+ 내장 fetch 사용
//     const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${openaiApiKey}`,
//       },
//       body: formData as any,
//     });

//     if (!openaiRes.ok) {
//       const err = await openaiRes.text();
//       return res.status(500).json({ error: 'OpenAI API error', detail: err });
//     }

//     const data = await openaiRes.json();
//     const text = data.text || '';

//     // Log to memory and console
//     const log = { timestamp, userId, text };
//     logs.push(log);
//     console.log(log);

//     return res.status(200).json({ text, timestamp, userId });
//   } catch (e: any) {
//     console.error('Transcribe API error:', e);
//     return res.status(500).json({ error: e.message || String(e) });
//   }
// } 