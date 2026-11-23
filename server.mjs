import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const scrypt = promisify(scryptCallback);
const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'taverna.sqlite'), { timeout: 5000 });
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('waiter','manager','director')),
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dining_tables (
    id INTEGER PRIMARY KEY,
    seats INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Слободна',
    guests INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    table_id INTEGER NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0)
  );
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    table_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    total INTEGER NOT NULL,
    items_json TEXT NOT NULL,
    closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
if (db.prepare('SELECT COUNT(*) AS count FROM dining_tables').get().count === 0) {
  const insert = db.prepare('INSERT INTO dining_tables(id,seats) VALUES(?,?)');
  for (let id = 1; id <= 12; id++) insert.run(id, id <= 4 ? 2 : id <= 8 ? 4 : 6);
}

const port = Number(process.env.PORT || 4173);
const sessions = new Map();
const loginFailures = new Map();
const menu = [
  { name: 'Капричиоза', price: 320 },
  { name: 'Шопска салата', price: 180 },
  { name: 'Домашна лимонада', price: 120 },
  { name: 'Еспресо', price: 90 },
];
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.username, role: user.role });
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const json = (response, status, value, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
};
const bad = (response, status, error) => json(response, status, { error });

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 65536) throw Object.assign(new Error('Барањето е преголемо.'), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error('Невалидни податоци.'), { status: 400 }); }
}

function cookieValue(request, name) {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}

function currentUser(request) {
  const token = cookieValue(request, 'taverna_session');
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  const user = db.prepare('SELECT id,name,username,role,active FROM users WHERE id=?').get(session.userId);
  if (!user?.active) { sessions.delete(token); return null; }
  return user;
}

function requireRole(user, roles, response) {
  if (!user) { bad(response, 401, 'Најавете се за да продолжите.'); return false; }
  if (!roles.includes(user.role)) { bad(response, 403, 'Немате дозвола за оваа функција.'); return false; }
  return true;
}

function setSessionCookie(response, token, request) {
  const secure = Boolean(request.socket.encrypted);
  response.setHeader('Set-Cookie', `taverna_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? '; Secure' : ''}`);
}

function tableSnapshot() {
  return db.prepare(`SELECT t.id,t.seats,t.status,t.guests,
    COALESCE((SELECT json_group_array(json_object('name',i.name,'price',i.price,'qty',i.quantity)) FROM order_items i WHERE i.table_id=t.id),'[]') AS items
    FROM dining_tables t ORDER BY t.id`).all().map((table) => ({ ...table, items: JSON.parse(table.items) }));
}

function overview() {
  const today = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total,
    COALESCE(AVG(total),0) AS average FROM sales WHERE date(closed_at,'localtime')=date('now','localtime')`).get();
  const month = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total,
    COALESCE(AVG(total),0) AS average FROM sales WHERE strftime('%Y-%m',closed_at,'localtime')=strftime('%Y-%m','now','localtime')`).get();
  const activeTables = db.prepare("SELECT COUNT(*) AS count FROM dining_tables WHERE status!='Слободна'").get().count;
  const staff = db.prepare('SELECT COUNT(*) AS count FROM users WHERE active=1').get().count;
  const perWaiter = db.prepare(`SELECT u.name,COALESCE(SUM(s.total),0) AS total FROM users u LEFT JOIN sales s
    ON s.user_id=u.id AND date(s.closed_at,'localtime')=date('now','localtime') WHERE u.active=1 AND u.role='waiter'
    GROUP BY u.id ORDER BY total DESC`).all();
  const perWaiterMonth = db.prepare(`SELECT u.name,COALESCE(SUM(s.total),0) AS total FROM users u LEFT JOIN sales s
    ON s.user_id=u.id AND strftime('%Y-%m',s.closed_at,'localtime')=strftime('%Y-%m','now','localtime')
    WHERE u.active=1 AND u.role='waiter' GROUP BY u.id ORDER BY total DESC`).all();
  const recent = db.prepare(`SELECT u.name,s.table_id,s.total,s.closed_at FROM sales s JOIN users u ON u.id=s.user_id
    ORDER BY s.id DESC LIMIT 8`).all();
  return { today, month, activeTables, staff, perWaiter, perWaiterMonth, recent };
}

