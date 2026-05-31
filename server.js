const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json({ limit: '10mb' }));

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const _rateMap = new Map();
function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
  const now = Date.now();
  const WINDOW = 60_000;
  const MAX = 20;
  let entry = _rateMap.get(ip);
  if (!entry || now - entry.start > WINDOW) entry = { count: 0, start: now };
  entry.count++;
  _rateMap.set(ip, entry);
  if (entry.count > MAX) {
    return res.status(429).json({ error: { message: 'Rate limit exceeded — try again in a minute.' } });
  }
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'claude-proxy' }));

app.post('/ai', rateLimit, async (req, res) => {
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY is not set on the server.' } });
  }
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy error: ${err.message}` } });
  }
});

app.listen(PORT, () => console.log(`Claude proxy running on port ${PORT}`));
