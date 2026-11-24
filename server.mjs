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
    const upsertAccount = db.prepare(`INSERT INTO Lice(name,username,role,staff_code,salt,password_hash) VALUES(?,?,?,?,?,?)
      ON CONFLICT(username) DO UPDATE SET name=excluded.name,role=excluded.role,staff_code=excluded.staff_code,salt=excluded.salt,password_hash=excluded.password_hash,active=1`);
    for (const a of preparedAccounts) upsertAccount.run(a.name,a.username,a.role,a.staffCode,a.salt,a.hash);
    db.prepare('INSERT INTO schema_migrations(version) VALUES(3)').run();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
const sessions = new Map();
const streams = new Set();
const roleNames = { waiter:'Келнер', manager:'Менаџер', director:'Директор' };
const send = (res,status,data,headers={}) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}); res.end(JSON.stringify(data)); };
const fail = (res,status,error) => send(res,status,{error});
async function body(req,maxLength=100000) { let raw=''; for await (const part of req) { raw+=part; if(raw.length>maxLength) throw Object.assign(new Error('Барањето е преголемо.'),{status:413}); } try{return raw?JSON.parse(raw):{};}catch{throw Object.assign(new Error('Невалидни податоци.'),{status:400});} }
function cookie(req) { const x=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('taverna_session=')); return x?decodeURIComponent(x.slice(16)):''; }
function me(req) { const s=sessions.get(cookie(req)); if(!s||s.exp<Date.now()){sessions.delete(cookie(req));return null;} const u=db.prepare('SELECT id,name,username,role,staff_code,active FROM Lice WHERE id=?').get(s.uid); return u?.active?u:null; }
const pub = u => ({id:u.id,name:u.name,email:u.username,role:u.role,staffCode:u.staff_code});
function auth(res,u,roles=['waiter','manager','director']) { if(!u){fail(res,401,'Најавете се за да продолжите.');return false;} if(!roles.includes(u.role)){fail(res,403,'Немате дозвола за оваа функција.');return false;}return true; }
function changed(){ const packet=`event: refresh\ndata: ${Date.now()}\n\n`; for(const r of streams) r.write(packet); }
function tableData(waiterId){return db.prepare(`SELECT t.id,t.table_type AS type,t.table_number AS number,t.active,
 CASE WHEN EXISTS(SELECT 1 FROM Narachka o WHERE o.table_id=t.id AND o.status='active') THEN 'occupied' ELSE 'free' END AS status,
 EXISTS(SELECT 1 FROM Narachka mine WHERE mine.table_id=t.id AND mine.status='active' AND mine.waiter_id=?) AS isMine,
 COALESCE((SELECT SUM(total_minor) FROM Narachka o WHERE o.table_id=t.id AND o.status='active'),0) AS totalMinor
 FROM Masa t WHERE t.active=1 ORDER BY t.table_type,t.table_number`).all(waiterId).map(t=>({...t,isMine:Boolean(t.isMine),label:`${t.type}${t.number}`}));}
function tableOrders(id){ return db.prepare(`SELECT o.id,o.waiter_id AS waiterId,u.name AS waiter,o.created_at AS createdAt,o.total_minor AS totalMinor,
 json_group_array(json_object('id',i.id,'imageUrl',(SELECT CASE WHEN image_data IS NOT NULL THEN '/api/products/'||id||'/image?v='||image_version ELSE '' END FROM Artikl WHERE id=i.product_id),'lineNo',i.line_no,'code',i.product_code,'name',i.name_snapshot,'unitMinor',i.unit_price_minor,'quantity',i.quantity,'note',i.note,'addons',json(COALESCE((SELECT json_group_array(json_object('id',a.id,'code',a.product_code,'name',a.name_snapshot,'unitMinor',a.unit_price_minor,'quantity',a.quantity_per_unit)) FROM DodatokNaStavka a WHERE a.order_item_id=i.id),'[]')))) AS items
 FROM Narachka o JOIN Lice u ON u.id=o.waiter_id LEFT JOIN StavkaNaNarachka i ON i.order_id=o.id WHERE o.table_id=? AND o.status='active' GROUP BY o.id ORDER BY o.id`).all(id).map(o=>({...o,items:JSON.parse(o.items).filter(i=>i.id!==null)})); }
