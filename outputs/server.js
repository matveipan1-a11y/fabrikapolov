// HTTP-сервер FabrikaPolov: статика, приём заказов и доступ оператора.
// Нужен Node.js 18+; внешние пакеты не используются.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PORT = Number(process.env.PORT || 3000);

if (ADMIN_TOKEN.length < 24) {
  console.error('Укажите ADMIN_TOKEN длиной не менее 24 символов.');
  process.exit(1);
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('Некорректный PORT.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

// Порядок и цены совпадают с каталогом в script.js. Ценам из запроса не доверяем.
const PRICES = [8490, 7890, 8190, 7290, 2490, 2190, 2790, 1990,
  6990, 6490, 7490, 5990, 3290, 2890, 3690, 1290];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'styles-enhanced.css', 'liquid.css', 'script.js',
  'motion.js', 'manifest.json', 'service-worker.js', 'admin.html', 'admin.js']);
let writeQueue = Promise.resolve();

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 32_000) {
        reject(new Error('Заказ слишком большой'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Некорректный JSON')); }
    });
    req.on('error', reject);
  });
}

function validateOrder(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Некорректный заказ');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (name.length < 2 || name.length > 100) throw new Error('Укажите имя');
  if (!/^[+\d\s()\-]{10,30}$/.test(phone) || phone.replace(/\D/g, '').length < 10)
    throw new Error('Укажите корректный телефон');
  if (address.length < 5 || address.length > 250) throw new Error('Укажите адрес доставки');
  if (comment.length > 500) throw new Error('Комментарий слишком длинный');
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > PRICES.length)
    throw new Error('Корзина пуста или содержит слишком много товаров');

  const seen = new Set();
  let subtotal = 0;
  const items = input.items.map(raw => {
    const id = raw && Number(raw.id);
    const qty = raw && Number(raw.qty);
    if (!Number.isInteger(id) || id < 1 || id > PRICES.length ||
        !Number.isInteger(qty) || qty < 1 || qty > 999 || seen.has(id))
      throw new Error('Некорректный состав корзины');
    seen.add(id);
    const price = PRICES[id - 1];
    subtotal += price * qty;
    return { id, qty, price };
  });
  const promo = typeof input.promo === 'string' ? input.promo.trim().toUpperCase() : '';
  if (promo && promo !== 'POL10') throw new Error('Промокод недействителен');
  const discount = promo === 'POL10' ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal - discount;
  // Сумму клиента сверяем, если она передана; окончательная сумма всегда серверная.
  if (input.total !== undefined && (typeof input.total !== 'number' || input.total !== total))
    throw new Error('Сумма заказа не совпадает с ценами каталога');
  return { name, phone, address, comment, items, promo, subtotal, discount, total };
}

async function loadOrders() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(ORDERS_FILE, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Файл заказов повреждён');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function saveOrder(order) {
  const operation = writeQueue.then(async () => {
    const orders = await loadOrders();
    orders.push(order);
    const temp = ORDERS_FILE + '.tmp';
    await fs.promises.writeFile(temp, JSON.stringify(orders, null, 2), { mode: 0o600 });
    await fs.promises.rename(temp, ORDERS_FILE);
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

async function serveStatic(req, res, pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'; }
  catch { return json(res, 400, { error: 'Некорректный путь' }); }
  relative = relative.replace(/\\/g, '/');
  const allowed = PUBLIC_FILES.has(relative) || /^(icons|fonts|vendor)\/[a-zA-Z0-9_./-]+$/.test(relative);
  if (!allowed || relative.split('/').includes('..') || relative.split('/').some(part => part.startsWith('.')))
    return json(res, 404, { error: 'Файл не найден' });
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep)) return json(res, 404, { error: 'Файл не найден' });
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return json(res, 404, { error: 'Файл не найден' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': relative === 'service-worker.js' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch { json(res, 404, { error: 'Файл не найден' }); }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/health' && req.method === 'GET')
    return json(res, 200, { ok: true });
  if (pathname === '/api/config' && req.method === 'GET')
    return json(res, 200, { phone: process.env.CONTACT_PHONE || '', email: process.env.CONTACT_EMAIL || '' });
  if (pathname === '/api/orders' && req.method === 'GET') {
    if (req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`)
      return json(res, 401, { error: 'Доступ запрещён' });
    try { return json(res, 200, { orders: (await loadOrders()).reverse() }); }
    catch { return json(res, 500, { error: 'Не удалось прочитать заказы' }); }
  }
  if (pathname === '/api/orders' && req.method === 'POST') {
    if (!req.headers['content-type']?.startsWith('application/json'))
      return json(res, 415, { error: 'Требуется application/json' });
    try {
      const input = await readJson(req);
      const details = validateOrder(input);
      const order = { number: String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0'),
        date: new Date().toISOString(), ...details };
      await saveOrder(order);
      return json(res, 201, { accepted: true, number: order.number, date: order.date, total: order.total });
    } catch (error) {
      const status = /EACCES|ENOSPC|повреждён/.test(error.message) ? 500 : 400;
      return json(res, status, { error: status === 500 ? 'Не удалось сохранить заказ' : error.message });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return json(res, 405, { error: 'Метод не поддерживается' });
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => console.log(`FabrikaPolov: http://localhost:${PORT}`));
