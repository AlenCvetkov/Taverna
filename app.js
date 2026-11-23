const menu = [
  { name: 'Капричиоза', price: 320 },
  { name: 'Шопска салата', price: 180 },
  { name: 'Домашна лимонада', price: 120 },
  { name: 'Еспресо', price: 90 },
];
const roleNames = { waiter: 'Келнер', manager: 'Менаџер', director: 'Директор' };
const navItems = {
  waiter: [['◫', 'Маси и нарачки'], ['◷', 'Моја смена']],
  manager: [['◫', 'Преглед'], ['♧', 'Маси и нарачки'], ['☷', 'Активности']],
  director: [['▦', 'Контролна табла'], ['♧', 'Маси и нарачки'], ['♙', 'Корисници']],
};
let currentUser = null;
let tables = [];
let selectedTable = null;
let filter = 'Сите';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (amount) => `${new Intl.NumberFormat('mk-MK').format(Number(amount) || 0)} ден`;
const roleName = (role) => roleNames[role] || role;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login' && path !== '/api/setup') renderLogin();
    throw new Error(result.error || 'Барањето не успеа.');
  }
  return result;
}

function authShell(title, subtitle, form) {
  document.querySelector('#app').classList.add('hidden');
  const auth = document.querySelector('#auth');
  auth.classList.remove('hidden');
  auth.innerHTML = `<section class="auth-brand"><div class="brand-lockup"><span class="brand-icon">✳</span><span>Таверна</span></div><div class="auth-copy"><div class="eyebrow">Систем за угостителски објект</div><h1>Услугата започнува со добар ред.</h1><p>Маси, нарачки и преглед на работењето, на едно место.</p></div><div class="auth-note">Локална апликација · Податоците се чуваат на овој компјутер</div></section><section class="auth-form-wrap"><div class="auth-card"><h2>${title}</h2><p class="sub">${subtitle}</p>${form}<div class="auth-security">Секоја сметка има сопствена email адреса и улога. Системот ги проверува дозволите при секое барање.</div></div></section>`;
}

function renderSetup() {
  authShell('Постави ја сметката на директор', 'Ова е првото поставување. Создади ја главната сметка; потоа од неа ќе ги додаваш келнерите и менаџерите.', `<form id="setup-form"><div class="field"><label for="setup-name">Име и презиме</label><input id="setup-name" name="name" autocomplete="name" required minlength="2" maxlength="80" placeholder="На пример, Александар Николов"></div><div class="field"><label for="setup-email">Gmail или email</label><input id="setup-email" name="email" type="text" autocomplete="email" required placeholder="ime@gmail.com"><div class="hint">Vnesi ja adresata so koja sakash da se najavuvash.</div></div><div class="field"><label for="setup-password">Лозинка</label><input id="setup-password" name="password" type="password" autocomplete="new-password" required placeholder="Избери лозинка"></div><button class="primary auth-submit" type="submit">Создај директорска сметка</button><div class="auth-error" id="auth-error" role="alert"></div></form>`);
  document.querySelector('#setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/api/setup', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password') }) });
      await enterApp(result.user);
    } catch (error) { setAuthError(error.message); }
  });
}

function renderLogin() {
  currentUser = null;
  document.querySelector('#app').classList.add('hidden');
  api('/api/status').then((status) => {
    if (status.setupRequired) return renderSetup();
    authShell('Добредојде назад', 'Најави се со личната сметка за да продолжиш.', `<form id="login-form"><div class="field"><label for="login-email">Gmail или email</label><input id="login-email" name="email" type="text" autocomplete="email" required autofocus></div><div class="field"><label for="login-password">Лозинка</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div><button class="primary auth-submit" type="submit">Најави се</button><div class="auth-error" id="auth-error" role="alert"></div></form>`);
    document.querySelector('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      try {
        const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
        await enterApp(result.user);
      } catch (error) { setAuthError(error.message); button.disabled = false; }
    });
  }).catch(() => authShell('Системот не е достапен', 'Провери дали апликацијата работи на компјутерот и обиди се повторно.', '<button class="primary auth-submit" onclick="location.reload()">Обиди се повторно</button>'));
}

function setAuthError(message) {
  const target = document.querySelector('#auth-error');
  if (target) target.textContent = message;
}