function tx(fn){db.exec('BEGIN IMMEDIATE');try{const x=fn();db.exec('COMMIT');return x;}catch(e){db.exec('ROLLBACK');throw e;}}
async function api(req,res,url){const p=url.pathname,m=req.method,u=me(req);
 if(['POST','PATCH','DELETE'].includes(m)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return fail(res,403,'Барањето е одбиено.');
 if(p==='/api/status'&&m==='GET')return send(res,200,{setupRequired:db.prepare('SELECT COUNT(*) n FROM Lice').get().n===0});
 if(p==='/api/setup'&&m==='POST'){if(db.prepare('SELECT COUNT(*) n FROM Lice').get().n) return fail(res,409,'Почетното поставување е завршено.');const b=await body(req),username=String(b.username||'').trim().toLowerCase(),name=String(b.name||b.username||'').trim(),password=String(b.password||'');if(!name||!username||!password)return fail(res,400,'Пополнете ги сите полиња.');const salt=randomBytes(16).toString('hex'),hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});const id=Number(db.prepare("INSERT INTO Lice(name,username,role,salt,password_hash) VALUES(?,?,'director',?,?)").run(name,username,salt,hash.toString('hex')).lastInsertRowid);const token=randomBytes(32).toString('base64url');sessions.set(token,{uid:id,exp:Date.now()+28800000});return send(res,201,{user:pub(db.prepare('SELECT * FROM Lice WHERE id=?').get(id))},{'Set-Cookie':`taverna_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});}
 if(p==='/api/login'&&m==='POST'){const b=await body(req),username=String(b.username||b.email||'').trim().toLowerCase(),password=String(b.password||''),account=db.prepare('SELECT * FROM Lice WHERE username=? AND active=1').get(username);if(!account)return fail(res,401,'Корисничкото име или лозинката не се точни.');const hash=await scrypt(password,account.salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});if(!timingSafeEqual(hash,Buffer.from(account.password_hash,'hex')))return fail(res,401,'Корисничкото име или лозинката не се точни.');const token=randomBytes(32).toString('base64url');sessions.set(token,{uid:account.id,exp:Date.now()+28800000});return send(res,200,{user:pub(account)},{'Set-Cookie':`taverna_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});}
 if(p==='/api/logout'&&m==='POST'){sessions.delete(cookie(req));return send(res,200,{ok:true},{'Set-Cookie':'taverna_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
 if(p==='/api/me'&&m==='GET'){if(!auth(res,u))return;return send(res,200,{user:pub(u)});}
 if(p==='/api/events'&&m==='GET'){if(!auth(res,u))return;res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('event: refresh\ndata: connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 if(p==='/api/tables'&&m==='GET'){if(!auth(res,u))return;return send(res,200,{tables:tableData(u.id)});}
 const one=p.match(/^\/api\/tables\/(\d+)$/);if(one&&m==='GET'){if(!auth(res,u))return;const id=+one[1],t=db.prepare('SELECT id,table_type AS type,table_number AS number FROM Masa WHERE id=? AND active=1').get(id);if(!t)return fail(res,404,'Масата не е пронајдена.');return send(res,200,{table:{...t,label:`${t.type}${t.number}`,orders:tableOrders(id)}});}
 const imageRoute=p.match(/^\/api\/products\/(\d+)\/image$/);
 if(imageRoute&&m==='GET'){
  if(!auth(res,u))return;
  const product=db.prepare('SELECT image_data FROM Artikl WHERE id=?').get(+imageRoute[1]);
  if(!product?.image_data)return fail(res,404,'Нема фотографија за артиклот.');
  const image=parseProductImage(product.image_data);
  res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes.length,'Cache-Control':'no-store'});
  return res.end(image.bytes);
 }
 if(imageRoute&&m==='PATCH'){
  if(!auth(res,u,['manager','director']))return;
  const id=+imageRoute[1];
  if(!db.prepare('SELECT id FROM Artikl WHERE id=?').get(id))return fail(res,404,'Артиклот не е пронајден.');
  const b=await body(req,1500000);
  if(b.imageData!==null){try{parseProductImage(b.imageData);}catch(e){return fail(res,400,e.message);}}
  db.prepare('UPDATE Artikl SET image_data=?,image_version=image_version+1 WHERE id=?').run(b.imageData,id);
  return send(res,200,{ok:true});
 }

 if(p==='/api/products'&&m==='GET'){if(!auth(res,u))return;const q=String(url.searchParams.get('q')||'').trim();const kind=url.searchParams.get('kind');const products=db.prepare('SELECT id,code,name,category,price_minor AS priceMinor,image_data IS NOT NULL AS hasCustomImage,image_version FROM Artikl WHERE active=1 ORDER BY code').all().filter(x=>(kind==='all'||(kind?x.category===kind:x.category!=='addon'))&&(!q||matchesProduct(x,q))).map(x=>{const {image_version,...p}=x;return {...p,hasCustomImage:Boolean(p.hasCustomImage),imageUrl:p.hasCustomImage?`/api/products/${p.id}/image?v=${image_version}`:defaultImage(p)};});return send(res,200,{products});}
 if(p==='/api/orders'&&m==='POST'){if(!auth(res,u,['waiter','manager']))return;const b=await body(req),tableId=Number(b.tableId),lines=Array.isArray(b.items)?b.items:[],key=String(b.idempotencyKey||'');if(!key||lines.length<1||lines.length>100)return fail(res,400,'Додајте барем еден артикл.');const prior=db.prepare('SELECT id FROM Narachka WHERE idempotency_key=?').get(key);if(prior)return send(res,200,{orderId:prior.id,tables:tableData(u.id),duplicate:true});try{const orderId=tx(()=>{if(!db.prepare('SELECT id FROM Masa WHERE id=? AND active=1').get(tableId))throw Object.assign(new Error('Масата не е пронајдена.'),{status:404});const order=Number(db.prepare("INSERT INTO Narachka(table_id,waiter_id,status,total_minor,idempotency_key) VALUES(?,?,'active',0,?)").run(tableId,u.id,key).lastInsertRowid);let total=0,lineNo=0;for(const line of lines){const product=db.prepare('SELECT * FROM Artikl WHERE id=? AND active=1 AND category IN (\'kitchen\',\'bar\')').get(Number(line.productId));const qty=Number(line.quantity);if(!product||!Number.isInteger(qty)||qty<1||qty>999)throw Object.assign(new Error('Артикл или количина не се валидни.'),{status:400});const addons=Array.isArray(line.addons)?line.addons:[];let unit=product.price_minor;const itemId=Number(db.prepare('INSERT INTO StavkaNaNarachka(order_id,line_no,product_id,product_code,name_snapshot,unit_price_minor,quantity,note) VALUES(?,?,?,?,?,?,?,?)').run(order,++lineNo,product.id,product.code,product.name,product.price_minor,qty,String(line.note||'').slice(0,160)).lastInsertRowid);for(const add of addons){const a=db.prepare("SELECT * FROM Artikl WHERE id=? AND category='addon' AND active=1").get(Number(add.productId)),aq=Number(add.quantity);if(!a||!Number.isInteger(aq)||aq<1||aq>999)throw Object.assign(new Error('Додаток или количина не се валидни.'),{status:400});db.prepare('INSERT INTO DodatokNaStavka(order_item_id,product_id,product_code,name_snapshot,unit_price_minor,quantity_per_unit) VALUES(?,?,?,?,?,?)').run(itemId,a.id,a.code,a.name,a.price_minor,aq);unit+=a.price_minor*aq;}total+=unit*qty;}db.prepare('UPDATE Narachka SET total_minor=? WHERE id=?').run(total,order);return order;});changed();return send(res,201,{orderId,tables:tableData(u.id)});}catch(e){if(e.status)return fail(res,e.status,e.message);throw e;}}
 const settle=p.match(/^\/api\/tables\/(\d+)\/pay$/);if(settle&&m==='POST'){if(!auth(res,u,['waiter','manager']))return;const id=+settle[1];try{const amount=tx(()=>{const orders=db.prepare("SELECT id,total_minor FROM Narachka WHERE table_id=? AND status='active'").all(id);const total=orders.reduce((s,o)=>s+o.total_minor,0);if(!orders.length||!total)throw Object.assign(new Error('Нема активна сметка за наплата.'),{status:400});db.prepare("UPDATE Narachka SET status='paid',paid_at=CURRENT_TIMESTAMP WHERE table_id=? AND status='active'").run(id);db.prepare('INSERT INTO Naplata(table_id,received_by,amount_minor) VALUES(?,?,?)').run(id,u.id,total);return total;});changed();return send(res,200,{paidMinor:amount,tables:tableData(u.id)});}catch(e){if(e.status)return fail(res,e.status,e.message);throw e;}}
 if(p==='/api/tables'&&m==='POST'){if(!auth(res,u,['manager','director']))return;const b=await body(req),type=String(b.type||''),number=Number(b.number);if(!['O','K','P'].includes(type)||!Number.isInteger(number)||number<1||number>99)return fail(res,400,'Типот мора да биде O, K или P, а бројот од 1 до 99.');try{db.prepare('INSERT INTO Masa(table_type,table_number) VALUES(?,?)').run(type,number);}catch{return fail(res,409,'Оваа маса веќе постои.');}changed();return send(res,201,{tables:tableData(u.id)});}
 if(p==='/api/overview'&&m==='GET'){if(!auth(res,u,['manager','director']))return;const sales=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(amount_minor),0) total FROM Naplata WHERE date(paid_at,'localtime')=date('now','localtime')").get();const open=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(total_minor),0) total FROM Narachka WHERE status='active'").get();return send(res,200,{salesToday:sales,open,totalStaff:db.prepare('SELECT COUNT(*) n FROM Lice WHERE active=1').get().n});}
 if(p==='/api/products'&&m==='POST'){if(!auth(res,u,['manager','director']))return;const b=await body(req),code=Number(b.code),name=String(b.name||'').trim(),category=String(b.category||''),price=Number(b.priceMinor);const range=category==='kitchen'?[800,899]:category==='bar'?[501,599]:category==='addon'?[200,299]:null;if(!range||!Number.isInteger(code)||code<range[0]||code>range[1]||!name||!Number.isSafeInteger(price)||price<0)return fail(res,400,'Проверете категорија, шифра, име и цена.');try{db.prepare('INSERT INTO Artikl(code,name,category,price_minor) VALUES(?,?,?,?)').run(code,name,category,price);}catch{return fail(res,409,'Шифрата веќе постои.');}return send(res,201,{ok:true});}
 const prod=p.match(/^\/api\/products\/(\d+)$/);if(prod&&m==='PATCH'){if(!auth(res,u,['manager','director']))return;const b=await body(req),id=+prod[1];if(b.active!==undefined)db.prepare('UPDATE Artikl SET active=? WHERE id=?').run(b.active?1:0,id);else{const name=String(b.name||'').trim(),price=Number(b.priceMinor);if(!name||!Number.isSafeInteger(price)||price<0)return fail(res,400,'Проверете име и цена.');db.prepare('UPDATE Artikl SET name=?,price_minor=? WHERE id=?').run(name,price,id);}return send(res,200,{ok:true});}
 if(p==='/api/users'&&m==='GET'){if(!auth(res,u,['director']))return;return send(res,200,{users:db.prepare('SELECT id,name,username AS email,role,staff_code AS staffCode,active FROM Lice ORDER BY role,name').all()});}
 if(p==='/api/users'&&m==='POST'){if(!auth(res,u,['director']))return;const b=await body(req),name=String(b.name||'').trim(),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||''),role=String(b.role||''),staffCode=String(b.staffCode||'').trim();if(!name||!username||!password||!['waiter','manager','director'].includes(role))return fail(res,400,'Пополнете ги полињата со валидни податоци.');if(role==='waiter'&&!/^0(?!00)[0-9]{2}$/.test(staffCode))return fail(res,400,'Шифрата на келнер мора да биде од 001 до 099.');const salt=randomBytes(16).toString('hex'),hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});try{db.prepare('INSERT INTO Lice(name,username,role,salt,password_hash,staff_code) VALUES(?,?,?,?,?,?)').run(name,username,role,salt,hash.toString('hex'),role==='waiter'?staffCode:null);}catch{return fail(res,409,'Корисничкото име или шифрата веќе постои.');}return send(res,201,{ok:true});}
 if(p==='/api/overview/recent'&&m==='GET'){if(!auth(res,u,['manager','director']))return;return send(res,200,{recent:db.prepare("SELECT p.amount_minor AS amountMinor,p.paid_at AS paidAt,u.name,t.table_type||t.table_number AS tableLabel FROM Naplata p JOIN Lice u ON u.id=p.received_by JOIN Masa t ON t.id=p.table_id ORDER BY p.id DESC LIMIT 30").all()});}
 return fail(res,404,'API маршрутата не е пронајдена.');}

