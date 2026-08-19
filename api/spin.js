import { spinAndSave } from '../lib/store.js';

const headers = { 'content-type': 'application/json; charset=utf-8' };

const send = (res, status, body) => {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { error: '허용되지 않은 메서드입니다.' });
    return;
  }

  try {
    const result = await spinAndSave();
    if (!result.ok) {
      send(res, 409, { error: '잠시 후 다시 돌려 주세요.', ...result });
      return;
    }
    send(res, 200, {
      winnerId: result.winnerId,
      winner: result.winner,
      prizes: result.prizes,
    });
  } catch (err) {
    const message = Error.isError(err) ? err.message : '서버 오류';
    const status = message.includes('MONGODB_URI') ? 503 : 500;
    send(res, status, { error: message });
  }
}
