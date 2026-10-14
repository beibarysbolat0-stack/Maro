import { handleFeatures } from './features.js';
import { handleAssistant } from './assistant.js';
const encoder = new TextEncoder();
const text = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const allowedAreas = ['study', 'work', 'health', 'money', 'life'];
const allowedHorizons = ['today', 'week', 'month', 'year', 'five'];
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256)));
}
function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
const cookie = (token, maxAge) => `maro=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
const validItem = body => typeof body.title === 'string' && !!body.title.trim() && body.title.trim().length <= 500 && allowedAreas.includes(body.area) && allowedHorizons.includes(body.horizon) && validDate(body.date);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      try { await env.DB.prepare('SELECT 1').first(); return text(200, { status: 'ok' }); }
      catch { return text(503, { error: 'База данных недоступна' }); }
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return text(405, { error: 'Метод недоступен' });
    if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return text(403, { error: 'Недопустимый источник запроса' });
    let body = {};
    if (request.method !== 'GET') {
      if (Number(request.headers.get('content-length')) > 16384) return text(413, { error: 'Слишком большой запрос' });
      const raw = await request.text();
      if (raw.length > 16384) return text(413, { error: 'Слишком большой запрос' });
      try { body = JSON.parse(raw || '{}'); } catch { return text(400, { error: 'Некорректный запрос' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return text(400, { error: 'Некорректный запрос' });
    }
    const db = env.DB;
    const token = /(?:^|;\s*)maro=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1];
    const session = token && await db.prepare('SELECT user FROM sessions WHERE token=? AND expires>?').bind(token, Date.now()).first();
    if (url.pathname === '/api/register' || url.pathname === '/api/login') {
      if (request.method !== 'POST') return text(405, { error: 'Метод недоступен' });
      const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128) return text(400, { error: 'Введите email и пароль от 10 до 128 символов' });
      let user = await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
      if (url.pathname === '/api/register') {
        if (user) return text(409, { error: 'Этот email уже зарегистрирован' });
        const salt = random(16), id = random(16), hash = await hashPassword(password, salt);
        await db.prepare('INSERT INTO users (id,email,salt,hash) VALUES (?,?,?,?)').bind(id, email, salt, hash).run();
        user = { id, email };
      } else if (!user || !sameHash(user.hash, await hashPassword(password, user.salt))) return text(401, { error: 'Неверный email или пароль' });
      const fresh = random(32);
      await db.prepare('INSERT INTO sessions (token,user,expires) VALUES (?,?,?)').bind(fresh, user.id, Date.now() + 30 * 86400000).run();
      return text(200, { email: user.email }, { 'set-cookie': cookie(fresh, 2592000) });
    }
    if (!session) return text(401, { error: 'Войдите в аккаунт' });
    if (url.pathname === '/api/me' && request.method === 'GET') return text(200, await db.prepare('SELECT email FROM users WHERE id=?').bind(session.user).first());
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      await db.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();
      return text(200, {}, { 'set-cookie': cookie('', 0) });
    }
    if (url.pathname === '/api/items' && request.method === 'GET') {
      const rows = await db.prepare('SELECT id,title,area,horizon,date,done FROM items WHERE user=? ORDER BY created DESC').bind(session.user).all();
      return text(200, rows.results);
    }
    if (url.pathname === '/api/items' && request.method === 'POST') {
      if (!validItem(body)) return text(400, { error: 'Проверьте название, сферу, срок и дату' });
      const id = random(16);
      await db.prepare('INSERT INTO items (id,user,title,area,horizon,date,done,created) VALUES (?,?,?,?,?,?,0,?)').bind(id, session.user, body.title.trim(), body.area, body.horizon, body.date, Date.now()).run();
      return text(201, { id });
    }
    const match = /^\/api\/items\/([a-f0-9]{32})$/.exec(url.pathname);
    if (match && ['PATCH', 'DELETE'].includes(request.method)) {
      let result;
      if (request.method === 'DELETE') result = await db.prepare('DELETE FROM items WHERE id=? AND user=?').bind(match[1], session.user).run();
      else if (typeof body.done === 'boolean' && Object.keys(body).length === 1) result = await db.prepare('UPDATE items SET done=? WHERE id=? AND user=?').bind(Number(body.done), match[1], session.user).run();
      else if (validItem(body)) result = await db.prepare('UPDATE items SET title=?,area=?,horizon=?,date=? WHERE id=? AND user=?').bind(body.title.trim(), body.area, body.horizon, body.date, match[1], session.user).run();
      else return text(400, { error: 'Проверьте название, сферу, срок и дату' });
      return result.meta.changes ? text(200, {}) : text(404, { error: 'Задача не найдена' });
    }
    const assistantResponse = await handleAssistant(url.pathname, request.method, body, env, session.user);
    if (assistantResponse) return assistantResponse;
    const featureResponse = await handleFeatures(url.pathname, request.method, body, db, session.user);
    if (featureResponse) return featureResponse;
    return text(404, { error: 'Не найдено' });
  }
};
