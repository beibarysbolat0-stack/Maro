const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('signed-in interface opens every section and safely renders personal notes', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
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
    if (options.method === 'POST' && route === 'habits') { writes.push(JSON.parse(options.body)); return new Response(JSON.stringify({id:'e'.repeat(32)}), {status:201}); }
    if (route === 'me') return new Response(JSON.stringify({ email: 'test@example.com' }), { status: 200 });
    if (route === 'state') return new Response(JSON.stringify({
      items: [{ id:'a'.repeat(32),title:'Большая цель',area:'work',horizon:'five',date:'2031-10-13',done:0 }],
      habits: [{id:'b'.repeat(32),title:'Прогулка',area:'health',created:1}], habitLogs: [],
      transactions: [{id:'c'.repeat(32),kind:'expense',amount:2000,category:'Еда',note:'Обед',date:'2026-10-13'}],
      notes: [{id:'d'.repeat(32),title:'<img src=x onerror=alert(1)>',category:'knowledge',body:'Моя заметка',created:1}],
      events: [{id:'e'.repeat(32),title:'Встреча',date:'2026-10-13',time:'12:00'}], sleep: [{id:'f'.repeat(32),date:'2026-10-13',hours:8}],focus: []
    }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  try {
    window.eval(assistantScript+'\n'+script);
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(window.document.querySelector('#app').hidden, false);
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
    for (const title of ['Помощник','Мой путь','Итоги','Жизнь','Финансы','База знаний','Оформление']) {
      const target = [...window.document.querySelectorAll('#main-nav button')].find(x => x.textContent.includes(title));
      assert.ok(target, title);
      target.click();
      assert.match(window.document.querySelector('#view h1').textContent, new RegExp(title));
    }
    const knowledge = [...window.document.querySelectorAll('#main-nav button')].find(x => x.textContent.includes('База знаний'));
    knowledge.click();
    assert.equal(window.document.querySelector('.knowledge-card img'), null);
    assert.match(window.document.querySelector('#view').textContent, /<img src=x/);
    assert.deepEqual(errors, []);
  } finally { window.close(); }
});
