const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.join(__dirname,'../public');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const data = fs.readFileSync(path.join(root,'curriculum.js'),'utf8');
const extra = fs.readFileSync(path.join(root,'extra-words.js'),'utf8');
const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
function setup({now,stored}={}) {
  const dom = new JSDOM(html,{url:'https://english.example/',runScripts:'outside-only'});
  dom.window.scrollTo=()=>{};
  if(now){const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}};dom.window.Date=FixedDate;}
  if(stored)dom.window.localStorage.setItem('lingostep-progress-v1',JSON.stringify(stored));
  const errors=[];dom.window.addEventListener('error',event=>errors.push(event.message));
  dom.window.eval(data+'\n'+extra+'\n'+app);
  return {window:dom.window,errors};
}
const clickText=(window,text)=>{const node=[...window.document.querySelectorAll('button')].find(button=>button.textContent.includes(text));assert.ok(node,`missing button: ${text}`);node.click();};
test('complete a lesson, save progress and review a card',()=>{
  const {window,errors}=setup();
  assert.match(window.document.querySelector('#view h1').textContent,/Говори увереннее/);
  clickText(window,'Начать учиться');
  assert.match(window.document.querySelector('#view h1').textContent,/Знакомство/);
  assert.equal(window.document.querySelectorAll('.word-card').length,20);
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
test('opens exactly ten new words on a later visit without losing skipped days',()=>{
  const first=setup({now:'2026-10-23T12:00:00'});
  first.window.location.hash='daily';first.window.dispatchEvent(new first.window.HashChangeEvent('hashchange'));
  const firstState=JSON.parse(first.window.localStorage.getItem('lingostep-progress-v1'));
  const firstWords=firstState.dailyVocabulary['2026-10-23'];
  assert.equal(firstWords.length,10);
  assert.equal(first.window.document.querySelectorAll('.daily-word').length,10);
  assert.equal(first.window.LESSONS.length,10);
  assert.equal(new Set(first.window.LESSONS.flatMap(lesson=>lesson.words.map(word=>word[0]))).size,200);
  const sameDay=setup({now:'2026-10-23T19:00:00',stored:firstState});
  const sameState=JSON.parse(sameDay.window.localStorage.getItem('lingostep-progress-v1'));
  assert.deepEqual(sameState.dailyVocabulary['2026-10-23'],firstWords);
  assert.equal(sameState.dailyCursor,10);
  const later=setup({now:'2026-10-27T12:00:00',stored:sameState});
  later.window.location.hash='daily';later.window.dispatchEvent(new later.window.HashChangeEvent('hashchange'));
  const laterState=JSON.parse(later.window.localStorage.getItem('lingostep-progress-v1'));
  assert.equal(laterState.dailyVocabulary['2026-10-27'].length,10);
  assert.equal(laterState.dailyCursor,20);
  assert.equal(firstWords.filter(id=>laterState.dailyVocabulary['2026-10-27'].includes(id)).length,0);
  assert.match(later.window.document.querySelector('.backlog-note').textContent,/10 слов из прошлых дней/);
  later.window.location.hash='review';later.window.dispatchEvent(new later.window.HashChangeEvent('hashchange'));
  assert.match(later.window.document.querySelector('.review-status').textContent,/Осталось 20/);
  assert.deepEqual(first.errors,[]);assert.deepEqual(sameDay.errors,[]);assert.deepEqual(later.errors,[]);
});
test('finishes the finite course after the twentieth daily pack',()=>{
  const stored={version:1,completed:{},cards:{},daily:{},dailyVocabulary:{},dailyCursor:190,points:0,streak:0,lastStudy:'',goal:10};
  const last=setup({now:'2026-10-23T12:00:00',stored});
  last.window.location.hash='daily';last.window.dispatchEvent(new last.window.HashChangeEvent('hashchange'));
  const saved=JSON.parse(last.window.localStorage.getItem('lingostep-progress-v1'));
  assert.equal(saved.dailyVocabulary['2026-10-23'].length,10);
  assert.equal(saved.dailyCursor,200);
  assert.match(last.window.document.querySelector('.daily-summary').textContent,/последняя подборка/);
  const later=setup({now:'2026-10-24T12:00:00',stored:saved});
  later.window.location.hash='daily';later.window.dispatchEvent(new later.window.HashChangeEvent('hashchange'));
  assert.match(later.window.document.querySelector('.empty-state').textContent,/все 200 слов/);
  assert.deepEqual(last.errors,[]);assert.deepEqual(later.errors,[]);
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