async function enterApp(user) {
  currentUser = user;
  document.querySelector('#auth').classList.add('hidden');
  document.querySelector('#app').classList.remove('hidden');
  document.querySelector('#staff').textContent = user.name;
  document.querySelector('#staffrole').textContent = `${roleName(user.role)} · Најавен`;
  document.querySelector('#avatar').textContent = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toLocaleUpperCase('mk-MK');
  document.querySelector('#mobile-role').textContent = roleName(user.role);
  document.querySelector('#account-menu-name').textContent = user.name;
  document.querySelector('#account-menu-email').textContent = user.email || '';
  closeAccountMenu();
  renderNav();
  await loadTables();
  if (user.role === 'waiter') renderTables();
  else await renderDashboard(user.role === 'director' ? 'Контролна табла' : 'Преглед');
}

async function logout() {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch { /* Local session will expire if the server is offline. */ }
  renderLogin();
}

function closeAccountMenu() {
  const menu = document.querySelector('#account-menu');
  const button = document.querySelector('#account-menu-button');
  if (!menu || !button) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
}

document.querySelector('#account-menu-button').addEventListener('click', (event) => {
  event.stopPropagation();
  const button = event.currentTarget;
  const menu = document.querySelector('#account-menu');
  menu.hidden = !menu.hidden;
  button.setAttribute('aria-expanded', String(!menu.hidden));
});
document.querySelector('#menu-logout').addEventListener('click', logout);
document.addEventListener('click', (event) => {
  if (!event.target.closest('.account-menu-wrap')) closeAccountMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAccountMenu();
});

function renderNav(activeLabel) {
  const items = navItems[currentUser.role];
  const nav = document.querySelector('#nav');
  nav.innerHTML = items.map(([icon, label]) => `<button class="${label === activeLabel ? 'active' : ''}" data-label="${esc(label)}"><b>${icon}</b><span class="txt">${esc(label)}</span></button>`).join('');
  nav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.label)));
}

async function navigate(label) {
  renderNav(label);
  document.querySelector('#crumb').textContent = label;
  if (label === 'Маси и нарачки' || label === 'Моја смена') { await loadTables(); renderTables(); }
  else if (label === 'Корисници') await renderUsers();
  else if (label === 'Активности') await renderDashboard('Активности');
  else await renderDashboard(label);
}

async function loadTables() {
  const result = await api('/api/tables');
  tables = result.tables;
  if (!tables.some((table) => table.id === selectedTable)) selectedTable = tables[0]?.id || null;
}

function tableHeading(title, subtitle) {
  return `<div class="heading"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="date">Ресторан „Таверна“ · Главна сала</div></div>`;
}

function renderTables() {
  document.querySelector('#crumb').textContent = 'Маси и нарачки';
  const title = currentUser.role === 'waiter' ? `Здраво, ${currentUser.name.split(' ')[0]} 👋` : 'Маси и нарачки';
  const occupied = tables.filter((table) => table.status !== 'Слободна').length;
  const openSum = tables.reduce((sum, table) => sum + table.items.reduce((subtotal, item) => subtotal + item.price * item.qty, 0), 0);
  const visibleTables = tables.filter((table) => filter === 'Сите' || (filter === 'Слободни' ? table.status === 'Слободна' : table.status !== 'Слободна'));
  document.querySelector('#content').innerHTML = `${tableHeading(title, 'Избери маса за да отвориш или продолжиш сметка.')}
    <div class="stats"><div class="stat"><small>Маси вкупно</small><strong>${tables.length}</strong><em>главна сала</em></div><div class="stat"><small>Слободни</small><strong>${tables.length - occupied}</strong><em>подготвени за гости</em></div><div class="stat"><small>Активни сметки</small><strong>${occupied}</strong><em>во тек</em></div><div class="stat"><small>Отворени сметки</small><strong>${money(openSum)}</strong><em>тековна смена</em></div></div>
    <div class="workspace"><section class="panel tables-panel"><div class="panelhead"><div><h2>Распоред на маси</h2><p>${tables.length} маси · статусот се зачувува на компјутерот</p></div><div class="filters">${['Сите','Слободни','Заземени'].map((value) => `<button class="${filter === value ? 'active' : ''}" data-filter="${value}">${value}</button>`).join('')}</div></div><div class="legend"><span>Слободна</span><span>Заземена</span><span>Нарачано</span></div><div class="grid">${visibleTables.map((table) => `<button class="table ${table.status === 'Заземена' ? 'occupied' : table.status === 'Нарачано' ? 'ordered' : ''} ${selectedTable === table.id ? 'selected' : ''}" data-table="${table.id}"><b>Маса ${String(table.id).padStart(2, '0')}</b><small>◉ ${table.status === 'Слободна' ? `${table.seats} места` : `${table.guests} гости`}</small><span class="state">${esc(table.status)}</span>${table.items.length ? `<div class="amount">${money(table.items.reduce((sum, item) => sum + item.price * item.qty, 0))}</div>` : ''}</button>`).join('')}</div></section>${renderOrder() ?? ''}</div>`;
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { filter = button.dataset.filter; renderTables(); }));
  document.querySelectorAll('[data-table]').forEach((button) => button.addEventListener('click', () => { selectedTable = Number(button.dataset.table); renderTables(); }));
  bindOrderActions();
}

