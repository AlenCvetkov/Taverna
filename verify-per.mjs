import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {rmSync} from 'node:fs';
const path=`data/per-check-${randomUUID()}.sqlite`,pass=randomUUID(),base='http://127.0.0.1:4198';
const env={...process.env,SQLITE_PATH:path,PORT:'4198'};
for(const role of ['KELNER1','KELNER2','MENADZER','DIREKTOR'])env[`SEED_${role}_PASSWORD`]=pass;
let processHandle;
async function start(){processHandle=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe']});let errors='';processHandle.stderr.on('data',d=>errors+=d);await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error(errors||'Startup timeout')),15000);processHandle.stdout.on('data',d=>{if(String(d).includes('Taverna POS:')){clearTimeout(timer);ok();}});processHandle.once('exit',c=>{clearTimeout(timer);no(Error('Server exit '+c+': '+errors));});});}
async function stop(){if(processHandle){const done=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await done;processHandle=null;}}
async function req(cookie,path,method='GET',data,expected=200){const r=await fetch(base+path,{method,headers:{cookie,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const b=await r.json();assert.equal(r.status,expected,JSON.stringify(b));return b;}
async function login(username,password=pass){const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
try{
 await start();const w1=await login('kelner1'),w2=await login('kelner2'),director=await login('direktor');
 const tables=(await req(w1,'/api/tables')).tables,table=tables[0].id;
 const products=(await req(w1,'/api/products?kind=all')).products,coffee=products.find(p=>p.code===501),burger=products.find(p=>p.code===801),cheese=products.find(p=>p.code===200);
 await req(w1,`/api/tables/${table}/select`,'POST',{});assert.equal((await req(w1,'/api/tables')).tables[0].status,'free');
 const coffeeLine={productId:coffee.id,quantity:1,note:'',addons:[]};
 const order={tableId:table,idempotencyKey:randomUUID(),items:[{productId:burger.id,quantity:2,note:'bez kromid',addons:[{productId:cheese.id,quantity:1}]},coffeeLine]};
 await req(w1,'/api/orders','POST',order,201);
 await req(w2,'/api/orders','POST',{tableId:table,idempotencyKey:randomUUID(),items:[coffeeLine]},201);
 for(const cookie of [w1,w2]){const t=(await req(cookie,'/api/tables')).tables.find(t=>t.id===table);assert(t.isMine);assert.equal(t.totalMinor,100000);}
 const shown=(await req(w2,`/api/tables/${table}`)).table.orders;
 assert(shown.every(o=>!('createdAt' in o)));assert.deepEqual(new Set(shown.flatMap(o=>o.items).map(i=>i.waiter)),new Set(['Kelner 1','Kelner 2']));
 const duplicate={tableId:table,idempotencyKey:randomUUID(),items:[coffeeLine]};
 const responses=await Promise.all([fetch(base+'/api/orders',{method:'POST',headers:{cookie:w1,'Content-Type':'application/json'},body:JSON.stringify(duplicate)}),fetch(base+'/api/orders',{method:'POST',headers:{cookie:w1,'Content-Type':'application/json'},body:JSON.stringify(duplicate)})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
 await req(w2,'/api/orders','POST',duplicate,409);
 await req(w1,'/api/orders','POST',{tableId:tables[1].id,idempotencyKey:randomUUID(),items:[coffeeLine,{...coffeeLine,addons:[{productId:cheese.id,quantity:0}]}]},400);
 assert.equal((await req(w1,'/api/tables')).tables[1].status,'free');
 await req(w1,'/api/bills','GET',undefined,403);
 await req(director,`/api/products/${coffee.id}`,'PATCH',{name:'Ново еспресо',priceMinor:18000});
 assert.equal((await req(w1,'/api/tables')).tables[0].totalMinor,109000);
 await req(w2,`/api/tables/${table}/pay`,'POST',{});
 await req(w2,`/api/tables/${table}/pay`,'POST',{},400);
 for(const cookie of [w1,w2])assert.equal((await req(cookie,'/api/tables')).tables[0].isMine,false);
 await req(w1,'/api/orders','POST',{tableId:table,idempotencyKey:randomUUID(),items:[coffeeLine]},201);
 const history=(await req(director,'/api/bills')).bills;assert.equal(history.length,2);assert.equal(history.find(b=>b.paid).totalMinor,109000);assert.equal(history.find(b=>!b.paid).totalMinor,18000);
 await req(director,'/api/tables','POST',{type:'O',number:99},201);
 const added=(await req(director,'/api/tables')).tables.find(t=>t.label==='O99');
 await req(director,'/api/users','POST',{name:'Director 2',username:'director2',password:pass,role:'director'},201);
 const director2=await login('director2');await req(director2,`/api/tables/${added.id}`,'PATCH',{type:'P',number:99});
 const requests=[w1,w2].map(cookie=>fetch(base+'/api/orders',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({tableId:tables[2].id,idempotencyKey:randomUUID(),items:[coffeeLine]})}));
 for(const response of await Promise.all(requests))assert.equal(response.status,201);
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM Smetka WHERE MasaID=? AND Plateno=0 AND Otkazana=0').get(tables[2].id).n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM MenuvaDirektorMasa WHERE MasaID=?').get(added.id).n,2);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM Narachka').get().n,7);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM Dodal').get().n,7);
 const historical=db.prepare('SELECT n.* FROM Narachka n JOIN Smetka s USING(SmetkaID) WHERE s.Plateno=1 AND n.ArticleID=?').all(coffee.id);assert(historical.every(n=>n.CenaPriNaracka===9000&&n.ImePriNaracka==='Еспресо'));
 assert.throws(()=>db.prepare('UPDATE Narachka SET BrojNaArtikli=9 WHERE NarachkaID=?').run(historical[0].NarachkaID));
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
 await stop();await start();const fresh=await login('kelner1');assert.equal((await req(fresh,'/api/tables')).tables.find(t=>t.id===table).totalMinor,18000);
 console.log('PASS PER: explicit relationships, selection without occupancy, two authors, multi-line totals, duplicate/race handling, atomic rollback, private dates, price history, receipt lifecycle, director M:N, concurrent waiters, FK integrity and restart.');
}finally{await stop();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