async function handleApi(request, response, url) {
  const path = url.pathname;
  const method = request.method || 'GET';
  const user = currentUser(request);
  if (['POST', 'PATCH', 'DELETE'].includes(method)) {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host) return bad(response, 403, 'Барањето е одбиено.');
  }

  if (path === '/api/status' && method === 'GET') {
    return json(response, 200, { setupRequired: db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0 });
  }

  if (path === '/api/setup' && method === 'POST') {
    if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count !== 0) return bad(response, 409, 'Почетното поставување е веќе завршено.');
    const body = await readBody(request);
    const name = String(body.name || '').trim();
    const email = normalizeEmail(body.email ?? body.username);
    const password = String(body.password || '');
    if (name.length < 2 || name.length > 80) return bad(response, 400, 'Внесете име од најмалку 2 знака.');
    if (!email) return bad(response, 400, 'Внесете Gmail или email адреса.');
    if (!password) return bad(response, 400, 'Внесете лозинка.');
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count !== 0) return bad(response, 409, 'Почетното поставување е веќе завршено.');
    const result = db.prepare('INSERT INTO users(name,username,role,salt,password_hash) VALUES(?,? ,\'director\',?,?)').run(name, email, salt, hash.toString('hex'));
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { userId: Number(result.lastInsertRowid), expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    setSessionCookie(response, token, request);
    return json(response, 201, { user: publicUser(db.prepare('SELECT id,name,username,role FROM users WHERE id=?').get(result.lastInsertRowid)) });
  }

  if (path === '/api/login' && method === 'POST') {
    const ip = request.socket.remoteAddress || 'unknown';
    const attempts = loginFailures.get(ip) || { count: 0, since: Date.now() };
    if (Date.now() - attempts.since > 10 * 60 * 1000) { attempts.count = 0; attempts.since = Date.now(); }
    if (attempts.count >= 8) return bad(response, 429, 'Премногу обиди. Почекајте 10 минути.');
    const body = await readBody(request);
    const email = normalizeEmail(body.email ?? body.username);
    const password = String(body.password || '');
    const account = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(email);
    const candidate = await scrypt(password, account?.salt || '00000000000000000000000000000000', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const valid = account && timingSafeEqual(candidate, Buffer.from(account.password_hash, 'hex'));
    if (!valid) { attempts.count++; loginFailures.set(ip, attempts); return bad(response, 401, 'Корисничкото име или лозинката не се точни.'); }
    loginFailures.delete(ip);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { userId: account.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    setSessionCookie(response, token, request);
    return json(response, 200, { user: publicUser(account) });
  }

  if (path === '/api/logout' && method === 'POST') {
    sessions.delete(cookieValue(request, 'taverna_session'));
    return json(response, 200, { ok: true }, { 'Set-Cookie': 'taverna_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (path === '/api/me' && method === 'GET') {
    if (!user) return bad(response, 401, 'Не сте најавени.');
    return json(response, 200, { user: publicUser(user) });
  }

  if (path === '/api/tables' && method === 'GET') {
    if (!requireRole(user, ['waiter', 'manager', 'director'], response)) return;
    return json(response, 200, { tables: tableSnapshot() });
  }

  const itemMatch = path.match(/^\/api\/tables\/(\d+)\/items$/);
  if (itemMatch && method === 'POST') {
    if (!requireRole(user, ['waiter', 'manager'], response)) return;
    const tableId = Number(itemMatch[1]);
    const body = await readBody(request);
    const product = menu.find((item) => item.name === body.name);
    const table = db.prepare('SELECT * FROM dining_tables WHERE id=?').get(tableId);
    if (!table || !product) return bad(response, 404, 'Масата или артиклот не се пронајдени.');
    const qty = Math.max(1, Math.min(20, Number.parseInt(body.qty, 10) || 1));
    const existing = db.prepare('SELECT id,quantity FROM order_items WHERE table_id=? AND name=?').get(tableId, product.name);
    if (existing) db.prepare('UPDATE order_items SET quantity=? WHERE id=?').run(existing.quantity + qty, existing.id);
    else db.prepare('INSERT INTO order_items(table_id,name,price,quantity) VALUES(?,?,?,?)').run(tableId, product.name, product.price, qty);
    if (table.status === 'Слободна') db.prepare("UPDATE dining_tables SET status='Заземена',guests=? WHERE id=?").run(Math.min(2, table.seats), tableId);
    return json(response, 200, { tables: tableSnapshot() });
  }

  const tableAction = path.match(/^\/api\/tables\/(\d+)\/(send|close)$/);
  if (tableAction && method === 'POST') {
    if (!requireRole(user, ['waiter', 'manager'], response)) return;
    const tableId = Number(tableAction[1]);
    const action = tableAction[2];
    const table = db.prepare('SELECT * FROM dining_tables WHERE id=?').get(tableId);
    if (!table) return bad(response, 404, 'Масата не е пронајдена.');
    if (action === 'send') {
      db.prepare("UPDATE dining_tables SET status='Нарачано' WHERE id=?").run(tableId);
    } else {
      const items = db.prepare('SELECT name,price,quantity AS qty FROM order_items WHERE table_id=?').all(tableId);
      if (!items.length) return bad(response, 400, 'Нема артикли за наплата.');
      const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO sales(table_id,user_id,total,items_json) VALUES(?,?,?,?)').run(tableId, user.id, total, JSON.stringify(items));
        db.prepare('DELETE FROM order_items WHERE table_id=?').run(tableId);
        db.prepare("UPDATE dining_tables SET status='Слободна',guests=0 WHERE id=?").run(tableId);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    return json(response, 200, { tables: tableSnapshot() });
  }

  if (path === '/api/overview' && method === 'GET') {
    if (!requireRole(user, ['manager', 'director'], response)) return;
    return json(response, 200, overview());
  }

  if (path === '/api/users' && method === 'GET') {
    if (!requireRole(user, ['director'], response)) return;
    const users = db.prepare('SELECT id,name,username AS email,role,active,created_at AS createdAt FROM users ORDER BY active DESC,name').all();
    return json(response, 200, { users });
  }

  if (path === '/api/users' && method === 'POST') {
    if (!requireRole(user, ['director'], response)) return;
    const body = await readBody(request);
    const name = String(body.name || '').trim();
    const email = normalizeEmail(body.email ?? body.username);
    const password = String(body.password || '');
    const role = String(body.role || '');
    if (name.length < 2 || name.length > 80) return bad(response, 400, 'Внесете име од најмалку 2 знака.');
    if (!email) return bad(response, 400, 'Внесете Gmail или email адреса.');
    if (!password) return bad(response, 400, 'Внесете лозинка.');
    if (!['waiter','manager','director'].includes(role)) return bad(response, 400, 'Изберете валидна улога.');
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    try {
      db.prepare('INSERT INTO users(name,username,role,salt,password_hash) VALUES(?,?,?,?,?)').run(name, email, role, salt, hash.toString('hex'));
    } catch { return bad(response, 409, 'Ова корисничко име веќе постои.'); }
    return json(response, 201, { users: db.prepare('SELECT id,name,username AS email,role,active,created_at AS createdAt FROM users ORDER BY active DESC,name').all() });
  }

  const userMatch = path.match(/^\/api\/users\/(\d+)\/active$/);
  if (userMatch && method === 'PATCH') {
    if (!requireRole(user, ['director'], response)) return;
    const id = Number(userMatch[1]);
    if (id === user.id) return bad(response, 400, 'Не може да ја исклучите сопствената сметка.');
    const body = await readBody(request);
    const active = body.active ? 1 : 0;
    const target = db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id);
    if (!target) return bad(response, 404, 'Корисникот не е пронајден.');
    if (!active && target.role === 'director' && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='director' AND active=1").get().count <= 1) return bad(response, 400, 'Мора да има најмалку еден активен директор.');
    db.prepare('UPDATE users SET active=? WHERE id=?').run(active, id);
    return json(response, 200, { users: db.prepare('SELECT id,name,username AS email,role,active,created_at AS createdAt FROM users ORDER BY active DESC,name').all() });
  }

  return bad(response, 404, 'API маршрутата не е пронајдена.');
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET') return bad(response, 405, 'Методот не е дозволен.');
    const files = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js' };
    const filename = files[url.pathname];
    if (!filename) return bad(response, 404, 'Страницата не е пронајдена.');
    const body = await readFile(join(root, filename));
    response.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    if (!response.headersSent) bad(response, error.status || 500, error.status ? error.message : 'Настана внатрешна грешка.');
    else response.destroy();
    if (!error.status) console.error(error);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Taverna POS: http://localhost:${port}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) console.log(`Telefon na istata Wi-Fi mreza: http://${address.address}:${port}`);
  }
});

process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