function renderOrder() {
  const table = tables.find((item) => item.id === selectedTable);
  if (!table) return '<section class="panel order"><div class="orderhead"><h2>Нарачка</h2><small>Изберете маса</small></div><div class="empty">Изберете маса од распоредот</div></section>';
  const total = table.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return `<section class="panel order"><div class="orderhead"><h2>Маса ${String(table.id).padStart(2, '0')}</h2><small>${table.status === 'Слободна' ? `${table.seats} места · нова сметка` : `${table.guests} гости · ${esc(table.status)}`}</small></div><div class="orderbody">${table.items.length ? table.items.map((item) => `<div class="lineitem"><div class="qty"><b>${item.qty}×</b><span>${esc(item.name)}</span></div><strong>${money(item.price * item.qty)}</strong></div>`).join('') : '<div class="empty">Нема додадени артикли</div>'}</div><div class="quick"><h3>ДОДАЈ АРТИКЛ</h3><div class="products">${menu.map((item) => `<button class="product" data-product="${esc(item.name)}"><b>${esc(item.name)}　＋</b><span>${money(item.price)}</span></button>`).join('')}</div></div><div class="orderfoot"><div class="total"><span>Вкупно</span><strong>${money(total)}</strong></div><button class="primary" data-action="send" ${table.items.length ? '' : 'disabled'}>Испрати во кујна</button><button class="secondary" data-action="close" ${table.items.length ? '' : 'disabled'}>Наплати сметка</button></div></section>`;
}

function bindOrderActions() {
  document.querySelectorAll('[data-product]').forEach((button) => button.addEventListener('click', async () => {
    try { await api(`/api/tables/${selectedTable}/items`, { method: 'POST', body: JSON.stringify({ name: button.dataset.product }) }); await refreshTables(); }
    catch (error) { notify(error.message); }
  }));
  document.querySelector('[data-action="send"]')?.addEventListener('click', async () => {
    try { await api(`/api/tables/${selectedTable}/send`, { method: 'POST', body: '{}' }); await refreshTables(); notify('Нарачката е означена како испратена.'); }
    catch (error) { notify(error.message); }
  });
  document.querySelector('[data-action="close"]')?.addEventListener('click', async () => {
    if (!confirm('Да ја затворам и наплатам оваа сметка?')) return;
    try { await api(`/api/tables/${selectedTable}/close`, { method: 'POST', body: '{}' }); await refreshTables(); notify('Сметката е затворена и зачувана.'); }
    catch (error) { notify(error.message); }
  });
}

async function refreshTables() { await loadTables(); renderTables(); }

function statsMarkup(items) {
  return `<div class="stats">${items.map(([label, value, note]) => `<div class="stat"><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>`).join('')}</div>`;
}

async function renderDashboard(label) {
  const report = await api('/api/overview');
  const isDirector = currentUser.role === 'director';
  const monthly = isDirector;
  const figures = monthly ? report.month : report.today;
  const stats = [
    [monthly ? 'Продажба овој месец' : 'Продажба денес', money(figures.total), `${figures.count} затворени сметки`],
    ['Активни сметки', String(report.activeTables), 'отворени маси сега'],
    ['Просечна сметка', money(figures.average), monthly ? 'овој месец' : 'денес'],
    ['Активни корисници', String(report.staff), 'сметки во системот'],
  ];
  let body = '';
  if (label === 'Активности') {
    body = `<section class="panel"><div class="panelhead"><div><h2>Последни затворени сметки</h2><p>Евиденција од базата на податоци</p></div><span class="badge">Зачувано</span></div><div class="tabledata-wrap"><table class="tabledata"><thead><tr><th>Вработен</th><th>Маса</th><th>Вкупно</th><th>Време</th></tr></thead><tbody>${recentRows(report.recent)}</tbody></table></div></section>`;
  } else {
    const workerRows = (monthly ? report.perWaiterMonth : report.perWaiter).map((item) => [item.name, money(item.total), item.total]).sort((a, b) => b[2] - a[2]);
    const max = Math.max(1, ...workerRows.map((row) => row[2]));
    body = `<div class="reportgrid"><section class="panel"><div class="panelhead"><div><h2>Продажба по келнер</h2><p>${monthly ? 'Сметки затворени овој месец' : 'Сметки затворени денес'}</p></div><span class="badge">Од база</span></div><div class="rows">${workerRows.length ? workerRows.map((row) => `<div class="barrow"><span>${esc(row[0])}</span><div class="bar"><i style="width:${Math.max(3, row[2] / max * 100)}%"></i></div><b>${esc(row[1])}</b></div>`).join('') : '<div class="empty">Сè уште нема затворени сметки.</div>'}</div></section><section class="panel"><div class="panelhead"><div><h2>Последни сметки</h2><p>Вистински записи од системот</p></div></div><div class="tabledata-wrap"><table class="tabledata"><thead><tr><th>Келнер</th><th>Маса</th><th>Износ</th></tr></thead><tbody>${recentRows(report.recent, true)}</tbody></table></div></section></div>`;
  }
  document.querySelector('#content').innerHTML = `${tableHeading(label === 'Преглед' ? 'Преглед на објектот' : label, isDirector ? 'Извештајот се пресметува од зачуваните сметки.' : 'Тековна состојба на ресторанот.')}${statsMarkup(stats)}${body}`;
}

