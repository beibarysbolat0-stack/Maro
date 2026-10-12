const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const dataDir = process.env.MARO_DATA_DIR || path.join(__dirname, '.data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'maro.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, salt TEXT, hash TEXT); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT, expires INTEGER); CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, user TEXT, title TEXT, area TEXT, horizon TEXT, date TEXT, done INTEGER DEFAULT 0);`);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value));
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(body)); };
const server = http.createServer(async (req, res) => {
 try {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
   if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `${process.env.MARO_SECURE_COOKIE === '1' ? 'https' : 'http'}://${req.headers.host}`) return send(res,403,{error:'Недопустимый источник запроса'});
   let body = {};
   if (req.method !== 'GET') { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 16384) return send(res,413,{error:'Слишком большой запрос'}); } try { body = JSON.parse(raw || '{}'); } catch { return send(res,400,{error:'Некорректный запрос'}); } }
   const token = /(?:^|;\s*)maro=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
   const session = token && db.prepare('SELECT user FROM sessions WHERE token=? AND expires>?').get(token, Date.now());
   if (url.pathname === '/api/register' || url.pathname === '/api/login') {
    if (req.method !== 'POST') return send(res,405,{error:'Метод недоступен'});
    const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128) return send(res,400,{error:'Введите email и пароль от 10 до 128 символов'});
    let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (url.pathname === '/api/register') {
     if (user) return send(res,409,{error:'Этот email уже зарегистрирован'});
     const salt = randomBytes(16).toString('hex'), id = randomBytes(16).toString('hex');
     db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id,email,salt,scryptSync(password,salt,64).toString('hex'));
     user = {id,email};
    } else if (!user || !timingSafeEqual(Buffer.from(user.hash,'hex'),scryptSync(password,user.salt,64))) return send(res,401,{error:'Неверный email или пароль'});
    const fresh = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(fresh,user.id,Date.now()+30*86400000);
    res.setHeader('Set-Cookie',`maro=${fresh}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.MARO_SECURE_COOKIE === '1' ? '; Secure' : ''}`);
    return send(res,200,{email:user.email});
   }
   if (!session) return send(res,401,{error:'Войдите в аккаунт'});
   if (url.pathname === '/api/me') return send(res,200,db.prepare('SELECT email FROM users WHERE id=?').get(session.user));
   if (url.pathname === '/api/logout' && req.method === 'POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(token); res.setHeader('Set-Cookie','maro=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(res,200,{}); }
   if (url.pathname === '/api/items' && req.method === 'GET') return send(res,200,db.prepare('SELECT id,title,area,horizon,date,done FROM items WHERE user=? ORDER BY rowid DESC').all(session.user));
   if (url.pathname === '/api/items' && req.method === 'POST') {
    const title = String(body.title || '').trim();
    if (!title || title.length>500 || !['study','work','health','money','life'].includes(body.area) || !['today','week','month','year','five'].includes(body.horizon) || !validDate(body.date)) return send(res,400,{error:'Проверьте название, сферу, срок и дату'});
    const id = randomBytes(16).toString('hex'); db.prepare('INSERT INTO items (id,user,title,area,horizon,date) VALUES (?,?,?,?,?,?)').run(id,session.user,title,body.area,body.horizon,body.date); return send(res,201,{id});
   }
   const match = /^\/api\/items\/([a-f0-9]{32})$/.exec(url.pathname);
   if (match && ['PATCH','DELETE'].includes(req.method)) {
    let result;
    if (req.method === 'DELETE') result = db.prepare('DELETE FROM items WHERE id=? AND user=?').run(match[1],session.user);
    else if (typeof body.done === 'boolean' && Object.keys(body).length === 1) result = db.prepare('UPDATE items SET done=? WHERE id=? AND user=?').run(Number(body.done),match[1],session.user);
    else if (typeof body.title === 'string' && body.title.trim() && body.title.trim().length <= 500 && ['study','work','health','money','life'].includes(body.area) && ['today','week','month','year','five'].includes(body.horizon) && validDate(body.date)) result = db.prepare('UPDATE items SET title=?,area=?,horizon=?,date=? WHERE id=? AND user=?').run(body.title.trim(),body.area,body.horizon,body.date,match[1],session.user);
    else return send(res,400,{error:'Проверьте название, сферу, срок и дату'});
    return send(res,result.changes ? 200 : 404, result.changes ? {} : {error:'Задача не найдена'});
   }
   return send(res,404,{error:'Не найдено'});
  }
  if (!['GET','HEAD'].includes(req.method)) return send(res,405,{});
  if (url.pathname === '/health') return send(res,200,{status:'ok'});
  const files = {'/':'index.html','/app.js':'app.js','/style.css':'style.css','/manifest.json':'manifest.json','/sw.js':'sw.js','/icon.svg':'icon.svg'};
  const file = files[url.pathname]; if (!file) return send(res,404,{});
  const types = {html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"}); res.end(req.method==='HEAD' ? undefined : fs.readFileSync(path.join(__dirname,'public',file)));
 } catch (error) { console.error(error.message); if (!res.headersSent) send(res,500,{error:'Ошибка сервера'}); else res.end(); }
});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '0.0.0.0',()=>console.log('Maro server started'));
