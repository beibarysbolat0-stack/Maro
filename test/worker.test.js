const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const cli = path.join(root, 'node_modules/.bin/wrangler');
const freePort = () => new Promise((resolve,reject) => { const server = net.createServer(); server.once('error',reject); server.listen(0,'127.0.0.1',()=>{ const port=server.address().port; server.close(()=>resolve(port)); }); });
const waitReady = async origin => { for(let i=0;i<60;i++){try{const result=await fetch(origin+'/health');if(result.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Local Worker did not start'); };

test('Worker stores all personal sections, synchronizes sessions and separates accounts', { timeout: 45000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'maro-worker-test-'));
  const config = path.join(directory,'config'); fs.mkdirSync(config);
  const environment = { ...process.env, XDG_CONFIG_HOME: config, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
  let child, output = '';
  try {
    execFileSync(cli,['d1','migrations','apply','maro','--local','--persist-to',directory],{cwd:root,env:environment,timeout:20000,stdio:'pipe'});
    const port=await freePort(),origin=`http://127.0.0.1:${port}`;
    child=spawn(cli,['dev','--local','--ip','127.0.0.1','--port',String(port),'--persist-to',directory],{cwd:root,env:environment,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>{output+=String(chunk).slice(-1000);});
    child.stderr.on('data',chunk=>{output+=String(chunk).slice(-1000);});
    await waitReady(origin);
    async function call(route,method='GET',body,cookie){const response=await fetch(origin+'/api/'+route,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
    const first=await call('register','POST',{email:'first@example.com',password:'example-password-123'});
    assert.equal(first.status,200);
    const secondSession=await call('login','POST',{email:'first@example.com',password:'example-password-123'});
    const other=await call('register','POST',{email:'other@example.com',password:'other-password-123'});
    assert.equal(other.status,200);
    const date='2026-10-13';
    const inputs=[['items',{title:'A goal',area:'work',horizon:'today',date}],['habits',{title:'A habit',area:'health'}],['transactions',{kind:'expense',amount:2500,category:'Food',note:'Lunch',date}],['notes',{title:'An idea',category:'knowledge',body:'Remember this'}],['events',{title:'Meeting',date,time:'13:00'}],['sleep',{date,hours:7.5}],['focus',{title:'Deep work',minutes:25,date}]];
    const ids={};
    for(const [route,body] of inputs){const result=await call(route,'POST',body,first.cookie);assert.equal(result.status,201,route);ids[route]=result.data.id;}
    const checked=await call(`habits/${ids.habits}/check`,'POST',{date},secondSession.cookie);assert.equal(checked.data.done,true);
    const shared=await call('state','GET',undefined,secondSession.cookie);
    assert.equal(shared.status,200);
    for(const collection of ['items','habits','habitLogs','transactions','notes','events','sleep','focus'])assert.equal(shared.data[collection].length,1,collection);
    const isolated=await call('state','GET',undefined,other.cookie);
    assert.ok(Object.values(isolated.data).every(list=>list.length===0));
    assert.equal((await call(`transactions/${ids.transactions}`,'DELETE',{},other.cookie)).status,404);
    assert.equal((await call(`transactions/${ids.transactions}`,'DELETE',{},first.cookie)).status,200);
    assert.equal((await call('state','GET',undefined,secondSession.cookie)).data.transactions.length,0);
    const page=await fetch(origin+'/');assert.equal(page.status,200);assert.match(await page.text(),/VELTRIX — мой ритм/);
  } catch(error) { error.message+='\n'+output.slice(-1600); throw error; }
  finally { if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});}fs.rmSync(directory,{recursive:true,force:true}); }
});
