import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { migrateNamedSchema, migrateProductImages } from './database-schema.mjs';
import { matchesProduct, defaultImage } from './product-utils.mjs';
import { parseProductImage } from './product-images.mjs';
import { migratePerSchema } from './database-per.mjs';
import { tableData, tableOrders, selectTable, createOrder, payTable, transaction, billHistory, overview, recentPayments } from './restaurant-store.mjs';

const scrypt = promisify(scryptCb);
const root = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.SQLITE_PATH || join(root, 'data', 'taverna.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath, { timeout: 5000 });
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
if (!db.prepare('SELECT version FROM schema_migrations WHERE version=4').get()) {
// Legacy first release used these two tables. Keep existing users and migrate the old floor/order data safely.
const legacy = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
const oldTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dining_tables'").get();
if (oldTables && !db.prepare('PRAGMA table_info(dining_tables)').all().some(c => c.name === 'table_type')) {
  for (const name of ['dining_tables','order_items','sales']) {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)) {
      const renamed = `${name}_legacy`;
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(renamed)) db.exec(`ALTER TABLE ${name} RENAME TO ${renamed}`);
    }
  }
}
if (legacy) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('staff_code')) db.exec('ALTER TABLE users ADD COLUMN staff_code TEXT');
  for (const user of db.prepare('SELECT id,role,staff_code FROM users').all()) {
    if (!user.staff_code) db.prepare('UPDATE users SET staff_code=? WHERE id=?').run(user.role === 'waiter' ? String(user.id).padStart(3, '0') : null, user.id);
  }
}
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
if (!db.prepare('SELECT version FROM schema_migrations WHERE version=1').get()) {
  db.exec(readFileSync(join(root, 'migrations', '001_initial_schema.sql'), 'utf8'));
  db.prepare('INSERT INTO schema_migrations(version) VALUES(1)').run();
}
if (!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) {
  db.exec(readFileSync(join(root, 'migrations', '002_add_order_indexes.sql'), 'utf8'));
  db.prepare('INSERT INTO schema_migrations(version) VALUES(2)').run();
}

if (db.prepare('SELECT COUNT(*) AS n FROM dining_tables').get().n === 0) {
  const ins = db.prepare('INSERT INTO dining_tables(table_type,table_number) VALUES(?,?)');
  for (const [type, n] of [['O',1],['O',2],['K',1],['K',2],['P',1]]) ins.run(type,n);
}
if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
  const seed = db.prepare('INSERT INTO products(code,name,category,price_minor) VALUES(?,?,?,?)');
  for (const row of [
    [800,'Шопска салата','kitchen',18000],[801,'Таверна бургер','kitchen',35000],[802,'Пилешка скара','kitchen',32000],[803,'Помфрит','kitchen',14000],
    [501,'Еспресо','bar',9000],[502,'Домашна лимонада','bar',12000],[503,'Минерална вода','bar',8000],[504,'Сок од јаболко','bar',11000],
    [200,'Кашкавал','addon',6000],[201,'Сланина','addon',8000],[202,'Дополнителен сос','addon',3000],
  ]) seed.run(...row);
}
}
migrateNamedSchema(db, root);
migrateProductImages(db, root);

