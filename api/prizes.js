import { getConfig, jsonConfig, replacePrizes } from '../lib/store.js';

const headers = { 'content-type': 'application/json; charset=utf-8' };

const send = (res, status, body) => {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const doc = await getConfig();
      send(res, 200, jsonConfig(doc));
      return;
    }

    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8') || '{}';
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, { error: '잘못된 JSON입니다.' });
        return;
      }
      const doc = await replacePrizes(body.prizes);
      send(res, 200, jsonConfig(doc));
      return;
    }

    send(res, 405, { error: '허용되지 않은 메서드입니다.' });
  } catch (err) {
    const message = Error.isError(err) ? err.message : '서버 오류';
    const status = message.includes('MONGODB_URI') ? 503 : 400;
    send(res, status, { error: message });
  }
}
