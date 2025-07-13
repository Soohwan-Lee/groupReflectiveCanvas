import { FormData, File } from 'formdata-node'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Collect raw body
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const audioBuffer = Buffer.concat(chunks)
    if (!audioBuffer.length) return res.status(400).json({ error: 'Empty audio' })

    // Build multipart form for OpenAI Whisper
    const form = new FormData()
    const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' })
    form.set('file', file)
    form.set('model', 'whisper-1')

    const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form as any,
    })

    const data = await openaiRes.json()
    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json({ error: 'OpenAI error', detail: data })
    }

    return res.status(200).json({ text: data.text || data?.choices?.[0]?.text || '' })
  } catch (err: any) {
    console.error('whisper-transcribe error', err)
    return res.status(500).json({ error: 'Server error', detail: String(err) })
  }
} 