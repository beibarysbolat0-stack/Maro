const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const id = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
const dateOk = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const titleOk = value => typeof value === 'string' && !!value.trim() && value.trim().length <= 160;
const areas = ['study', 'work', 'health', 'money', 'life'];
const noteCategories = ['knowledge', 'habit', 'goal', 'principle'];
const rows = async (db, sql, user) => (await db.prepare(sql).bind(user).all()).results;
const invalid = () => reply(400, { error: 'Проверьте данные формы' });

export async function handleFeatures(path, method, body, db, user) {
  if (path === '/api/state' && method === 'GET') {
    const [items, habits, habitLogs, transactions, notes, events, sleep, focus] = await Promise.all([
      rows(db, 'SELECT id,title,area,horizon,date,done FROM items WHERE user=? ORDER BY created DESC', user),
      rows(db, 'SELECT id,title,area,created FROM habits WHERE user=? ORDER BY created DESC', user),
      rows(db, 'SELECT habit,date FROM habit_logs WHERE user=? ORDER BY date DESC LIMIT 5000', user),
      rows(db, 'SELECT id,kind,amount,category,note,date FROM transactions WHERE user=? ORDER BY date DESC,created DESC LIMIT 1000', user),
      rows(db, 'SELECT id,title,category,body,created FROM notes WHERE user=? ORDER BY created DESC LIMIT 1000', user),
      rows(db, 'SELECT id,title,date,time FROM events WHERE user=? ORDER BY date,time LIMIT 1000', user),
      rows(db, 'SELECT id,date,hours FROM sleep_logs WHERE user=? ORDER BY date DESC LIMIT 180', user),
      rows(db, 'SELECT id,title,minutes,date FROM focus_sessions WHERE user=? ORDER BY date DESC,created DESC LIMIT 1000', user)
    ]);
    return reply(200, { items, habits, habitLogs, transactions, notes, events, sleep, focus });
  }
  if (path === '/api/habits' && method === 'POST') {
    if (!titleOk(body.title) || !areas.includes(body.area)) return invalid();
    const newId = id();
    await db.prepare('INSERT INTO habits (id,user,title,area,created) VALUES (?,?,?,?,?)').bind(newId,user,body.title.trim(),body.area,Date.now()).run();
    return reply(201,{id:newId});
  }
  const habitEdit = /^\/api\/habits\/([a-f0-9]{32})$/.exec(path);
  if (habitEdit && method === 'PATCH') {
    if (!titleOk(body.title) || !areas.includes(body.area)) return invalid();
    const result = await db.prepare('UPDATE habits SET title=?,area=? WHERE id=? AND user=?').bind(body.title.trim(),body.area,habitEdit[1],user).run();
    return result.meta.changes ? reply(200,{}) : reply(404,{error:'Привычка не найдена'});
  }
  const habitCheck = /^\/api\/habits\/([a-f0-9]{32})\/check$/.exec(path);
  if (habitCheck && method === 'POST') {
    if (!dateOk(body.date)) return invalid();
    const own = await db.prepare('SELECT id FROM habits WHERE id=? AND user=?').bind(habitCheck[1],user).first();
    if (!own) return reply(404,{error:'Привычка не найдена'});
    const done = await db.prepare('SELECT 1 FROM habit_logs WHERE habit=? AND user=? AND date=?').bind(habitCheck[1],user,body.date).first();
    if (done) await db.prepare('DELETE FROM habit_logs WHERE habit=? AND user=? AND date=?').bind(habitCheck[1],user,body.date).run();
    else await db.prepare('INSERT INTO habit_logs (habit,user,date) VALUES (?,?,?)').bind(habitCheck[1],user,body.date).run();
    return reply(200,{done:!done});
  }
  if (path === '/api/transactions' && method === 'POST') {
    if (!['income','expense'].includes(body.kind) || !Number.isSafeInteger(body.amount) || body.amount <= 0 || body.amount > 100000000000 || !titleOk(body.category) || typeof body.note !== 'string' || body.note.length > 500 || !dateOk(body.date)) return invalid();
    const newId = id();
    await db.prepare('INSERT INTO transactions (id,user,kind,amount,category,note,date,created) VALUES (?,?,?,?,?,?,?,?)').bind(newId,user,body.kind,body.amount,body.category.trim(),body.note.trim(),body.date,Date.now()).run();
    return reply(201,{id:newId});
  }
  const transactionEdit = /^\/api\/transactions\/([a-f0-9]{32})$/.exec(path);
  if (transactionEdit && method === 'PATCH') {
    if (!['income','expense'].includes(body.kind) || !Number.isSafeInteger(body.amount) || body.amount <= 0 || body.amount > 100000000000 || !titleOk(body.category) || typeof body.note !== 'string' || body.note.length > 500 || !dateOk(body.date)) return invalid();
    const result = await db.prepare('UPDATE transactions SET kind=?,amount=?,category=?,note=?,date=? WHERE id=? AND user=?').bind(body.kind,body.amount,body.category.trim(),body.note.trim(),body.date,transactionEdit[1],user).run();
    return result.meta.changes ? reply(200,{}) : reply(404,{error:'Операция не найдена'});
  }
  if (path === '/api/notes' && method === 'POST') {
    if (!titleOk(body.title) || !noteCategories.includes(body.category) || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 5000) return invalid();
    const newId = id();
    await db.prepare('INSERT INTO notes (id,user,title,category,body,created) VALUES (?,?,?,?,?,?)').bind(newId,user,body.title.trim(),body.category,body.body.trim(),Date.now()).run();
    return reply(201,{id:newId});
  }
  const noteEdit = /^\/api\/notes\/([a-f0-9]{32})$/.exec(path);
  if (noteEdit && method === 'PATCH') {
    if (!titleOk(body.title) || !noteCategories.includes(body.category) || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 5000) return invalid();
    const result = await db.prepare('UPDATE notes SET title=?,category=?,body=? WHERE id=? AND user=?').bind(body.title.trim(),body.category,body.body.trim(),noteEdit[1],user).run();
    return result.meta.changes ? reply(200,{}) : reply(404,{error:'Заметка не найдена'});
  }
  if (path === '/api/events' && method === 'POST') {
    if (!titleOk(body.title) || !dateOk(body.date) || typeof body.time !== 'string' || (body.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))) return invalid();
    const newId = id();
    await db.prepare('INSERT INTO events (id,user,title,date,time,created) VALUES (?,?,?,?,?,?)').bind(newId,user,body.title.trim(),body.date,body.time,Date.now()).run();
    return reply(201,{id:newId});
  }
  const eventEdit = /^\/api\/events\/([a-f0-9]{32})$/.exec(path);
  if (eventEdit && method === 'PATCH') {
    if (!titleOk(body.title) || !dateOk(body.date) || typeof body.time !== 'string' || (body.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))) return invalid();
    const result = await db.prepare('UPDATE events SET title=?,date=?,time=? WHERE id=? AND user=?').bind(body.title.trim(),body.date,body.time,eventEdit[1],user).run();
    return result.meta.changes ? reply(200,{}) : reply(404,{error:'Событие не найдено'});
  }
  if (path === '/api/sleep' && method === 'POST') {
    if (!dateOk(body.date) || typeof body.hours !== 'number' || !Number.isFinite(body.hours) || body.hours < 0.5 || body.hours > 20) return invalid();
    const newId = id();
    await db.prepare('INSERT INTO sleep_logs (id,user,date,hours,created) VALUES (?,?,?,?,?)').bind(newId,user,body.date,Math.round(body.hours*10)/10,Date.now()).run();
    return reply(201,{id:newId});
  }
  if (path === '/api/focus' && method === 'POST') {
    if (!titleOk(body.title) || !Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 240 || !dateOk(body.date)) return invalid();
    const newId = id();
    await db.prepare('INSERT INTO focus_sessions (id,user,title,minutes,date,created) VALUES (?,?,?,?,?,?)').bind(newId,user,body.title.trim(),body.minutes,body.date,Date.now()).run();
    return reply(201,{id:newId});
  }
  const remove = /^\/api\/(habits|transactions|notes|events|sleep|focus)\/([a-f0-9]{32})$/.exec(path);
  if (remove && method === 'DELETE') {
    const tables = {habits:'habits',transactions:'transactions',notes:'notes',events:'events',sleep:'sleep_logs',focus:'focus_sessions'};
    const table = tables[remove[1]];
    const result = await db.prepare(`DELETE FROM ${table} WHERE id=? AND user=?`).bind(remove[2],user).run();
    if (remove[1] === 'habits' && result.meta.changes) await db.prepare('DELETE FROM habit_logs WHERE habit=? AND user=?').bind(remove[2],user).run();
    return result.meta.changes ? reply(200,{}) : reply(404,{error:'Запись не найдена'});
  }
  return null;
}
