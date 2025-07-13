const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4.1-2025-04-14'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const { stickies } = req.body as { stickies: string[] }
    if (!stickies || !Array.isArray(stickies) || stickies.length === 0) {
      return res.status(400).json({ error: 'No stickies provided' })
    }
    const prompt = `You are an expert facilitator. Given the following sticky note ideas from a brainstorming session, summarize the main topics as 3-5 concise concept labels (one phrase each), and provide a 1-2 sentence summary of the overall idea landscape.\n\nSticky notes:\n${stickies.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nRespond in JSON with keys 'concepts' (string array) and 'summary' (string).`

    const openaiRes = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant for summarizing brainstorming sessions.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 512,
      }),
    })
    const data = await openaiRes.json()
    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json({ error: 'OpenAI error', detail: data })
    }
    // Try to parse JSON from the model's response
    let summary = '', concepts: string[] = []
    try {
      const match = data.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        summary = parsed.summary
        concepts = parsed.concepts
      } else {
        summary = data.choices?.[0]?.message?.content || ''
      }
    } catch (e) {
      summary = data.choices?.[0]?.message?.content || ''
    }
    return res.status(200).json({ summary, concepts })
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) })
  }
} 