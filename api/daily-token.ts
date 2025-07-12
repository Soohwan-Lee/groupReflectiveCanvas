export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { roomName, userName } = req.body as { roomName?: string; userName?: string }
  if (!roomName || !userName) {
    return res.status(400).json({ error: 'Missing roomName or userName' })
  }

  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing DAILY_API_KEY env' })
  }

  try {
    const resp = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: userName,
        },
        is_owner: true,
        permissions: {
          transcription: 'write',
        },
      }),
    })

    if (!resp.ok) {
      const errorDetail = await resp.text()
      return res.status(500).json({ error: 'Daily API error', detail: errorDetail })
    }

    const data = (await resp.json()) as { token: string }
    return res.status(200).json({ token: data.token })
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) })
  }
} 