function recentRows(rows, short = false) {
  if (!rows.length) return `<tr><td colspan="${short ? 3 : 4}">Нема затворени сметки.</td></tr>`;
  return rows.map((row) => `<tr><td>${esc(row.name)}</td><td>Маса ${String(row.table_id).padStart(2, '0')}</td><td>${money(row.total)}</td>${short ? '' : `<td>${new Date(`${row.closed_at.replace(' ', 'T')}Z`).toLocaleString('mk-MK')}</td>`}</tr>`).join('');
}

async function renderUsers() {
  const result = await api('/api/users');
  const rows = result.users.map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td><span class="badge">${esc(roleName(user.role))}</span></td><td>${user.active ? '<span class="badge">Активен</span>' : '<span class="badge" style="background:#f3eeee;color:#9b5550">Исклучен</span>'}</td><td>${user.id === currentUser.id ? '<span class="hint">Ти</span>' : `<button class="action-link" data-toggle-user="${user.id}" data-active="${user.active ? '0' : '1'}">${user.active ? 'Исклучи' : 'Активирај'}</button>`}</td></tr>`).join('');
  document.querySelector('#content').innerHTML = `${tableHeading('Кориснички сметки', 'Креирај посебна најава за секој вработен и додели му улога.')}<section class="panel"><div class="panelhead"><div><h2>Додај вработен</h2><p>Email адресата е единствена; лозинката се чува hash-ирана.</p></div></div><form id="user-form" class="data-form"><div class="field"><label for="new-name">Име и презиме</label><input id="new-name" name="name" required minlength="2" maxlength="80"></div><div class="field"><label for="new-email">Gmail или email</label><input id="new-email" name="email" type="text" autocomplete="email" required></div><div class="field"><label for="new-role">Улога</label><select id="new-role" name="role"><option value="waiter">Келнер</option><option value="manager">Менаџер</option><option value="director">Директор</option></select></div><div class="field"><label for="new-password">Привремена лозинка</label><input id="new-password" name="password" type="password" required autocomplete="new-password"></div><button class="primary" type="submit">Креирај сметка</button></form><div class="hint" style="padding:0 18px 12px">Email-от не го проверуваме според формат. Лозинката нема минимум должина.</div><div class="auth-error" id="user-error" style="padding:0 18px"></div></section><section class="panel" style="margin-top:15px"><div class="panelhead"><div><h2>Тим</h2><p>Вклучени и исклучени сметки</p></div></div><div class="tabledata-wrap"><table class="tabledata"><thead><tr><th>Име</th><th>Email</th><th>Улога</th><th>Статус</th><th>Акција</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  document.querySelector('#user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = document.querySelector('#user-error');
    error.textContent = '';
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), role: form.get('role'), password: form.get('password') }) });
      notify('Корисничката сметка е креирана.');
      await renderUsers();
    } catch (exception) { error.textContent = exception.message; }
  });
  document.querySelectorAll('[data-toggle-user]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/users/${button.dataset.toggleUser}/active`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active === '1' }) });
      await renderUsers();
    } catch (error) { notify(error.message); }
  }));
}

function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

async function start() {
  try {
    const { setupRequired } = await api('/api/status');
    if (setupRequired) return renderSetup();
    try {
      const result = await api('/api/me');
      return await enterApp(result.user);
    } catch { return renderLogin(); }
  } catch { renderLogin(); }
}

start();
