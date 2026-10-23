const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.join(__dirname,'../public');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const data = fs.readFileSync(path.join(root,'curriculum.js'),'utf8');
const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
function setup() {
  const dom = new JSDOM(html,{url:'https://english.example/',runScripts:'outside-only'});
  dom.window.scrollTo=()=>{};
  const errors=[];dom.window.addEventListener('error',event=>errors.push(event.message));
  dom.window.eval(data+'\n'+app);
  return {window:dom.window,errors};
}
const clickText=(window,text)=>{const node=[...window.document.querySelectorAll('button')].find(button=>button.textContent.includes(text));assert.ok(node,`missing button: ${text}`);node.click();};
test('complete a lesson, save progress and review a card',()=>{
  const {window,errors}=setup();
  assert.match(window.document.querySelector('#view h1').textContent,/Говори увереннее/);
  clickText(window,'Начать учиться');
  assert.match(window.document.querySelector('#view h1').textContent,/Знакомство/);
  assert.equal(window.document.querySelectorAll('.word-card').length,8);
  clickText(window,'Проверить себя');
  for(let i=0;i<3;i++){
    const correct=window.LESSONS[0].challenge[i][2];
    window.document.querySelectorAll('.quiz-option')[correct].click();
    assert.match(window.document.querySelector('.feedback').textContent,/Верно/);
    clickText(window,i===2?'Завершить урок':'Следующий вопрос');
  }
  assert.match(window.document.querySelector('.quiz-result h1').textContent,/3 из 3/);
  const saved=JSON.parse(window.localStorage.getItem('lingostep-progress-v1'));
  assert.equal(saved.completed.introductions,3);
  assert.equal(saved.daily[Object.keys(saved.daily)[0]],3);
  window.location.hash='review';window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.match(window.document.querySelector('.flashcard h1').textContent,/introduce/);
  clickText(window,'Показать перевод');
  assert.match(window.document.querySelector('.flashcard h1').textContent,/представить/);
  clickText(window,'Вспомнил');
  const after=JSON.parse(window.localStorage.getItem('lingostep-progress-v1'));
  assert.equal(after.cards['introductions:0'].interval,2);
  assert.equal(after.daily[Object.keys(after.daily)[0]],4);
  assert.deepEqual(errors,[]);
});
test('lesson and microphone fallback remain usable without speech recognition',()=>{
  const {window,errors}=setup();
  window.location.hash='practice:introductions';window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.match(window.document.querySelector('.practice-card h1').textContent,/Hi! I’m Alex/);
  const input=window.document.querySelector('.practice-form input');
  input.value='Hi I am Alex. What is your name?';
  clickText(window,'Проверить');
  assert.match(window.document.querySelector('.feedback').textContent,/Похоже, получилось/);
  assert.deepEqual(errors,[]);
});
