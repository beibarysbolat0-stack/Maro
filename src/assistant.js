const respond = (status, data) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const id = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
const areas = ['study','work','health','money','life'];
const dateOk = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const clean = value => typeof value === 'string' ? value.trim().slice(0,160) : '';
const areaOf = value => /уч|урок|экзамен|книг|английск/i.test(value)?'study':/работ|проект|клиент|офис/i.test(value)?'work':/спорт|тренир|прогул|сон|врач|зарядк/i.test(value)?'health':/деньг|расход|бюджет|покуп/i.test(value)?'money':'life';
function normalizeActions(raw, items, habits, day){
  if(!Array.isArray(raw))return [];
  const valid=[];
  for(const action of raw.slice(0,12)){
    if(!action || typeof action!=='object')continue;
    if(action.type==='task'){
      const title=clean(action.title), date=dateOk(action.date)?action.date:day;
      if(title && (date>=day || date===day))valid.push({type:'task',title,date,area:areas.includes(action.area)?action.area:areaOf(title),horizon:'today'});
    }else if(action.type==='habit'){
      const title=clean(action.title);
      if(title)valid.push({type:'habit',title,area:areas.includes(action.area)?action.area:areaOf(title)});
    }else if(action.type==='reschedule' && typeof action.id==='string' && items.some(item=>item.id===action.id) && dateOk(action.date)){
      valid.push({type:'reschedule',id:action.id,date:action.date});
    }
  }
  const seen=new Set();
  return valid.filter(a=>{const key=a.type==='reschedule'?`${a.type}:${a.id}`:`${a.type}:${a.title.toLowerCase()}:${a.date||''}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
}
function basicPlan(message, day, items, habits){
  if(/^(привет|здравствуй|добрый день|как дела|спасибо)[!? .]*$/i.test(message))return {reply:'Привет! Расскажи, что планируешь сегодня, и я помогу составить план.',actions:[],mode:'basic'};
  if(/\?|^(что|как|почему|где|когда)\s/i.test(message)){
    if(/сегодня|план|задач/i.test(message))return {reply:`На сегодня у тебя ${items.filter(x=>!x.done&&x.date<=day).length} незавершённых задач и ${habits.length} привычек. Можешь назвать новое дело — я добавлю его в план.`,actions:[],mode:'basic'};
    return {reply:'Расскажи, что хочешь запланировать, и я помогу добавить это в твой день.',actions:[],mode:'basic'};
  }
  const cleaned=message.replace(/(^|[\s,.])(сегодня|планирую|я буду|мне надо|нужно|хочу|собираюсь)(?=$|[\s,.])/gi,' ');
  const pieces=cleaned.split(/[,;\n]|\s+потом\s+|\s+затем\s+|\s+и\s+(?=(?:пойти|погулять|гулять|прочитать|читать|сделать|закончить|купить|тренироваться|готовиться|сходить|работать|учиться)\s)/i).map(s=>s.trim().replace(/^(и|а|ещё|еще)\s+/i,'').replace(/[.!?]+$/,'')).filter(s=>s.length>=4).slice(0,6);
  const actions=pieces.map(title=>({type:/каждый день|ежедневно|каждое утро|каждый вечер|привычк/i.test(title)?'habit':'task',title:title.replace(/(каждый день|ежедневно|каждое утро|каждый вечер)/gi,'').trim(),date:day,area:areaOf(title)}));
  return {reply:actions.length?'Я подготовил изменения плана из твоего сообщения.':'Расскажи, что собираешься сделать сегодня. Например: «Сегодня учусь, гуляю и читаю книгу».',actions:normalizeActions(actions,items,habits,day),mode:'basic'};
}
async function aiPlan(env,message,day,items,habits,history){
  if(!env.AI || env.AI_ENABLED!=='true')return null;
  const brief={today:day,tasks:items.filter(x=>!x.done).slice(0,35).map(x=>({id:x.id,title:x.title,date:x.date,area:x.area})),habits:habits.slice(0,30).map(x=>({title:x.title,area:x.area}))};
  const prompt=`Ты русскоязычный помощник по планированию. Помоги дружелюбно и кратко. Составь действия из сообщения пользователя. Не выдумывай факты. Существующие задачи не дублируй. Не создавай финансовые операции. Для повторяющегося занятия используй habit. Для конкретного дела используй task. Сдвиг существующей задачи — reschedule с точным id. Ответ строго JSON: {"reply":"один-два предложения","actions":[{"type":"task","title":"...","date":"YYYY-MM-DD","area":"study|work|health|money|life"},{"type":"habit","title":"...","area":"..."},{"type":"reschedule","id":"...","date":"YYYY-MM-DD"}]}. Если пользователь просто беседует, actions пустой массив. Контекст: ${JSON.stringify(brief)}. Недавний диалог: ${JSON.stringify(history)}. Сообщение: ${JSON.stringify(message)}`;
  const result=await env.AI.run('@cf/meta/llama-3.1-8b-instruct',{messages:[{role:'user',content:prompt}],max_tokens:700,temperature:0.2});
  const content=String(result?.response||'');const match=content.match(/\{[\s\S]*\}/);if(!match)return null;
  const parsed=JSON.parse(match[0]);
  return {reply:typeof parsed.reply==='string'?parsed.reply.trim().slice(0,600):'Вот что я предлагаю:',actions:normalizeActions(parsed.actions,items,habits,day),mode:'ai'};
}
export async function handleAssistant(path,method,body,env,user){
  if(path==='/api/assistant/plan' && method==='POST'){
    const message=typeof body.message==='string'?body.message.trim():'',day=body.today;
    if(!message || !dateOk(day) || String(body.message).length>1200)return respond(400,{error:'Напиши сообщение до 1200 символов'});
    const [items,habits]=await Promise.all([(await env.DB.prepare('SELECT id,title,area,date,done FROM items WHERE user=? ORDER BY created DESC LIMIT 80').bind(user).all()).results,(await env.DB.prepare('SELECT id,title,area FROM habits WHERE user=? ORDER BY created DESC LIMIT 60').bind(user).all()).results]);
    const history=Array.isArray(body.history)?body.history.slice(-6).filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.message==='string').map(x=>({role:x.role,message:x.message.slice(0,500)})):[];
    try{const proposed=await aiPlan(env,message,day,items,habits,history);if(proposed)return respond(200,proposed);}catch(error){console.warn('Workers AI unavailable',error?.message);}
    return respond(200,basicPlan(message,day,items,habits));
  }
  if(path==='/api/assistant/apply' && method==='POST'){
    const day=body.today;if(!dateOk(day))return respond(400,{error:'Некорректная дата'});
    const items=(await env.DB.prepare('SELECT id,title,date FROM items WHERE user=?').bind(user).all()).results;
    const habits=(await env.DB.prepare('SELECT id,title FROM habits WHERE user=?').bind(user).all()).results;
    const actions=normalizeActions(body.actions,items,habits,day);if(!actions.length)return respond(400,{error:'Нет изменений для сохранения'});
    let saved=0;
    for(const action of actions){
      if(action.type==='task'){
        if(items.some(x=>x.title.toLocaleLowerCase('ru-RU')===action.title.toLocaleLowerCase('ru-RU')&&x.date===action.date))continue;
        await env.DB.prepare('INSERT INTO items (id,user,title,area,horizon,date,done,created) VALUES (?,?,?,?,?,?,0,?)').bind(id(),user,action.title,action.area,'today',action.date,Date.now()).run();saved++;
      }else if(action.type==='habit'){
        if(habits.some(x=>x.title.toLocaleLowerCase('ru-RU')===action.title.toLocaleLowerCase('ru-RU')))continue;
        await env.DB.prepare('INSERT INTO habits (id,user,title,area,created) VALUES (?,?,?,?,?)').bind(id(),user,action.title,action.area,Date.now()).run();saved++;
      }else if(action.type==='reschedule'){
        const result=await env.DB.prepare('UPDATE items SET date=? WHERE id=? AND user=?').bind(action.date,action.id,user).run();saved+=result.meta.changes;
      }
    }
    return respond(200,{saved});
  }
  return null;
}
