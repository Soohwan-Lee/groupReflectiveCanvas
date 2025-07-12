// import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import Busboy from 'busboy';
import { FormData, Blob } from 'formdata-node';
// node-fetch import 제거, Node 18+ 내장 fetch 사용

const logs: Array<{ timestamp: string; userId: string; text: string }> = [];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
    }

    // Parse multipart form
    const bb = Busboy({ headers: req.headers });
    let userId = '';
    let timestamp = '';
    let audioBuffer: Buffer | null = null;

    await new Promise<void>((resolve, reject) => {
      bb.on('file', (name: string, file: Readable, info: any) => {
        const chunks: Buffer[] = [];
        file.on('data', (data: Buffer) => chunks.push(data));
        file.on('end', () => {
          audioBuffer = Buffer.concat(chunks);
        });
      });
      bb.on('field', (name: string, val: string) => {
        if (name === 'userId') userId = val;
        if (name === 'timestamp') timestamp = val;
      });
      bb.on('finish', resolve);
      bb.on('error', reject);
      req.pipe(bb);
    });

    if (!audioBuffer || !userId || !timestamp) {
      return res.status(400).json({ error: 'Missing audio, userId, or timestamp' });
    }

    // Call OpenAI Whisper (whisper-1)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'Missing OpenAI API key' });
    }

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), 'audio.webm'); // 확장자 webm으로!
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');
    formData.append('language', 'ko');

    // Node 18+ 내장 fetch 사용
    const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData as any,
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      return res.status(500).json({ error: 'OpenAI API error', detail: err });
    }

    const data = await openaiRes.json();
    const text = data.text || '';

    // Log to memory and console
    const log = { timestamp, userId, text };
    logs.push(log);
    console.log(log);

    return res.status(200).json({ text, timestamp, userId });
  } catch (e: any) {
    console.error('Transcribe API error:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
} 