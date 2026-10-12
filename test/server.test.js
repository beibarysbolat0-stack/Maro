const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
test('accounts, synchronization, isolation and persistence',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'maro-test-'));let child;
 const start=()=>new Promise((resolve,reject)=>{child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'3198',HOST:'127.0.0.1',MARO_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('Server failed'));});});
 const stop=()=>new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 async function request(route,method='GET',body,cookie){const r=await fetch('http://127.0.0.1:3198'+route,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
 await start();assert.equal((await request('/api/items')).status,401);
 const credentials={email:'first@example.com',password:'test-password-123'};
 const a=await request('/api/register','POST',credentials);assert.equal(a.status,200);
 const b=await request('/api/login','POST',credentials);assert.equal(b.status,200);
 const other=await request('/api/register','POST',{email:'other@example.com',password:'other-password-123'});
 assert.equal((await request('/api/login','POST',{...credentials,password:'wrong-password'})).status,401);
 const created=await request('/api/items','POST',{title:'Учить JavaScript',area:'study',horizon:'today',date:'2026-10-12'},a.cookie);assert.equal(created.status,201);
 let list=await request('/api/items','GET',null,b.cookie);assert.equal(list.body[0].title,'Учить JavaScript');
 assert.equal((await request('/api/items','GET',null,other.cookie)).body.length,0);
 assert.equal((await request('/api/items/'+created.body.id,'DELETE',{},other.cookie)).status,404);
 assert.equal((await request('/api/items/'+created.body.id,'PATCH',{done:true},b.cookie)).status,200);
 await stop();await start();list=await request('/api/items','GET',null,a.cookie);assert.equal(list.body[0].done,1);
 assert.equal((await request('/api/items/'+created.body.id,'DELETE',{},a.cookie)).status,200);
 assert.equal((await request('/api/items','GET',null,b.cookie)).body.length,0);
 await request('/api/logout','POST',{},a.cookie);assert.equal((await request('/api/me','GET',null,a.cookie)).status,401);
 const html=await fetch('http://127.0.0.1:3198/');assert.equal(html.status,200);assert.match(await html.text(),/Ваш следующий шаг/);
 }finally{if(child&&child.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});}
});
