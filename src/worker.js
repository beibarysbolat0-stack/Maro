import { handleFeatures } from './features.js';
import { handleAssistant } from './assistant.js';
const encoder = new TextEncoder();
const text = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const allowedAreas = ['study', 'work', 'health', 'money', 'life'];
const allowedHorizons = ['inbox', 'today', 'week', 'month', 'year', 'five'];
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
const validTime = value => value === undefined || value === '' || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
const validDuration = value => value === undefined || (Number.isInteger(value) && value >= 15 && value <= 720);
const validColor = value => value === undefined || ['blue','violet','green','amber','rose'].includes(value);
const validStatus = value => value === undefined || ['plan','progress','done'].includes(value);
const validProject = value => value === undefined || (typeof value === 'string' && value.trim().length <= 80);
const validPriority = value => value === undefined || ['normal','high'].includes(value);
const validTags = value => value === undefined || (typeof value === 'string' && value.length <= 160);
const validRepeat = value => value === undefined || ['none','daily','weekly','monthly'].includes(value);
const validReminder = value => value === undefined || [-1,0,5,15,60].includes(value);
const validItem = body => typeof body.title === 'string' && !!body.title.trim() && body.title.trim().length <= 500 && allowedAreas.includes(body.area) && allowedHorizons.includes(body.horizon) && validDate(body.date) && validTime(body.time) && validDuration(body.duration) && validColor(body.color) && validStatus(body.status) && validProject(body.project) && validPriority(body.priority) && validTags(body.tags) && validRepeat(body.repeat) && validReminder(body.reminder_minutes) && !(body.horizon === 'inbox' && body.repeat && body.repeat !== 'none');
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
      const rows = await db.prepare('SELECT id,title,area,horizon,date,done,time,duration,status,color,archived,project,priority,tags,repeat,recurrence_source,reminder_minutes FROM items WHERE user=? ORDER BY created DESC').bind(session.user).all();
      return text(200, rows.results);
    }
    if (url.pathname === '/api/items' && request.method === 'POST') {
      if (!validItem(body)) return text(400, { error: 'Проверьте название, сферу, срок и дату' });
      const id = random(16);
      await db.prepare('INSERT INTO items (id,user,title,area,horizon,date,done,created,time,duration,status,color,project,priority,tags,repeat,recurrence_source,reminder_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, session.user, body.title.trim(), body.area, body.horizon, body.date, Number(body.status === 'done'), Date.now(), body.time || '', body.duration || 60, body.status || 'plan', body.color || 'blue', body.project?.trim() || '', body.priority || 'normal', body.tags?.trim() || '', body.repeat || 'none', body.repeat && body.repeat !== 'none' ? id : '', body.reminder_minutes ?? -1).run();
      return text(201, { id });
    }
    const match = /^\/api\/items\/([a-f0-9]{32})$/.exec(url.pathname);
    if (match && ['PATCH', 'DELETE'].includes(request.method)) {
      let result;
      if (request.method === 'DELETE') { result = await db.prepare('DELETE FROM items WHERE id=? AND user=?').bind(match[1], session.user).run(); if (result.meta.changes) await db.prepare('DELETE FROM subtasks WHERE item=? AND user=?').bind(match[1], session.user).run(); }
      else if (typeof body.done === 'boolean' && Object.keys(body).length === 1) result = await db.prepare('UPDATE items SET done=?,status=? WHERE id=? AND user=?').bind(Number(body.done), body.done ? 'done' : 'plan', match[1], session.user).run();
      else if (validStatus(body.status) && typeof body.status === 'string' && Object.keys(body).length === 1) result = await db.prepare('UPDATE items SET status=?,done=? WHERE id=? AND user=?').bind(body.status, Number(body.status === 'done'), match[1], session.user).run();
      else if (typeof body.archived === 'boolean' && Object.keys(body).length === 1) result = await db.prepare('UPDATE items SET archived=? WHERE id=? AND user=?').bind(Number(body.archived), match[1], session.user).run();
      else if (validItem(body)) result = await db.prepare("UPDATE items SET title=?,area=?,horizon=?,date=?,time=?,duration=?,color=?,project=COALESCE(?,project),priority=COALESCE(?,priority),tags=COALESCE(?,tags),repeat=COALESCE(?,repeat),recurrence_source=CASE WHEN ? IS NOT NULL AND ?!='none' AND recurrence_source='' THEN id ELSE recurrence_source END,reminder_minutes=COALESCE(?,reminder_minutes) WHERE id=? AND user=?").bind(body.title.trim(), body.area, body.horizon, body.date, body.time || '', body.duration || 60, body.color || 'blue', body.project === undefined ? null : body.project.trim(), body.priority ?? null, body.tags === undefined ? null : body.tags.trim(), body.repeat ?? null, body.repeat ?? null, body.repeat ?? null, body.reminder_minutes ?? null, match[1], session.user).run();
      else return text(400, { error: 'Проверьте название, сферу, срок и дату' });
      return result.meta.changes ? text(200, {}) : text(404, { error: 'Задача не найдена' });
    }
    if (url.pathname === '/api/recurrences/sync' && request.method === 'POST') {
      if (!validDate(body.date) || Math.abs(Date.parse(body.date) - Date.parse(new Date().toISOString().slice(0,10))) > 86400000) return text(400,{error:'Некорректная дата'});
      const roots=(await db.prepare("SELECT id,title,area,date,time,duration,color,project,priority,tags,repeat,reminder_minutes FROM items WHERE user=? AND recurrence_source=id AND repeat!='none' AND archived=0 LIMIT 100").bind(session.user).all()).results;
      let created=0;
      const target=new Date(body.date+'T12:00:00Z');
      for (const root of roots) {
        if (root.date >= body.date) continue;
        const start=new Date(root.date+'T12:00:00Z');
        const days=Math.round((target-start)/86400000);
        const due=root.repeat==='daily' || (root.repeat==='weekly' && days%7===0) || (root.repeat==='monthly' && target.getUTCDate()===Math.min(start.getUTCDate(),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));
        if (!due) continue;
        const result=await db.prepare('INSERT OR IGNORE INTO items (id,user,title,area,horizon,date,done,created,time,duration,status,color,project,priority,tags,repeat,recurrence_source,reminder_minutes) VALUES (?,?,?,?,?,?,0,?,?,?, ?,?,?,?,?,?,?,?)').bind(random(16),session.user,root.title,root.area,'today',body.date,Date.now(),root.time,root.duration,'plan',root.color,root.project,root.priority,root.tags,root.repeat,root.id,root.reminder_minutes).run();
        created+=result.meta.changes;
      }
      return text(200,{created});
    }
    if (url.pathname === '/api/subtasks' && request.method === 'POST') {
      if (typeof body.item !== 'string' || !/^[a-f0-9]{32}$/.test(body.item) || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 160) return text(400,{error:'Проверьте подпункт'});
      const parent = await db.prepare('SELECT id FROM items WHERE id=? AND user=?').bind(body.item,session.user).first();
      if (!parent) return text(404,{error:'Задача не найдена'});
      const subId = random(16);
      await db.prepare('INSERT INTO subtasks (id,user,item,title,created) VALUES (?,?,?,?,?)').bind(subId,session.user,body.item,body.title.trim(),Date.now()).run();
      return text(201,{id:subId});
    }
    const subtask = /^\/api\/subtasks\/([a-f0-9]{32})$/.exec(url.pathname);
    if (subtask && ['PATCH','DELETE'].includes(request.method)) {
      let result;
      if (request.method === 'DELETE') result = await db.prepare('DELETE FROM subtasks WHERE id=? AND user=?').bind(subtask[1],session.user).run();
      else if (typeof body.done === 'boolean' && Object.keys(body).length === 1) result = await db.prepare('UPDATE subtasks SET done=? WHERE id=? AND user=?').bind(Number(body.done),subtask[1],session.user).run();
      else if (typeof body.title === 'string' && body.title.trim() && body.title.trim().length <= 160 && Object.keys(body).length === 1) result = await db.prepare('UPDATE subtasks SET title=? WHERE id=? AND user=?').bind(body.title.trim(),subtask[1],session.user).run();
      else return text(400,{error:'Проверьте подпункт'});
      return result.meta.changes ? text(200,{}) : text(404,{error:'Подпункт не найден'});
    }
    const assistantResponse = await handleAssistant(url.pathname, request.method, body, env, session.user);
    if (assistantResponse) return assistantResponse;
    const featureResponse = await handleFeatures(url.pathname, request.method, body, db, session.user);
    if (featureResponse) return featureResponse;
    return text(404, { error: 'Не найдено' });
  }
};
