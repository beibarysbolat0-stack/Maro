function renderAssistant(){
  const view=$('#view');
  view.append(heading('ТВОЙ ПОМОЩНИК','Помощник','Расскажи голосом или напиши, что планируешь. VELTRIX подготовит задачи и привычки.'));
  const layout=make('div','assistant-layout'),intro=panel(),chat=panel();
  intro.classList.add('assistant-intro');
  intro.append(make('span','overline','ПЛАНИРОВАНИЕ В ДИАЛОГЕ'),make('h2','','Скажи как есть. План станет яснее.'),make('p','muted','Например: «Сегодня хочу закончить проект, погулять и каждый день читать по 20 минут». Помощник добавит распознанные дела и привычки в твой план. Автосохранение можно выключить ниже.'));
  const examples=make('div','assistant-examples');
  for(const phrase of ['Сегодня готовлюсь к экзамену и иду на тренировку','Хочу каждый день гулять 20 минут','Перенеси мою задачу на завтра'])examples.append(button(phrase,'pill',()=>{input.value=phrase;input.focus();}));
  intro.append(examples);
  const status=make('p','assistant-status','Готов слушать.');status.id='assistant-status';
  chat.append(sectionTitle('Разговор',null,'ПОМОЩНИК VELTRIX'));
  const messages=make('div','assistant-messages');messages.id='assistant-messages';chat.append(messages);
  const draft=make('div','assistant-draft');draft.id='assistant-draft';chat.append(draft);
  const form=make('form','assistant-composer');
  const input=make('textarea','assistant-input');input.placeholder='Что ты собираешься сделать сегодня?';input.rows=3;input.maxLength=1200;input.setAttribute('aria-label','Сообщение помощнику');
  const controls=make('div','assistant-controls'),voice=button('🎙 Сказать','btn outline',startVoice),send=make('button','btn primary','Отправить →');send.type='submit';
  controls.append(voice,send);form.append(input,controls);chat.append(form);
  const autoLabel=make('label','assistant-auto'),auto=make('input');auto.type='checkbox';auto.checked=true;autoLabel.append(auto,make('span','','Автоматически сохранять предложенные задачи и привычки'));chat.append(autoLabel,status);
  layout.append(intro,chat);view.append(layout);
  const storageKey='veltrix-chat:'+state.email;
  let history=[];try{history=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(history))history=[];}catch{}
  history=history.slice(-20);
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(history.slice(-20)));}catch{}};
  const add=(role,message)=>{history.push({role,message});history=history.slice(-20);save();const bubble=make('div',`assistant-bubble ${role}`,message);messages.append(bubble);messages.scrollTop=messages.scrollHeight;};
  for(const entry of history)if(typeof entry.message==='string'&&['user','assistant'].includes(entry.role))messages.append(make('div',`assistant-bubble ${entry.role}`,entry.message));
  if(!history.length)messages.append(make('div','assistant-bubble assistant','Привет! Что у тебя сегодня в планах?'));
  async function apply(actions){
    const result=await api('assistant/apply','POST',{actions,today:today()});state.data=await api('state');status.textContent=result.saved?`Сохранено изменений: ${result.saved}. Проверь план на странице «Сегодня».`:'Эти записи уже есть в плане.';draft.replaceChildren();
  }
  function showDraft(actions){
    draft.replaceChildren();if(!actions.length)return;
    draft.append(make('strong','','Предлагаю изменить план:'));
    for(const action of actions)draft.append(make('div','assistant-proposal',`${action.type==='habit'?'Привычка':action.type==='reschedule'?'Перенос':'Задача'} · ${action.title||action.date}`));
    draft.append(button('Применить изменения','btn primary',async()=>{try{await apply(actions);}catch(error){status.textContent=error.message;}}));
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const message=input.value.trim();if(!message)return;
    input.value='';add('user',message);draft.replaceChildren();send.disabled=true;voice.disabled=true;status.textContent='Подбираю план…';
    try{
      const result=await api('assistant/plan','POST',{message,today:today(),history:history.slice(-6)});
      add('assistant',result.reply);status.textContent=result.mode==='ai'?'Ответ ИИ получен.':'ИИ пока недоступен; показан простой разбор текста.';
      if(result.actions?.length){if(auto.checked){await apply(result.actions);}else showDraft(result.actions);}
    }catch(error){status.textContent=error.message;add('assistant','Не удалось обработать сообщение. Попробуй ещё раз.');}
    finally{send.disabled=false;voice.disabled=false;input.focus();}
  });
  function startVoice(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){status.textContent='Голосовой ввод недоступен в этом браузере. Можно написать сообщение.';return;}
    const recognition=new Recognition();recognition.lang='ru-RU';recognition.interimResults=false;recognition.maxAlternatives=1;
    status.textContent='Слушаю…';voice.disabled=true;
    recognition.onresult=event=>{input.value=event.results[0][0].transcript;status.textContent='Речь распознана. Готовлю план…';form.requestSubmit();};
    recognition.onerror=event=>{status.textContent=event.error==='not-allowed'?'Разреши доступ к микрофону в браузере.':'Не удалось распознать речь. Попробуй снова.';};
    recognition.onend=()=>{voice.disabled=false;if(status.textContent==='Слушаю…')status.textContent='Нажми на микрофон и попробуй снова.';};
    recognition.start();
  }
}
