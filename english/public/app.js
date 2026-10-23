(() => {
  'use strict';
  const LESSONS = window.LESSONS;
  const KEY = 'lingostep-progress-v1';
  const DAILY_SIZE = 10;
  const $ = selector => document.querySelector(selector);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const dayAfter = count => { const d = new Date(); d.setDate(d.getDate() + count); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const fresh = () => ({ version:1, completed:{}, cards:{}, daily:{}, dailyVocabulary:{}, dailyCursor:0, points:0, streak:0, lastStudy:'', goal:10 });
  function load() { try { const data = JSON.parse(localStorage.getItem(KEY)); return data && data.version === 1 ? { ...fresh(), ...data } : fresh(); } catch { return fresh(); } }
  let progress = load();
  let quiz = null;
  let reviewQueue = null;
  let reviewQueueDay = '';
  let renderedDay = today();
  let flipped = false;
  let practicePhrase = null;
  let recognition = null;
  const ui = (tag, className = '', value) => { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; };
  function btn(label, className, action) { const node = ui('button', className, label); node.type='button'; node.addEventListener('click', action); return node; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { toast('Не удалось сохранить прогресс. Проверь свободное место браузера.'); } }
  function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('visible'), 4500); }
  function navigate(path) { location.hash = path; render(); window.scrollTo?.(0,0); }
  function route() { return decodeURIComponent(location.hash.slice(1)) || 'home'; }
  function lessonById(id) { return LESSONS.find(lesson => lesson.id === id); }
  function wordId(lesson, index) { return `${lesson.id}:${index}`; }
  const DAILY_ORDER = (() => {
    const seen = new Set();
    const byLesson = LESSONS.map(lesson => lesson.words.map((word,index) => ({id:wordId(lesson,index),lesson,word})).filter(entry => {
      const key = entry.word[0].toLocaleLowerCase('en');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
    const order = [];
    for (let index=0;index<Math.max(...byLesson.map(words => words.length));index++) for (const words of byLesson) if (words[index]) order.push(words[index]);
    return order;
  })();
  const DAILY_BY_ID = new Map(DAILY_ORDER.map(entry => [entry.id,entry]));
  function dailyWords() {
    progress.dailyVocabulary ||= {};
    const key=today();
    if (!Array.isArray(progress.dailyVocabulary[key])) {
      const ids=[];let cursor=Number(progress.dailyCursor)||0;
      while (ids.length<DAILY_SIZE && cursor<DAILY_ORDER.length) {
        const entry=DAILY_ORDER[cursor++];
        if (!progress.cards[entry.id]) ids.push(entry.id);
      }
      progress.dailyCursor=cursor;
      progress.dailyVocabulary[key]=ids;
      save();
    }
    return progress.dailyVocabulary[key].map(id=>DAILY_BY_ID.get(id)).filter(Boolean);
  }
  function pendingIntroducedWords() {
    dailyWords();
    const ids=Object.values(progress.dailyVocabulary).flat();
    return [...new Set(ids)].map(id=>DAILY_BY_ID.get(id)).filter(entry=>entry&&!progress.cards[entry.id]);
  }
  function dailyCount() { return Number(progress.daily[today()] || 0); }
  function streakCount() { if (!progress.lastStudy) return 0; if (progress.lastStudy === today()) return progress.streak; const yesterday = dayAfter(-1); return progress.lastStudy === yesterday ? progress.streak : 0; }
  function study(amount, points) { const key = today(), previous = dayAfter(-1); if (progress.lastStudy !== key) progress.streak = progress.lastStudy === previous ? progress.streak + 1 : 1; progress.lastStudy = key; progress.daily[key] = (Number(progress.daily[key]) || 0) + amount; progress.points += points; save(); }
  function nextLesson() { return LESSONS.find(lesson => !progress.completed[lesson.id]) || LESSONS.at(-1); }
  function reviewWords() {
    const due=[];
    for (const lesson of LESSONS) lesson.words.forEach((word,index) => {
      const id=wordId(lesson,index),card=progress.cards[id];
      if (card && card.due<=today()) due.push({id,lesson,word});
    });
    return [...due,...pendingIntroducedWords()];
  }
  function speak(text) { if (!('speechSynthesis' in window)) { toast('Озвучивание недоступно в этом браузере.'); return; } speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang='en-US'; utterance.rate=.85; speechSynthesis.speak(utterance); }
  function speaker(text, label='▶ Слушать') { return btn(label,'speak-btn',()=>speak(text)); }
  function header(label,title,description) { const wrap=ui('div','page-heading'); wrap.append(ui('p','eyebrow',label),ui('h1','',title),ui('p','lead',description)); return wrap; }
  function renderNav() {
    const sections=[['home','⌂','Главная'],['daily','✦','Слова дня'],['lessons','▤','Уроки'],['review','◈','Повторение'],['progress','▥','Прогресс']];
    const current=route().split(':')[0];
    for (const selector of ['#nav','#mobile-nav']) { const nav=$(selector); nav.replaceChildren(); for (const [key,icon,label] of sections) { const item=btn('',`nav-item ${current===key?'active':''}`,()=>navigate(key)); item.append(ui('span','nav-icon',icon),ui('span','',label)); if (key==='review'&&reviewWords().length) item.append(ui('span','nav-count',String(reviewWords().length))); nav.append(item); } }
    $('#top-points').textContent=`✦ ${progress.points}`;
  }
  function lessonCard(lesson,index) {
    const card=ui('button',`lesson-card ${lesson.accent}`); card.type='button'; card.onclick=()=>navigate(`lesson:${lesson.id}`);
    const top=ui('div','lesson-card-top'); top.append(ui('span','lesson-number',String(index+1).padStart(2,'0')),ui('span','lesson-icon',lesson.icon));
    const label=ui('div','lesson-meta'); label.append(ui('span','',lesson.level),ui('span','',`${lesson.minutes} мин`));
    card.append(top,ui('h3','',lesson.title),ui('p','',lesson.subtitle),label,ui('span','lesson-status',progress.completed[lesson.id]?'✓ Пройдено':'Начать →'));
    return card;
  }
  function renderHome(view) {
    const count=Object.keys(progress.completed).length, current=nextLesson(), daily=dailyCount();
    const hero=ui('section','hero'); const copy=ui('div','hero-copy'); copy.append(ui('p','eyebrow','ТВОЙ АНГЛИЙСКИЙ / КАЖДЫЙ ДЕНЬ'),ui('h1','',count?'Продолжай в своём ритме.':'Говори увереннее. Шаг за шагом.'),ui('p','',count?'Ты уже начал. Следующий короткий урок ждёт тебя.':'Короткие уроки, полезные фразы и повторение слов — каждый день понемногу.'));
    copy.append(btn(count?'Продолжить урок →':'Начать учиться →','primary-btn',()=>navigate(`lesson:${current.id}`))); const ornament=ui('div','hero-ornament'); ornament.append(ui('span','ornament-big','Hello!'),ui('span','ornament-small','You can do this ✦')); hero.append(copy,ornament); view.append(hero);
    const stats=ui('div','stats'); for (const [number,label,symbol] of [[`${count}/${LESSONS.length}`,'уроков пройдено','▤'],[`${streakCount()} дн.`,'серия занятий','✦'],[`${daily}/${progress.goal}`,'действий сегодня','◈']]) { const stat=ui('div','stat'); stat.append(ui('span','stat-symbol',symbol),ui('strong','',number),ui('span','',label)); stats.append(stat); } view.append(stats);
    const pack=dailyWords(),moreTomorrow=progress.dailyCursor<DAILY_ORDER.length,dailyFeature=ui('section','daily-feature');const dailyText=ui('div');dailyText.append(ui('p','eyebrow','НОВОЕ КАЖДЫЙ ДЕНЬ'),ui('h2','',pack.length?`${pack.length} новых слов сегодня`:'Все слова курса открыты'),ui('p','',pack.length?`Сегодня: ${pack.slice(0,3).map(entry=>entry.word[0]).join(' · ')}… ${moreTomorrow?'Завтра появится следующая десятка.':'Это последняя подборка курса.'}`:'Продолжай повторять изученные слова и проходить уроки.'));dailyFeature.append(ui('span','daily-feature-icon','✦'),dailyText,btn(pack.length?'Слова дня →':'Повторить →','dark-btn',()=>navigate(pack.length?'daily':'review')));view.append(dailyFeature);
    const row=ui('div','section-head'); row.append(ui('div','',undefined)); row.firstChild.append(ui('p','eyebrow','ПРОДОЛЖИТЬ'),ui('h2','',current.title)); row.append(btn('Все уроки →','text-btn',()=>navigate('lessons'))); view.append(row);
    const feature=ui('div',`featured ${current.accent}`); const content=ui('div'); content.append(ui('span','badge',`${current.level} · ${current.minutes} минут`),ui('h3','',current.subtitle),ui('p','',current.tip),btn('Открыть урок →','dark-btn',()=>navigate(`lesson:${current.id}`))); feature.append(ui('span','feature-icon',current.icon),content); view.append(feature);
    const pending=reviewWords().length; const review=ui('div','review-promo'); const reviewCopy=ui('div'); reviewCopy.append(ui('strong','',pending?`${pending} слов ждут повторения`:'На сегодня всё повторено'),ui('p','',pending?'Вспомни слова сейчас — так они останутся с тобой надолго.':'Возвращайся завтра за следующей порцией практики.')); review.append(ui('span','review-promo-icon','◈'),reviewCopy,btn(pending?'Повторить →':'Открыть','outline-btn',()=>navigate('review'))); view.append(review);
  }
  function renderDaily(view) {
    const words=dailyWords(),reviewed=words.filter(entry=>progress.cards[entry.id]).length;
    view.append(header('10 НОВЫХ СЛОВ / КАЖДЫЙ ДЕНЬ','Слова дня','Каждый новый день открывается следующая десятка. Если пропустишь день, слова не исчезнут: новая порция появится при следующем посещении.'));
    if (!words.length) {const done=ui('section','empty-state');done.append(ui('span','result-icon','✦'),ui('h2','','Ты открыл все 200 слов курса!'),ui('p','','Новые слова в этом курсе закончились. Повторяй изученное и проходи темы ещё раз.'),btn('Повторить слова →','primary-btn',()=>navigate('review')));view.append(done);return;}
    const summary=ui('section','daily-summary');summary.append(ui('span','daily-summary-icon','✦'));const copy=ui('div');copy.append(ui('strong','',`${words.length} слов на сегодня`),ui('p','',`${reviewed} из ${words.length} уже отправлено в повторение. ${progress.dailyCursor<DAILY_ORDER.length?'При следующем посещении в новый день появится новая подборка.':'Это последняя подборка курса.'}`));summary.append(copy,btn('Повторять →','outline-btn',()=>{reviewQueue=null;navigate('review');}));view.append(summary);
    const grid=ui('div','word-grid');for(const entry of words){const [english,russian,example]=entry.word,card=ui('article','word-card daily-word');const top=ui('div','word-top');top.append(ui('span','word-topic',entry.lesson.title),speaker(english,'▶'));card.append(top,ui('h3','',english),ui('p','word-translation',russian),ui('p','word-example',example));if(progress.cards[entry.id])card.append(ui('span','studied-mark','✓ В повторении'));grid.append(card);}view.append(grid);
    const previous=pendingIntroducedWords().filter(entry=>!words.some(word=>word.id===entry.id));
    if(previous.length){const backlog=ui('section','backlog-note');backlog.append(ui('strong','',`Остались ${previous.length} слов из прошлых дней`),ui('p','','Они не пропали: карточки ждут тебя в повторении.'),btn('Вернуться к ним →','outline-btn',()=>{reviewQueue=null;navigate('review');}));view.append(backlog);}
    view.append(ui('p','review-hint','Нажми «Повторять», чтобы закрепить слова. Остальные слова каждой темы доступны в разделе «Уроки».'));
  }
  function renderLessons(view) { view.append(header('КУРС / A1 → A2','Уроки','Практические темы для тех, кто уже знает простые слова и фразы. Проходи в удобном порядке.')); const grid=ui('div','lesson-grid'); LESSONS.forEach((lesson,index)=>grid.append(lessonCard(lesson,index))); view.append(grid); }
  function renderLesson(view,id) {
    const lesson=lessonById(id); if (!lesson) return navigate('lessons');
    view.append(btn('← Все уроки','back-btn',()=>navigate('lessons')));
    const intro=ui('div',`lesson-intro ${lesson.accent}`); intro.append(ui('span','lesson-intro-icon',lesson.icon),ui('p','eyebrow',`${lesson.level} / ${lesson.minutes} МИНУТ`),ui('h1','',lesson.title),ui('p','',lesson.subtitle),btn('Проверить себя →','dark-btn',()=>startQuiz(id))); view.append(intro);
    const grammar=ui('section','content-card grammar'); grammar.append(ui('p','eyebrow','ПОЛЕЗНО ЗНАТЬ'),ui('h2','','Правило в двух словах'),ui('p','',lesson.grammar)); view.append(grammar);
    const row=ui('div','section-head'); const title=ui('div'); title.append(ui('p','eyebrow','СЛОВАРЬ'),ui('h2','',`${lesson.words.length} слов и выражений`)); row.append(title); view.append(row);
    const dailyIds=new Set(dailyWords().map(entry=>entry.id));const words=ui('div','word-grid'); lesson.words.forEach(([english,russian,example],index)=>{ const card=ui('article',`word-card ${dailyIds.has(wordId(lesson,index))?'today-word':''}`); const top=ui('div','word-top'); top.append(ui('span','word-index',String(index+1).padStart(2,'0')),speaker(english,'▶')); card.append(top,ui('h3','',english),ui('p','word-translation',russian),ui('p','word-example',example)); if(dailyIds.has(wordId(lesson,index)))card.append(ui('span','studied-mark','✦ Сегодня'));words.append(card); }); view.append(words);
    const conversation=ui('section','content-card dialogue'); conversation.append(ui('p','eyebrow','ЖИВОЙ РАЗГОВОР'),ui('h2','','Диалог'),ui('p','muted','Нажми ▶, чтобы услышать фразу. Попробуй повторить её вслух.'));
    for (const [speakerName,english,russian] of lesson.dialogue) { const line=ui('div','dialogue-line'); line.append(ui('span','dialogue-avatar',speakerName)); const body=ui('div'); body.append(ui('strong','',english),ui('small','',russian)); line.append(body,speaker(english,'▶')); conversation.append(line); } view.append(conversation);
    const finish=ui('section','lesson-finish'); finish.append(ui('div','',undefined)); finish.firstChild.append(ui('p','eyebrow','ТВОЙ СЛЕДУЮЩИЙ ШАГ'),ui('h2','','Попробуй сам'),ui('p','',lesson.tip)); const actions=ui('div','finish-actions'); actions.append(btn('Говорить вслух','outline-btn',()=>navigate(`practice:${id}`)),btn('Проверить себя →','primary-btn',()=>startQuiz(id))); finish.append(actions); view.append(finish);
  }
  function startQuiz(id) { const lesson=lessonById(id); if (!lesson) return; quiz={id,index:0,score:0,answered:false,picked:null}; navigate(`quiz:${id}`); }
  function renderQuiz(view,id) {
    const lesson=lessonById(id); if (!lesson) return navigate('lessons'); if (!quiz || quiz.id!==id) quiz={id,index:0,score:0,answered:false,picked:null};
    const questions=lesson.challenge, current=questions[quiz.index]; view.append(btn('← Вернуться к уроку','back-btn',()=>navigate(`lesson:${id}`)));
    if (!current) { const passed=quiz.score>=2; const result=ui('section','quiz-result'); result.append(ui('span','result-icon',passed?'✦':'◈'),ui('p','eyebrow','УРОК ЗАВЕРШЁН'),ui('h1','',`${quiz.score} из ${questions.length} правильно`),ui('p','',passed?'Отличная работа! Этот урок теперь в твоём маршруте.':'Ошибки помогают учиться. Повтори фразы и попробуй ещё раз.')); const actions=ui('div','finish-actions'); actions.append(btn('Повторить урок','outline-btn',()=>navigate(`lesson:${id}`)),btn(passed?'Следующий урок →':'Попробовать ещё раз','primary-btn',()=>passed?navigate(`lesson:${nextLesson().id}`):startQuiz(id))); result.append(actions); view.append(result); return; }
    const head=ui('div','quiz-head'); head.append(ui('p','eyebrow',`${lesson.title.toUpperCase()} / ВОПРОС ${quiz.index+1} ИЗ ${questions.length}`),ui('div','quiz-bar')); head.lastChild.style.setProperty('--progress',`${(quiz.index/questions.length)*100}%`); view.append(head);
    const card=ui('section','quiz-card'); card.append(ui('span','quiz-spark','✳'),ui('h1','',current[0])); const options=ui('div','quiz-options'); current[1].forEach((answer,index)=>{ const node=btn(answer,`quiz-option ${quiz.answered?(index===current[2]?'correct':index===quiz.picked?'wrong':''):''}`,()=>{ if (quiz.answered) return; quiz.answered=true; quiz.picked=index; if (index===current[2]) quiz.score++; render(); }); options.append(node); }); card.append(options);
    if (quiz.answered) { const feedback=ui('div',`feedback ${quiz.picked===current[2]?'right':'retry'}`); feedback.append(ui('strong','',quiz.picked===current[2]?'Верно!':'Пока не совсем.'),ui('p','',current[3])); card.append(feedback,btn(quiz.index===questions.length-1?'Завершить урок →':'Следующий вопрос →','primary-btn',()=>{ quiz.index++; quiz.answered=false; quiz.picked=null; if (quiz.index===questions.length) { if (quiz.score>=2) progress.completed[id]=Math.max(progress.completed[id]||0,quiz.score); study(questions.length,quiz.score*10); reviewQueue=null; } render(); })); }
    view.append(card);
  }
  function renderReview(view) {
    if (!reviewQueue || reviewQueueDay!==today()) { reviewQueue=reviewWords();reviewQueueDay=today();flipped=false; }
    view.append(header('ПАМЯТЬ / КАРТОЧКИ','Повторение','Сначала попробуй вспомнить значение, затем переверни карточку и оцени себя.'));
    if (!reviewQueue.length) { const empty=ui('section','empty-state'); empty.append(ui('span','result-icon','✓'),ui('h2','','Всё повторено!'),ui('p','','Новая десятка слов появится при следующем посещении в новый день.'),btn('Посмотреть слова дня →','primary-btn',()=>navigate('daily'))); view.append(empty); return; }
    const entry=reviewQueue[0], count=reviewQueue.length; const top=ui('div','review-status'); top.append(ui('span','badge',`Осталось ${count}`),ui('span','',entry.lesson.title)); view.append(top);
    const card=ui('section',`flashcard ${flipped?'flipped':''}`); card.append(ui('p','eyebrow',flipped?'ПЕРЕВОД':'ВСПОМНИ ПЕРЕВОД'),ui('h1','',flipped?entry.word[1]:entry.word[0]),ui('p','',flipped?entry.word[2]:'Что значит это слово или выражение?'));
    const actions=ui('div','flash-actions'); actions.append(speaker(entry.word[0],'▶ Произношение')); if (!flipped) actions.append(btn('Показать перевод','primary-btn',()=>{flipped=true;render();})); card.append(actions); view.append(card);
    if (flipped) { const grades=ui('div','grade-grid'); for (const [grade,label] of [['again','Забыл'],['hard','С трудом'],['good','Вспомнил'],['easy','Легко']]) grades.append(btn(label,`grade ${grade}`,()=>gradeCard(entry,grade))); view.append(grades); }
    const hint=ui('p','review-hint','Повторение работает на этом устройстве и сохраняется автоматически.'); view.append(hint);
  }
  function gradeCard(entry,grade) {
    const old=progress.cards[entry.id] || {interval:0,seen:0,correct:0};
    const interval=grade==='again'?0:grade==='hard'?1:grade==='good'?Math.max(2,Math.ceil(old.interval*2.4)):Math.max(4,Math.ceil(old.interval*3.5));
    progress.cards[entry.id]={ interval,due:dayAfter(interval),seen:old.seen+1,correct:old.correct+(grade==='again'?0:1) };
    study(1,grade==='again'?1:grade==='hard'?3:5); reviewQueue.shift(); flipped=false; render();
  }
  function normalize(text) { return text.toLocaleLowerCase('en').replace(/’/g,"'").replace(/\b(i'm|you're|we're|they're|he's|she's|it's|what's|where's|that's)\b/g,word=>({'i\'m':'i am','you\'re':'you are','we\'re':'we are','they\'re':'they are','he\'s':'he is','she\'s':'she is','it\'s':'it is','what\'s':'what is','where\'s':'where is','that\'s':'that is'})[word]).replace(/[^a-z\s']/g,'').replace(/\s+/g,' ').trim(); }
  function checkPronunciation(target,spoken) { const expected=normalize(target).split(' '),actual=normalize(spoken).split(' '); const common=expected.filter(word=>actual.includes(word)).length; return common/Math.max(expected.length,1)>=.7; }
  function renderPractice(view,id) {
    const lesson=lessonById(id); if (!lesson) return navigate('lessons'); if (!practicePhrase || practicePhrase.lesson!==id) practicePhrase={lesson:id,index:0,result:''};
    const line=lesson.dialogue[practicePhrase.index]; view.append(btn('← Вернуться к уроку','back-btn',()=>navigate(`lesson:${id}`)),header('ПРОИЗНОШЕНИЕ / ПРАКТИКА','Говори вслух','Послушай фразу, повтори её и проверь себя. Если микрофон недоступен, введи фразу вручную.'));
    const card=ui('section','practice-card'); card.append(ui('span','badge',`${practicePhrase.index+1} / ${lesson.dialogue.length}`),ui('h1','',line[1]),ui('p','',line[2])); const controls=ui('div','practice-controls'); controls.append(speaker(line[1],'▶ Послушать'));
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if (Recognition) controls.append(btn('🎙 Говорить','primary-btn',()=>{ try { recognition?.abort(); recognition=new Recognition(); recognition.lang='en-US'; recognition.interimResults=false; recognition.onresult=event=>{practicePhrase.result=event.results[0][0].transcript;render();}; recognition.onerror=event=>toast(`Микрофон: ${event.error}. Можно ввести фразу ниже.`); recognition.start(); toast('Слушаю. Скажи фразу вслух.'); } catch { toast('Не удалось включить микрофон. Введи фразу ниже.'); } }));
    card.append(controls); const form=ui('form','practice-form'); const label=ui('label','', 'Или напиши услышанную фразу'); const input=ui('input'); input.name='phrase'; input.autocomplete='off'; input.placeholder='Например: How are you?'; label.append(input); form.append(label,btn('Проверить','outline-btn',()=>{ practicePhrase.result=input.value;render(); })); form.addEventListener('submit',event=>{event.preventDefault();practicePhrase.result=input.value;render();}); card.append(form);
    if (practicePhrase.result) { const okay=checkPronunciation(line[1],practicePhrase.result); const result=ui('div',`feedback ${okay?'right':'retry'}`); result.append(ui('strong','',okay?'Похоже, получилось!':'Почти. Послушай и попробуй ещё раз.'),ui('p','',`Ты сказал: ${practicePhrase.result}`)); card.append(result); }
    card.append(btn(practicePhrase.index===lesson.dialogue.length-1?'Вернуться к уроку':'Следующая фраза →','text-btn',()=>{ if (practicePhrase.index===lesson.dialogue.length-1) navigate(`lesson:${id}`); else { practicePhrase.index++; practicePhrase.result=''; render(); } })); view.append(card);
    view.append(ui('p','review-hint','Распознавание голоса зависит от браузера и может требовать интернет. Текстовая проверка приблизительная.'));
  }
  function exportProgress() { const blob=new Blob([JSON.stringify(progress,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=ui('a'); link.href=url;link.download=`lingostep-progress-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function importProgress(file) { if (!file || file.size>1024*1024) return toast('Выбери файл прогресса размером до 1 МБ.'); file.text().then(text=>{ try { const data=JSON.parse(text); if(data.version!==1||typeof data.completed!=='object'||typeof data.cards!=='object'||!Number.isFinite(data.points)) throw Error('bad file'); if(!confirm('Заменить текущий прогресс данными из файла?'))return; progress={...fresh(),...data};save();reviewQueue=null;navigate('progress');toast('Прогресс загружен.'); } catch { toast('Это не файл прогресса LingoStep.'); } }); }
  function renderProgress(view) {
    view.append(header('ТВОЙ ПУТЬ / РЕЗУЛЬТАТ','Прогресс','Твои маленькие занятия складываются в большой результат.'));
    const complete=Object.keys(progress.completed).length, learned=DAILY_ORDER.filter(entry=>progress.cards[entry.id]?.correct>0).length, total=DAILY_ORDER.length;
    const stats=ui('div','stats'); for(const [number,label,symbol] of [[complete,'уроков пройдено','▤'],[learned,'слов повторено','◈'],[`${streakCount()} дн.`,'текущая серия','✦'],[progress.points,'очков опыта','✳']]){const stat=ui('div','stat');stat.append(ui('span','stat-symbol',symbol),ui('strong','',String(number)),ui('span','',label));stats.append(stat);}view.append(stats);
    const progressCard=ui('section','content-card');progressCard.append(ui('p','eyebrow','КУРС A1 → A2'),ui('h2','',`${complete} из ${LESSONS.length} уроков`));const bar=ui('div','progress-track');bar.append(ui('span'));bar.firstChild.style.width=`${Math.round(complete/LESSONS.length*100)}%`;progressCard.append(bar,ui('p','muted',`В курсе ${total} слов и выражений. Из них ты уже повторил ${learned}.`));view.append(progressCard);
    const calendar=ui('section','content-card');calendar.append(ui('p','eyebrow','ПОСЛЕДНИЕ 14 ДНЕЙ'),ui('h2','','Твой ритм'));const days=ui('div','activity-days');for(let i=13;i>=0;i--){const key=dayAfter(-i),day=ui('div',`activity-day ${progress.daily[key]?'filled':''}`);day.title=`${key}: ${progress.daily[key]||0} действий`;day.append(ui('span','',String(Number(key.slice(-2)))),ui('small','',i===0?'сегодня':''));days.append(day);}calendar.append(days);view.append(calendar);
    const settings=ui('section','content-card settings');settings.append(ui('p','eyebrow','МОЙ РИТМ'),ui('h2','','Цель на день'));const goalRow=ui('div','goal-row');for(const value of [5,10,15])goalRow.append(btn(`${value} действий`,`goal-choice ${progress.goal===value?'active':''}`,()=>{progress.goal=value;save();render();}));settings.append(goalRow,ui('p','muted','Действием считается ответ в тесте или повторённое слово. Цель меняется в любой момент.'));view.append(settings);
    const backup=ui('section','content-card backup');backup.append(ui('p','eyebrow','МОИ ДАННЫЕ'),ui('h2','','Перенести прогресс'),ui('p','muted','Прогресс хранится в этом браузере. Чтобы перенести его на другое устройство, скачай файл здесь и загрузи там.'));const controls=ui('div','finish-actions');controls.append(btn('Скачать прогресс','outline-btn',exportProgress));const importLabel=ui('label','import-btn','Загрузить файл');const input=ui('input');input.type='file';input.accept='application/json,.json';input.addEventListener('change',()=>importProgress(input.files[0]));importLabel.append(input);controls.append(importLabel);backup.append(controls);view.append(backup);
  }
  function render() {
    renderNav(); const view=$('#view'); view.replaceChildren(); const [name,id]=route().split(':');
    if(name==='home')renderHome(view);else if(name==='daily')renderDaily(view);else if(name==='lessons')renderLessons(view);else if(name==='lesson')renderLesson(view,id);else if(name==='quiz')renderQuiz(view,id);else if(name==='review')renderReview(view);else if(name==='practice')renderPractice(view,id);else if(name==='progress')renderProgress(view);else navigate('home');
  }
  window.addEventListener('hashchange',render);
  const refreshAfterDateChange=()=>{if(renderedDay!==today()){renderedDay=today();reviewQueue=null;render();}};
  window.addEventListener('focus',refreshAfterDateChange);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAfterDateChange();});
  if ('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('/sw.js').catch(()=>{});
  render();
})();
