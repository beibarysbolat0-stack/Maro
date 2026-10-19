const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('signed-in interface opens every section and safely renders personal notes', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const workspaceScript = fs.readFileSync(path.join(__dirname, '../public/workspace.js'), 'utf8');
  const assistantScript = fs.readFileSync(path.join(__dirname, '../public/assistant.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://maro.example/', runScripts: 'outside-only' });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', event => errors.push(event.error || event.message));
  window.scrollTo = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const writes = [];
  window.fetch = async (input, options = {}) => {
    const route = String(input).split('/api/')[1];
    if (route === 'assistant/plan') return new Response(JSON.stringify({reply:'Добавляю прогулку.',mode:'basic',actions:[{type:'task',title:'Прогулка',area:'health',date:'2026-10-14'}]}), {status:200});
    if (route === 'assistant/apply') { writes.push({assistant:JSON.parse(options.body)}); return new Response(JSON.stringify({saved:1}), {status:200}); }
    if (options.method === 'PATCH' && route?.startsWith('items/')) { writes.push({route,body:JSON.parse(options.body)}); return new Response('{}', {status:200}); }
    if (options.method === 'POST' && route?.endsWith('/check')) { writes.push({route,body:JSON.parse(options.body)}); return new Response('{}', {status:200}); }
    if (options.method === 'POST' && route === 'items') { writes.push({item:JSON.parse(options.body)}); return new Response(JSON.stringify({id:'9'.repeat(32)}),{status:201}); }
    if (options.method === 'POST' && route === 'subtasks') { writes.push({subtask:JSON.parse(options.body)}); return new Response(JSON.stringify({id:'8'.repeat(32)}),{status:201}); }
    if (options.method === 'POST' && route === 'habits') { writes.push(JSON.parse(options.body)); return new Response(JSON.stringify({id:'e'.repeat(32)}), {status:201}); }
    if (route === 'me') return new Response(JSON.stringify({ email: 'test@example.com' }), { status: 200 });
    if (route === 'state') return new Response(JSON.stringify({
      items: [{ id:'a'.repeat(32),title:'Большая цель',area:'work',horizon:'five',date:'2031-10-13',done:0,project:'Большой проект',priority:'high' }],
      habits: [{id:'b'.repeat(32),title:'Прогулка',area:'health',created:1}], habitLogs: [],
      transactions: [{id:'c'.repeat(32),kind:'expense',amount:2000,category:'Еда',note:'Обед',date:'2026-10-13'}],
      notes: [{id:'d'.repeat(32),title:'<img src=x onerror=alert(1)>',category:'knowledge',body:'Моя заметка',created:1}],
      events: [{id:'e'.repeat(32),title:'Встреча',date:'2026-10-13',time:'12:00'}], subtasks:[{id:'f'.repeat(32),item:'a'.repeat(32),title:'Первый подпункт',done:0}], sleep: [{id:'f'.repeat(32),date:'2026-10-13',hours:8}],focus: []
    }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  try {
    window.eval(workspaceScript+'\n'+assistantScript+'\n'+script);
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(window.document.querySelector('#app').hidden, false);
    assert.equal(window.document.body.dataset.theme, 'spectrum');
    assert.equal(window.document.querySelector('.habit-row').style.getPropertyValue('--tag-color'), '#b4e35a');
    const habitButton = [...window.document.querySelectorAll('#view button')].find(x => x.textContent.includes('+ Привычка'));
    habitButton.click();
    const habitForm = window.document.querySelector('#editor-form');
    habitForm.elements.namedItem('title').value = 'Читать каждый день';
    habitForm.dispatchEvent(new window.SubmitEvent('submit', { bubbles:true, cancelable:true }));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(writes[0].title, 'Читать каждый день');
    const assistant = [...window.document.querySelectorAll('#main-nav button')].find(x => x.textContent.includes('Помощник'));
    assistant.click();
    window.document.querySelector('.assistant-input').value='Сегодня погуляю';
    window.document.querySelector('.assistant-composer').dispatchEvent(new window.SubmitEvent('submit', {bubbles:true,cancelable:true}));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(writes[1].assistant.actions[0].title,'Прогулка');
    assert.match(window.document.querySelector('#assistant-status').textContent,/Сохранено изменений: 1/);
    for (const title of ['Календарь','Доска','Привычки','Архив','Помощник','Мой путь','Итоги','Жизнь','Финансы','База знаний','Оформление']) {
      const target = [...window.document.querySelectorAll('#main-nav button')].find(x => x.textContent.includes(title));
      assert.ok(target, title);
      target.click();
      assert.match(window.document.querySelector('#view h1').textContent, new RegExp(title));
    }
    [...window.document.querySelectorAll('#main-nav button')].find(x => x.textContent.includes('Доска')).click();
    assert.match(window.document.querySelector('.work-board-card').textContent,/Большая цель/);
    assert.equal(window.document.querySelector('.work-board-card').style.getPropertyValue('--tag-color'), '#ff742e');
    window.document.querySelector('.work-board-card .work-card-actions button:nth-child(2)').click();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(writes.at(-1).body,{status:'progress'});
    [...window.document.querySelectorAll('#main-nav button')].find(x => x.textContent.includes('Привычки')).click();
    assert.equal(window.document.querySelectorAll('.work-habit-check').length,7);
    [...window.document.querySelectorAll('.work-habit-check')].find(x=>!x.disabled).click();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.match(writes.at(-1).route,/habits\/b{32}\/check/);
    const projects=[...window.document.querySelectorAll('#main-nav button')].find(x=>x.textContent.includes('Проекты'));
    projects.click();
    assert.match(window.document.querySelector('#view').textContent,/Большой проект/);
    const taskEdit=[...window.document.querySelectorAll('.work-task button')].find(x=>x.textContent==='Изменить');
    taskEdit.click();
    assert.match(window.document.querySelector('#subtask-editor').textContent,/Первый подпункт/);
    window.document.querySelector('.work-subtask-add input').value='Второй подпункт';
    window.document.querySelector('.work-subtask-add button').click();
    await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(writes.at(-1).subtask.title,'Второй подпункт');
    window.document.querySelector('#close-dialog').click();
    const search=[...window.document.querySelectorAll('#main-nav button')].find(x=>x.textContent.includes('Поиск'));
    search.click();
    const searchBox=window.document.querySelector('.work-search');searchBox.value='Большой проект';
    searchBox.dispatchEvent(new window.Event('input',{bubbles:true}));
    assert.match(window.document.querySelector('.work-search-results').textContent,/Большая цель/);
    const inbox=[...window.document.querySelectorAll('#main-nav button')].find(x=>x.textContent.includes('Входящие'));
    inbox.click();
    assert.match(window.document.querySelector('#view h1').textContent,/Входящие/);
    window.document.querySelector('#quick-add').click();
    const taskForm=window.document.querySelector('#editor-form');
    taskForm.elements.namedItem('title').value='Повторить чтение';
    taskForm.elements.namedItem('project').value='Учёба';
    taskForm.elements.namedItem('tags').value='книги, важно';
    taskForm.elements.namedItem('repeat').value='daily';
    taskForm.elements.namedItem('reminder_minutes').value='15';
    taskForm.dispatchEvent(new window.SubmitEvent('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(writes.at(-1).item.project,'Учёба');
    assert.equal(writes.at(-1).item.repeat,'daily');
    assert.equal(writes.at(-1).item.reminder_minutes,15);
    const knowledge = [...window.document.querySelectorAll('#main-nav button')].find(x => x.textContent.includes('База знаний'));
    knowledge.click();
    assert.equal(window.document.querySelector('.knowledge-card img'), null);
    assert.match(window.document.querySelector('#view').textContent, /<img src=x/);
    assert.deepEqual(errors, []);
  } finally { window.close(); }
});

test('daily plans roll over at midnight while old tasks stay in history', async () => {
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const script=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const workspace=fs.readFileSync(path.join(__dirname,'../public/workspace.js'),'utf8');
  const assistant=fs.readFileSync(path.join(__dirname,'../public/assistant.js'),'utf8');
  const dom=new JSDOM(html,{url:'https://veltrix.example/',runScripts:'outside-only'});
  const {window}=dom;
  let clock='2026-10-19T12:00:00';
  const RealDate=window.Date,intervals=[];
  window.Date=class extends RealDate {
    constructor(...args){super(...(args.length?args:[clock]));}
    static now(){return new RealDate(clock).getTime();}
  };
  window.setInterval=fn=>{intervals.push(fn);return intervals.length;};
  window.scrollTo=()=>{};
  window.fetch=async route=>new Response(JSON.stringify(route==='/api/me'?{email:'daily@example.com'}:route==='/api/state'?{
    items:[
      {id:'1'.repeat(32),title:'Позавчера',area:'work',horizon:'today',date:'2026-10-18',done:0},
      {id:'2'.repeat(32),title:'Сегодняшнее дело',area:'study',horizon:'today',date:'2026-10-19',done:0},
      {id:'3'.repeat(32),title:'Завтрашнее дело',area:'life',horizon:'today',date:'2026-10-20',done:0}
    ],habits:[],habitLogs:[],transactions:[],notes:[],events:[],sleep:[],focus:[]
  }:{}),{status:200});
  try{
    window.eval(workspace+'\n'+assistant+'\n'+script);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual([...window.document.querySelectorAll('.task-row .row-title')].map(x=>x.textContent),['Сегодняшнее дело']);
    const go=title=>[...window.document.querySelectorAll('#main-nav button')].find(x=>x.textContent.includes(title)).click();
    go('Мой путь');
    assert.deepEqual([...window.document.querySelectorAll('.goal-card h3')].map(x=>x.textContent),['Сегодняшнее дело']);
    go('Архив');
    assert.match(window.document.querySelector('#view').textContent,/Позавчера/);
    clock='2026-10-20T00:01:00';
    intervals[0]();
    await new Promise(resolve=>setTimeout(resolve,30));
    go('Сегодня');
    assert.deepEqual([...window.document.querySelectorAll('.task-row .row-title')].map(x=>x.textContent),['Завтрашнее дело']);
    go('Мой путь');
    assert.deepEqual([...window.document.querySelectorAll('.goal-card h3')].map(x=>x.textContent),['Завтрашнее дело']);
    go('Архив');
    assert.match(window.document.querySelector('#view').textContent,/Сегодняшнее дело/);
  }finally{window.close();}
});
