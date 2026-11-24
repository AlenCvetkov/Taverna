import assert from 'node:assert/strict';
import { searchKey, matchesProduct } from './product-utils.mjs';
for(const text of ['espreso','espresso','ЕСПРЕСО','еspreso'])assert(matchesProduct({code:501,name:'Еспресо'},text));
assert(matchesProduct({code:800,name:'Шопска салата'},'shopska'));
assert(matchesProduct({code:200,name:'Кашкавал'},'kaskaval'));
assert(matchesProduct({code:801,name:'Таверна бургер'},'801'));
assert(!matchesProduct({code:501,name:'Еспресо'},'voda'));
assert.equal(searchKey('Ѓ ќ љ њ џ'),'gj kj lj nj dz');
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';

const path = `data/check-${randomUUID()}.sqlite`;
const pass = randomUUID();
const env = { ...process.env, PORT: '4199', SQLITE_PATH: path };
for (const name of ['KELNER1','KELNER2','MENADZER','DIREKTOR']) env[`SEED_${name}_PASSWORD`] = pass;
async function start() {
  const child = spawn(process.execPath, ['server.mjs'], { env, stdio: ['ignore','pipe','pipe'] });
  let errors = '';
  child.stderr.on('data', d => errors += d);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(errors || 'Startup timed out')), 15000);
    child.stdout.on('data', d => { if (String(d).includes('Taverna POS:')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(Error(`Server exited ${code}: ${errors}`)); });
  });
  return child;
}
let child, cookie = '';
async function api(path, method='GET', data) {
  const r = await fetch('http://127.0.0.1:4199'+path, { method, headers: { 'Content-Type':'application/json', cookie }, body: data ? JSON.stringify(data) : undefined });
  const b = await r.json();
  assert(r.ok, JSON.stringify(b));
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  return b;
}
async function stop() { if (child) { const exited = new Promise(r => child.once('exit', r)); child.kill(); await exited; child = null; } }
try {
  child = await start();
  await api('/api/login','POST',{username:'kelner1',password:pass});
  const tables = (await api('/api/tables')).tables;
  assert.equal(tables.length,5);
  assert(tables.every(t=>t.isMine===false));
  const products = (await api('/api/products?kind=all')).products;
  for(const query of ['espreso','espresso','еспресо','ЕСПРЕСО','espr','501']){
   const found=(await api('/api/products?q='+encodeURIComponent(query))).products;
   assert(found.some(p=>p.code===501),'Missing espresso result: '+query);
  }
  for(const p of products){const r=await fetch('http://127.0.0.1:4199'+p.imageUrl);assert.equal(r.status,200);assert(r.headers.get('content-type').includes('image/svg+xml'));}
  const forbidden=await fetch('http://127.0.0.1:4199/api/products/1/image',{method:'PATCH',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({imageData:null})});assert.equal(forbidden.status,403);
  const burger = products.find(x=>x.code===801), cheese = products.find(x=>x.code===200);
  const order = {tableId:tables[0].id,idempotencyKey:randomUUID(),items:[{productId:burger.id,quantity:2,note:'bez kromid',addons:[{productId:cheese.id,quantity:1}]}]};
  await api('/api/orders','POST',order);
  assert.equal((await api('/api/orders','POST',order)).duplicate,true);
  const saved = (await api('/api/tables/'+tables[0].id)).table.orders;
  assert.equal(saved.length,1);
  assert.equal(saved[0].totalMinor,82000);
  assert.equal(saved[0].waiterId,1);
  assert.equal((await api('/api/tables')).tables[0].isMine,true);
  await api('/api/login','POST',{username:'kelner2',password:pass});
  assert((await api('/api/tables')).tables.every(t=>!t.isMine));
  await api('/api/orders','POST',{...order,tableId:tables[1].id,idempotencyKey:randomUUID()});
  assert.equal((await api('/api/tables')).tables[1].isMine,true);
  await api('/api/orders','POST',{...order,idempotencyKey:randomUUID()});
  assert.equal((await api('/api/tables')).tables[0].isMine,true);
  await api('/api/login','POST',{username:'kelner1',password:pass});
  const mine = (await api('/api/tables')).tables;
  assert.equal(mine[0].isMine,true);
  assert.equal(mine[1].isMine,false);
  await api('/api/tables/'+tables[0].id+'/pay','POST',{});
  assert.equal((await api('/api/tables')).tables[0].isMine,false);
  assert.equal((await api('/api/tables')).tables[0].status,'free');
  await api('/api/login','POST',{username:'direktor',password:pass});
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  await api('/api/products/'+burger.id+'/image','PATCH',{imageData:photo});
  const pictured=(await api('/api/products')).products.find(p=>p.id===burger.id);assert(pictured.hasCustomImage);assert(pictured.imageUrl.startsWith('/api/products/'));
  const photoResponse=await fetch('http://127.0.0.1:4199'+pictured.imageUrl,{headers:{cookie}});assert.equal(photoResponse.status,200);assert.equal(photoResponse.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await photoResponse.arrayBuffer()).toString('base64'),photo.split(',')[1]);
  const invalid=await fetch('http://127.0.0.1:4199/api/products/'+burger.id+'/image',{method:'PATCH',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({imageData:'data:image/svg+xml;base64,PHN2Zz4='})});assert.equal(invalid.status,400);
  await api('/api/products','POST',{code:899,name:'Check',category:'kitchen',priceMinor:12300});
  await api('/api/users','POST',{name:'Check',username:'check',role:'waiter',staffCode:'099',password:pass});
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON');
  assert(db.prepare('SELECT id FROM Kujna WHERE code=899').get());
  for (const code of ['000','100','1','00a']) assert.throws(()=>db.prepare("INSERT INTO Lice(name,username,role,salt,password_hash,staff_code) VALUES('check',?,'waiter','salt','hash',?)").run('check'+code,code));
  assert.throws(()=>db.prepare("INSERT INTO Artikl(code,name,category,price_minor) VALUES(799,'bad','kitchen',100)").run());
  assert.throws(()=>db.prepare("INSERT INTO Masa(table_type,table_number) VALUES('O',100)").run());
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Narachka').get().n,3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Naplata').get().n,1);
  db.close();
  await stop();
  child = await start();
  await api('/api/login','POST',{username:'kelner1',password:pass});
  assert.equal((await api('/api/tables')).tables[0].status,'free');
  assert((await api('/api/products')).products.find(p=>p.id===burger.id).hasCustomImage);
  await api('/api/login','POST',{username:'direktor',password:pass});
  await api('/api/products/'+burger.id+'/image','PATCH',{imageData:null});
  const restored=(await api('/api/products')).products.find(p=>p.id===burger.id);assert.equal(restored.hasCustomImage,false);assert(restored.imageUrl.startsWith('/assets/'));
  console.log('PASS: fresh migrations, login, subtype sync, code limits, order with addon, total, duplicate prevention, payment, restart, personal table ownership, shared tables and payment clearing ownership, Latin/Cyrillic search, all default illustrations, photo permissions, upload, invalid format, restart persistence and photo removal.');
} finally {
  await stop();
  for (const suffix of ['', '-wal', '-shm']) rmSync(path+suffix,{force:true});
}