// Demo-account passwords come only from the untracked .env file, never from source control.
const demoAccounts = [
  ['Kelner 1','kelner1','waiter','001','SEED_KELNER1_PASSWORD'],
  ['Kelner 2','kelner2','waiter','002','SEED_KELNER2_PASSWORD'],
  ['Menadzer','menadzer','manager',null,'SEED_MENADZER_PASSWORD'],
  ['Direktor','direktor','director',null,'SEED_DIREKTOR_PASSWORD'],
];
const configuredPasswords = demoAccounts.map(([, , , , passwordEnv]) => process.env[passwordEnv] || '');
if (configuredPasswords.every(Boolean) && !db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()) {
  const preparedAccounts = [];
  for (let i=0;i<demoAccounts.length;i++) {
    const [name,username,role,staffCode] = demoAccounts[i];
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(configuredPasswords[i],salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
    preparedAccounts.push({name,username,role,staffCode,salt,hash:hash.toString('hex')});
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const per=Boolean(db.prepare('SELECT 1 FROM schema_migrations WHERE version=6').get());
    const upsertAccount = db.prepare(per ? `INSERT INTO Lice(Ime,KorisnickoIme,Pozicija,Sifra,Sol,LozinkaHash) VALUES(?,?,?,?,?,?)
      ON CONFLICT(KorisnickoIme) DO UPDATE SET Ime=excluded.Ime,Pozicija=excluded.Pozicija,Sifra=excluded.Sifra,Sol=excluded.Sol,LozinkaHash=excluded.LozinkaHash,Aktiven=1` : `INSERT INTO Lice(name,username,role,staff_code,salt,password_hash) VALUES(?,?,?,?,?,?)
      ON CONFLICT(username) DO UPDATE SET name=excluded.name,role=excluded.role,staff_code=excluded.staff_code,salt=excluded.salt,password_hash=excluded.password_hash,active=1`);
    for (const a of preparedAccounts) upsertAccount.run(a.name,a.username,a.role,a.staffCode,a.salt,a.hash);
    db.prepare('INSERT INTO schema_migrations(version) VALUES(3)').run();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
await migratePerSchema(db,root,dbPath);

const sessions=new Map(),streams=new Set();
const userColumns='LiceID AS id,Ime AS name,KorisnickoIme AS username,Pozicija AS role,Sifra AS staff_code,Aktiven AS active,Sol AS salt,LozinkaHash AS password_hash';
const publicUser=u=>({id:u.id,name:u.name,email:u.username,role:u.role,staffCode:u.staff_code});
const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
const fail=(res,status,error)=>send(res,status,{error});
async function body(req,maxLength=100000){let raw='';for await(const part of req){raw+=part;if(raw.length>maxLength)throw Object.assign(new Error('Барањето е преголемо.'),{status:413});}try{return raw?JSON.parse(raw):{};}catch{throw Object.assign(new Error('Невалидни податоци.'),{status:400});}}
function cookie(req){const value=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('taverna_session='));return value?decodeURIComponent(value.slice(16)):'';}
function me(req){const session=sessions.get(cookie(req));if(!session||session.exp<Date.now()){sessions.delete(cookie(req));return null;}const u=db.prepare('SELECT '+userColumns+' FROM Lice WHERE LiceID=?').get(session.uid);return u?.active?u:null;}
function auth(res,u,roles=['waiter','manager','director']){if(!u){fail(res,401,'Најавете се за да продолжите.');return false;}if(!roles.includes(u.role)){fail(res,403,'Немате дозвола за оваа функција.');return false;}return true;}
function changed(){for(const response of streams)response.write(`event: refresh\ndata: ${Date.now()}\n\n`);}
function login(res,u,status=200){const token=randomBytes(32).toString('base64url');sessions.set(token,{uid:u.id,exp:Date.now()+28800000});return send(res,status,{user:publicUser(u)},{'Set-Cookie':`taverna_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});}
async function hashPassword(password){const salt=randomBytes(16).toString('hex'),hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return {salt,hash:hash.toString('hex')};}
async function api(req,res,url){
 const p=url.pathname,m=req.method,u=me(req);
 if(['POST','PATCH','DELETE'].includes(m)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return fail(res,403,'Барањето е одбиено.');
 if(p==='/api/status'&&m==='GET')return send(res,200,{setupRequired:db.prepare('SELECT COUNT(*) n FROM Lice').get().n===0});
 if(p==='/api/setup'&&m==='POST'){
  if(db.prepare('SELECT COUNT(*) n FROM Lice').get().n)return fail(res,409,'Почетното поставување е завршено.');
  const b=await body(req),username=String(b.username||'').trim().toLowerCase(),name=String(b.name||b.username||'').trim(),password=String(b.password||'');
  if(!name||!username||!password)return fail(res,400,'Пополнете ги сите полиња.');
  const {salt,hash}=await hashPassword(password);
  // Check again after asynchronous hashing, then insert atomically.
  const id=transaction(db,()=>{if(db.prepare('SELECT COUNT(*) n FROM Lice').get().n)throw Object.assign(new Error('Почетното поставување е завршено.'),{status:409});return Number(db.prepare("INSERT INTO Lice(Ime,KorisnickoIme,Pozicija,Sol,LozinkaHash) VALUES(?,?,'director',?,?)").run(name,username,salt,hash).lastInsertRowid);});
  return login(res,db.prepare('SELECT '+userColumns+' FROM Lice WHERE LiceID=?').get(id),201);
 }
 if(p==='/api/login'&&m==='POST'){
  const b=await body(req),username=String(b.username||b.email||'').trim().toLowerCase(),password=String(b.password||'');
  const account=db.prepare('SELECT '+userColumns+' FROM Lice WHERE KorisnickoIme=? AND Aktiven=1').get(username);
  if(!account)return fail(res,401,'Корисничкото име или лозинката не се точни.');
  const hash=await scrypt(password,account.salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}),expected=Buffer.from(account.password_hash,'hex');
  if(expected.length!==hash.length||!timingSafeEqual(hash,expected))return fail(res,401,'Корисничкото име или лозинката не се точни.');
  return login(res,account);
 }
 if(p==='/api/logout'&&m==='POST'){sessions.delete(cookie(req));return send(res,200,{ok:true},{'Set-Cookie':'taverna_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
 if(!auth(res,u))return;
 if(p==='/api/me'&&m==='GET')return send(res,200,{user:publicUser(u)});
 if(p==='/api/events'&&m==='GET'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('event: refresh\ndata: connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;
 }
 if(p==='/api/tables'&&m==='GET')return send(res,200,{tables:tableData(db,u.id)});
 const tableRoute=p.match(/^\/api\/tables\/(\d+)$/);
 if(tableRoute&&m==='GET'){
  const id=+tableRoute[1],t=db.prepare('SELECT MasaID AS id,Tip AS type,Broj AS number FROM Masa WHERE MasaID=? AND Aktivna=1').get(id);
  if(!t)return fail(res,404,'Масата не е пронајдена.');
  return send(res,200,{table:{...t,label:`${t.type}${t.number}`,orders:tableOrders(db,id,u)}});
 }
 const select=p.match(/^\/api\/tables\/(\d+)\/select$/);
 if(select&&m==='POST'){selectTable(db,+select[1],u);return send(res,200,{ok:true});}
 const imageRoute=p.match(/^\/api\/products\/(\d+)\/image$/);
 if(imageRoute&&m==='GET'){
  const product=db.prepare('SELECT Slika FROM Article WHERE ArticleID=?').get(+imageRoute[1]);
  if(!product?.Slika)return fail(res,404,'Нема фотографија за артиклот.');
  const image=parseProductImage(product.Slika);res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes.length,'Cache-Control':'no-store'});return res.end(image.bytes);
 }
 if(imageRoute&&m==='PATCH'){
  if(!auth(res,u,['manager','director']))return;
  const id=+imageRoute[1];if(!db.prepare('SELECT 1 FROM Article WHERE ArticleID=?').get(id))return fail(res,404,'Артиклот не е пронајден.');
  const b=await body(req,1500000);if(b.imageData!==null){try{parseProductImage(b.imageData);}catch(e){return fail(res,400,e.message);}}
  db.prepare('UPDATE Article SET Slika=?,SlikaVerzija=SlikaVerzija+1 WHERE ArticleID=?').run(b.imageData,id);changed();return send(res,200,{ok:true});
 }
 if(p==='/api/products'&&m==='GET'){
  const q=String(url.searchParams.get('q')||'').trim(),kind=url.searchParams.get('kind');
  const products=db.prepare('SELECT ArticleID AS id,Sifra AS code,Ime AS name,Kategorija AS category,Cena AS priceMinor,Slika IS NOT NULL AS hasCustomImage,SlikaVerzija FROM Article WHERE Aktiven=1 ORDER BY Sifra').all()
   .filter(x=>(kind==='all'||(kind?x.category===kind:x.category!=='addon'))&&(!q||matchesProduct(x,q)))
   .map(({SlikaVerzija,...a})=>({...a,hasCustomImage:Boolean(a.hasCustomImage),imageUrl:a.hasCustomImage?`/api/products/${a.id}/image?v=${SlikaVerzija}`:defaultImage(a)}));
  return send(res,200,{products});
 }
 if(p==='/api/orders'&&m==='POST'){
  if(!auth(res,u,['waiter']))return;
  const result=createOrder(db,u,await body(req));if(!result.duplicate)changed();return send(res,result.duplicate?200:201,{...result,tables:tableData(db,u.id)});
 }
 const settle=p.match(/^\/api\/tables\/(\d+)\/pay$/);
 if(settle&&m==='POST'){
  if(!auth(res,u,['waiter','manager']))return;
  const result=payTable(db,+settle[1],u);changed();return send(res,200,{...result,tables:tableData(db,u.id)});
 }
 if(p==='/api/tables'&&m==='POST'){
  if(!auth(res,u,['manager','director']))return;
  const b=await body(req),type=String(b.type||''),number=Number(b.number);
  if(!['O','K','P'].includes(type)||!Number.isInteger(number)||number<1||number>99)return fail(res,400,'Типот мора да биде O, K или P, а бројот од 1 до 99.');
  try{transaction(db,()=>{const id=Number(db.prepare('INSERT INTO Masa(Tip,Broj) VALUES(?,?)').run(type,number).lastInsertRowid);if(u.role==='director')db.prepare('INSERT INTO MenuvaDirektorMasa VALUES(?,?)').run(u.id,id);});}catch(e){if(e.code==='ERR_SQLITE_ERROR')return fail(res,409,'Оваа маса веќе постои.');throw e;}
  changed();return send(res,201,{tables:tableData(db,u.id)});
 }
 if(tableRoute&&m==='PATCH'){
  if(!auth(res,u,['director']))return;
  const id=+tableRoute[1],b=await body(req),type=String(b.type||''),number=Number(b.number);
  if(!['O','K','P'].includes(type)||!Number.isInteger(number)||number<1||number>99)return fail(res,400,'Проверете тип и број на масата.');
  if(!db.prepare('SELECT 1 FROM Masa WHERE MasaID=?').get(id))return fail(res,404,'Масата не е пронајдена.');
  try{transaction(db,()=>{db.prepare('UPDATE Masa SET Tip=?,Broj=? WHERE MasaID=?').run(type,number,id);db.prepare('INSERT OR IGNORE INTO MenuvaDirektorMasa VALUES(?,?)').run(u.id,id);});}catch{return fail(res,409,'Оваа ознака на маса веќе постои.');}
  changed();return send(res,200,{tables:tableData(db,u.id)});
 }
 if(p==='/api/overview'&&m==='GET'){if(!auth(res,u,['manager','director']))return;return send(res,200,overview(db));}
 if(p==='/api/overview/recent'&&m==='GET'){if(!auth(res,u,['manager','director']))return;return send(res,200,{recent:recentPayments(db)});}
 if(p==='/api/bills'&&m==='GET'){if(!auth(res,u,['manager','director']))return;return send(res,200,{bills:billHistory(db)});}
 if(p==='/api/products'&&m==='POST'){
  if(!auth(res,u,['manager','director']))return;
  const b=await body(req),code=Number(b.code),name=String(b.name||'').trim(),category=String(b.category||''),price=Number(b.priceMinor);
  const range=category==='kitchen'?[800,899]:category==='bar'?[501,599]:category==='addon'?[200,299]:null;
  if(!range||!Number.isInteger(code)||code<range[0]||code>range[1]||!name||!Number.isSafeInteger(price)||price<0)return fail(res,400,'Проверете категорија, шифра, име и цена.');
  try{db.prepare('INSERT INTO Article(Sifra,Ime,Kategorija,Cena) VALUES(?,?,?,?)').run(code,name,category,price);}catch{return fail(res,409,'Шифрата веќе постои.');}changed();return send(res,201,{ok:true});
 }
 const prod=p.match(/^\/api\/products\/(\d+)$/);
 if(prod&&m==='PATCH'){
  if(!auth(res,u,['manager','director']))return;
  const b=await body(req),id=+prod[1];
  if(b.active!==undefined)db.prepare('UPDATE Article SET Aktiven=? WHERE ArticleID=?').run(b.active?1:0,id);
  else{const name=String(b.name||'').trim(),price=Number(b.priceMinor);if(!name||!Number.isSafeInteger(price)||price<0)return fail(res,400,'Проверете име и цена.');db.prepare('UPDATE Article SET Ime=?,Cena=? WHERE ArticleID=?').run(name,price,id);}
  changed();return send(res,200,{ok:true});
 }
 if(p==='/api/users'&&m==='GET'){if(!auth(res,u,['director']))return;return send(res,200,{users:db.prepare('SELECT '+userColumns+' FROM Lice ORDER BY Pozicija,Ime').all().map(publicUser)});}
 if(p==='/api/users'&&m==='POST'){
  if(!auth(res,u,['director']))return;
  const b=await body(req),name=String(b.name||'').trim(),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||''),role=String(b.role||''),staffCode=String(b.staffCode||'').trim();
  if(!name||!username||!password||!['waiter','manager','director'].includes(role))return fail(res,400,'Пополнете ги полињата со валидни податоци.');
  if(role==='waiter'&&!/^0(?!00)[0-9]{2}$/.test(staffCode))return fail(res,400,'Шифрата на келнер мора да биде од 001 до 099.');
  const {salt,hash}=await hashPassword(password);
  try{db.prepare('INSERT INTO Lice(Ime,KorisnickoIme,Pozicija,Sol,LozinkaHash,Sifra) VALUES(?,?,?,?,?,?)').run(name,username,role,salt,hash,role==='waiter'?staffCode:null);}catch{return fail(res,409,'Корисничкото име или шифрата веќе постои.');}
  return send(res,201,{ok:true});
 }
 return fail(res,404,'API маршрутата не е пронајдена.');
}
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; form-action 'self'; frame-ancestors 'none'");
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 try{
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  if(req.method!=='GET')return fail(res,405,'Методот не е дозволен.');
  const asset=/^\/assets\/products\/(espresso|burger|salad|chicken|fries|lemonade|water|juice|cheese|bacon|sauce|meal|drink|addon)\.svg$/.test(url.pathname);
  const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/product-utils.mjs':'product-utils.mjs'};
  if(asset)files[url.pathname]=url.pathname.slice(1);
  if(!files[url.pathname])return fail(res,404,'Страницата не е пронајдена.');
  res.writeHead(200,{'Content-Type':/\.m?js$/.test(url.pathname)?'text/javascript; charset=utf-8':asset?'image/svg+xml; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(await readFile(join(root,files[url.pathname])));
 }catch(e){if(!res.headersSent)fail(res,e.status||500,e.status?e.message:'Настана внатрешна грешка.');else res.destroy();if(!e.status)console.error(e);}
});
const port=Number(process.env.PORT||4175);
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Портата ${port} е зафатена. Запрете го претходниот сервер со Ctrl+C.`:e);db.close();process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>{const actual=server.address().port;console.log(`Taverna POS: http://localhost:${actual}`);console.log(`SQLite: ${dbPath}`);for(const group of Object.values(networkInterfaces()))for(const a of group||[])if(a.family==='IPv4'&&!a.internal)console.log(`Telefon: http://${a.address}:${actual}`);});
process.on('SIGINT',()=>{db.close();process.exit(0);});process.on('SIGTERM',()=>{db.close();process.exit(0);});