const server=createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; form-action 'self'; frame-ancestors 'none'");const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{if(url.pathname.startsWith('/api/'))return await api(req,res,url);if(req.method!=='GET')return fail(res,405,'Методот не е дозволен.');const asset=/^\/assets\/products\/(espresso|burger|salad|chicken|fries|lemonade|water|juice|cheese|bacon|sauce|meal|drink|addon)\.svg$/.test(url.pathname);const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/product-utils.mjs':'product-utils.mjs'};if(asset)files[url.pathname]=url.pathname.slice(1);if(!files[url.pathname])return fail(res,404,'Страницата не е пронајдена.');res.writeHead(200,{'Content-Type':/\.m?js$/.test(url.pathname)?'text/javascript; charset=utf-8':asset?'image/svg+xml; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(join(root,files[url.pathname])));}catch(e){if(!res.headersSent)fail(res,e.status||500,e.status?e.message:'Настана внатрешна грешка.');else res.destroy();if(!e.status)console.error(e);}});
const port=Number(process.env.PORT||4175);server.listen(port,'0.0.0.0',()=>{console.log(`Taverna POS: http://localhost:${port}`);console.log(`SQLite: ${dbPath}`);for(const group of Object.values(networkInterfaces()))for(const a of group||[])if(a.family==='IPv4'&&!a.internal)console.log(`Telefon: http://${a.address}:${port}`);});
process.on('SIGINT',()=>{db.close();process.exit(0);});process.on('SIGTERM',()=>{db.close();process.exit(0);});
