const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const SERVER_DIR = __dirname;
const LOGS_DIR = path.join(SERVER_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'chat.log');
const DATA_FILE = path.join(SERVER_DIR, 'messages.json');

// Ensure directories exist
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ─── In-memory user registry ─────────────────────────────────────────────────
// Maps username (lowercase) → { name, ip, lastSeen }
const activeUsers = new Map();

// ─── Profanity filter ─────────────────────────────────────────────────────────
const BANNED_WORDS = [
  // Palavra de demonstração para aula
  'catapimbas',
  // Baixo calão PT-BR
  'porra', 'merda', 'caralho', 'foda', 'fodase', 'foda-se',
  'viado', 'puta', 'putaria', 'buceta', 'cuzão', 'cuzao',
  'filhodaputa', 'filho da puta', 'arrombado', 'piranha', 'vagabunda',
  'vagabundo', 'desgraçado', 'desgraçada', 'babaca', 'corno', 'prostituta',
  'cacete', 'xoxota', 'bosta', 'otário', 'otaria', 'punheta', 'broxa',
  'imbecil', 'sacanagem', 'rola',
];

function censorText(text) {
  let result = text;
  for (const word of BANNED_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    result = result.replace(regex, (match) => '*'.repeat(match.length));
  }
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readMessages() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading messages file:', err);
  }
  return [];
}

function writeMessages(messages) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing messages file:', err);
  }
}

function appendLog(ip, name, text) {
  const timestamp = new Date().toISOString();
  const formattedIp = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
  const logLine = `[${timestamp}] IP: ${formattedIp} | User: ${name} | Message: ${text}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    console.log(logLine.trim());
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

function normalizeUsername(name) {
  return name.trim().toLowerCase();
}

function getClientIp(req) {
  const raw = (
    req.headers['x-forwarded-for'] ||
    req.socket.remoteAddress ||
    (req.connection && req.connection.remoteAddress) ||
    '127.0.0.1'
  ).toString().split(',')[0].trim();
  return raw.startsWith('::ffff:') ? raw.substring(7) : raw;
}

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── GET /messages ──────────────────────────────────────────────────────────
  if (req.url === '/messages' && req.method === 'GET') {
    const messages = readMessages();
    jsonResponse(res, 200, messages);
    return;
  }

  // ── POST /messages ─────────────────────────────────────────────────────────
  if (req.url === '/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.name || !payload.text) {
          jsonResponse(res, 400, { error: 'Name and text are required' });
          return;
        }

        const ip = getClientIp(req);
        const key = normalizeUsername(payload.name);

        // Verifica colisão de username
        if (activeUsers.has(key) && activeUsers.get(key).ip !== ip) {
          jsonResponse(res, 409, {
            error: `O nome "${payload.name}" já está sendo usado por outro usuário. Escolha um apelido diferente.`
          });
          return;
        }

        // Registra/atualiza usuário
        activeUsers.set(key, { name: payload.name, ip, lastSeen: Date.now() });

        // Censura e loga (loga o texto original para auditoria)
        appendLog(ip, payload.name, payload.text);
        const censoredText = censorText(payload.text);

        const messages = readMessages();
        const newMessage = {
          id: String(Date.now() + Math.random()),
          name: payload.name,
          text: censoredText,
          timestamp: new Date().toISOString(),
          ip
        };
        messages.push(newMessage);
        writeMessages(messages);

        jsonResponse(res, 201, newMessage);
      } catch (err) {
        jsonResponse(res, 500, { error: 'Failed to process request: ' + err.message });
      }
    });
    return;
  }

  // ── POST /join ─────────────────────────────────────────────────────────────
  // Chamado quando o usuário entra no chat para reservar o username
  if (req.url === '/join' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.name) {
          jsonResponse(res, 400, { error: 'Name is required' });
          return;
        }

        const ip = getClientIp(req);
        const key = normalizeUsername(payload.name);

        if (activeUsers.has(key) && activeUsers.get(key).ip !== ip) {
          jsonResponse(res, 409, {
            error: `O nome "${payload.name}" já está em uso. Escolha um apelido diferente.`
          });
          return;
        }

        activeUsers.set(key, { name: payload.name, ip, lastSeen: Date.now() });
        console.log(`[JOIN] ${payload.name} (${ip}) entrou. Usuários ativos: ${activeUsers.size}`);
        jsonResponse(res, 200, { ok: true, message: `Bem-vinde, ${payload.name}!` });
      } catch (err) {
        jsonResponse(res, 500, { error: 'Failed to process request: ' + err.message });
      }
    });
    return;
  }

  // ── POST /leave ────────────────────────────────────────────────────────────
  // Chamado quando o usuário sai do chat para liberar o username
  if (req.url === '/leave' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload.name) {
          activeUsers.delete(normalizeUsername(payload.name));
          console.log(`[LEAVE] ${payload.name} saiu. Usuários ativos: ${activeUsers.size}`);
        }
        jsonResponse(res, 200, { ok: true });
      } catch (err) {
        jsonResponse(res, 500, { error: 'Failed to process request: ' + err.message });
      }
    });
    return;
  }

  // ── GET /users ─────────────────────────────────────────────────────────────
  if (req.url === '/users' && req.method === 'GET') {
    const users = Array.from(activeUsers.values()).map(u => ({
      name: u.name,
      lastSeen: u.lastSeen
    }));
    jsonResponse(res, 200, users);
    return;
  }

  // ── GET /api-docs ───────────────────────────────────────────────────────────
  if (req.url === '/api-docs' && req.method === 'GET') {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Girly Chat 2000 — API Docs</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --card: #21253a;
      --border: #2e3450;
      --accent: #7c6af7;
      --accent2: #a78bfa;
      --green: #34d399;
      --red: #f87171;
      --yellow: #fbbf24;
      --blue: #60a5fa;
      --pink: #f472b6;
      --text: #e2e8f0;
      --muted: #64748b;
      --code: #1e2235;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 0 0 60px;
    }
    header {
      background: linear-gradient(135deg, #1a1d27 0%, #21253a 100%);
      border-bottom: 1px solid var(--border);
      padding: 28px 32px 20px;
      position: sticky; top: 0; z-index: 10;
      backdrop-filter: blur(8px);
    }
    header h1 {
      font-size: 22px; font-weight: 800;
      background: linear-gradient(90deg, var(--accent2), var(--pink));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }
    header p { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
    }
    .badge-get    { background: rgba(96,165,250,0.15); color: var(--blue); border: 1px solid rgba(96,165,250,0.3); }
    .badge-post   { background: rgba(52,211,153,0.15); color: var(--green); border: 1px solid rgba(52,211,153,0.3); }
    .badge-delete { background: rgba(248,113,113,0.15); color: var(--red); border: 1px solid rgba(248,113,113,0.3); }
    .container { max-width: 860px; margin: 32px auto; padding: 0 24px; display: flex; flex-direction: column; gap: 20px; }
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 16px; overflow: hidden;
    }
    .card-header {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px; cursor: pointer;
      border-bottom: 1px solid transparent;
      transition: background 0.15s;
    }
    .card-header:hover { background: rgba(255,255,255,0.03); }
    .card-header.open { border-bottom-color: var(--border); }
    .endpoint-path {
      font-family: 'Cascadia Code', 'Fira Code', monospace;
      font-size: 15px; font-weight: 600; flex: 1;
    }
    .card-desc { color: var(--muted); font-size: 12px; margin-left: auto; padding-right: 8px; }
    .chevron { color: var(--muted); font-size: 12px; transition: transform 0.2s; }
    .chevron.open { transform: rotate(180deg); }
    .card-body { padding: 20px; display: none; flex-direction: column; gap: 16px; }
    .card-body.open { display: flex; }
    label { font-size: 12px; font-weight: 600; color: var(--muted); display: block; margin-bottom: 6px; }
    textarea, input[type=text] {
      width: 100%; background: var(--code); border: 1px solid var(--border);
      border-radius: 8px; color: var(--text); font-family: 'Cascadia Code','Fira Code',monospace;
      font-size: 13px; padding: 10px 12px; resize: vertical; outline: none;
      transition: border-color 0.15s;
    }
    textarea:focus, input[type=text]:focus { border-color: var(--accent); }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 18px; border-radius: 8px; border: none;
      font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s, transform 0.1s;
    }
    .btn:hover { opacity: 0.88; }
    .btn:active { transform: scale(0.97); }
    .btn-primary { background: var(--accent); color: white; }
    .btn-danger  { background: var(--red); color: white; }
    .response-box {
      background: var(--code); border: 1px solid var(--border); border-radius: 8px;
      padding: 12px; font-family: 'Cascadia Code','Fira Code',monospace; font-size: 12px;
      min-height: 48px; max-height: 300px; overflow-y: auto; white-space: pre-wrap;
      word-break: break-all; display: none;
    }
    .response-box.visible { display: block; }
    .status-ok   { color: var(--green); }
    .status-err  { color: var(--red); }
    .status-warn { color: var(--yellow); }
    .users-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .user-chip {
      background: rgba(124,106,247,0.15); border: 1px solid rgba(124,106,247,0.3);
      border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--accent2);
    }
    hr { border: none; border-top: 1px solid var(--border); }
    .tag-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .note { background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.2); border-radius: 8px; padding: 10px 14px; font-size: 12px; color: var(--yellow); }
  </style>
</head>
<body>

<header>
  <h1>💬 Girly Chat 2000 — API Docs</h1>
  <p>Servidor rodando em <strong>http://localhost:3000</strong> &nbsp;·&nbsp; Clique em um endpoint para expandir e testar</p>
</header>

<div class="container">

  <div class="note">⚠️ Os testes abaixo enviam requisições <strong>reais</strong> para o servidor. Username duplicado retorna <code>409</code>. Mensagens com palavrões são censuradas automaticamente.</div>

  <!-- GET /messages -->
  <div class="card">
    <div class="card-header" onclick="toggle(this)">
      <span class="badge badge-get">GET</span>
      <span class="endpoint-path">/messages</span>
      <span class="card-desc">Lista todas as mensagens</span>
      <span class="chevron">▼</span>
    </div>
    <div class="card-body">
      <div class="tag-row">
        <span class="badge badge-get">200 OK</span>
        <span style="font-size:12px;color:var(--muted)">Retorna um array JSON com todas as mensagens salvas.</span>
      </div>
      <button class="btn btn-primary" onclick="sendReq('GET','/messages',null,'res-messages')">▶ Executar</button>
      <div id="res-messages" class="response-box"></div>
    </div>
  </div>

  <!-- POST /join -->
  <div class="card">
    <div class="card-header" onclick="toggle(this)">
      <span class="badge badge-post">POST</span>
      <span class="endpoint-path">/join</span>
      <span class="card-desc">Reserva um username na sala</span>
      <span class="chevron">▼</span>
    </div>
    <div class="card-body">
      <div class="tag-row">
        <span class="badge badge-post">200 OK</span>
        <span class="badge badge-delete">409 Conflict</span>
        <span style="font-size:12px;color:var(--muted)">409 se o nome já estiver em uso por outro IP.</span>
      </div>
      <div>
        <label>Body (JSON)</label>
        <textarea id="body-join" rows="3">{ "name": "fulano" }</textarea>
      </div>
      <button class="btn btn-primary" onclick="sendReq('POST','/join',document.getElementById('body-join').value,'res-join')">▶ Executar</button>
      <div id="res-join" class="response-box"></div>
    </div>
  </div>

  <!-- POST /leave -->
  <div class="card">
    <div class="card-header" onclick="toggle(this)">
      <span class="badge badge-post">POST</span>
      <span class="endpoint-path">/leave</span>
      <span class="card-desc">Libera o username da sala</span>
      <span class="chevron">▼</span>
    </div>
    <div class="card-body">
      <div class="tag-row">
        <span class="badge badge-post">200 OK</span>
        <span style="font-size:12px;color:var(--muted)">Remove o usuário do registro em memória.</span>
      </div>
      <div>
        <label>Body (JSON)</label>
        <textarea id="body-leave" rows="3">{ "name": "fulano" }</textarea>
      </div>
      <button class="btn btn-primary" onclick="sendReq('POST','/leave',document.getElementById('body-leave').value,'res-leave')">▶ Executar</button>
      <div id="res-leave" class="response-box"></div>
    </div>
  </div>

  <!-- GET /users -->
  <div class="card">
    <div class="card-header" onclick="toggle(this)">
      <span class="badge badge-get">GET</span>
      <span class="endpoint-path">/users</span>
      <span class="card-desc">Usuários ativos na sala</span>
      <span class="chevron">▼</span>
    </div>
    <div class="card-body">
      <div class="tag-row">
        <span class="badge badge-get">200 OK</span>
        <span style="font-size:12px;color:var(--muted)">Lista os usernames em memória desde o último restart.</span>
      </div>
      <button class="btn btn-primary" onclick="loadUsers()">▶ Executar</button>
      <div id="users-chips" class="users-list" style="display:none"></div>
      <div id="res-users" class="response-box"></div>
    </div>
  </div>

  <!-- POST /messages -->
  <div class="card">
    <div class="card-header" onclick="toggle(this)">
      <span class="badge badge-post">POST</span>
      <span class="endpoint-path">/messages</span>
      <span class="card-desc">Envia uma mensagem</span>
      <span class="chevron">▼</span>
    </div>
    <div class="card-body">
      <div class="tag-row">
        <span class="badge badge-post">201 Created</span>
        <span class="badge badge-delete">409 Conflict</span>
        <span style="font-size:12px;color:var(--muted)">Palavrões são censurados; username duplicado retorna 409.</span>
      </div>
      <div>
        <label>Body (JSON)</label>
        <textarea id="body-post" rows="4">{ "name": "fulano", "text": "Olá galera! catapimbas" }</textarea>
      </div>
      <button class="btn btn-primary" onclick="sendReq('POST','/messages',document.getElementById('body-post').value,'res-post')">▶ Enviar Mensagem</button>
      <div id="res-post" class="response-box"></div>
    </div>
  </div>

</div>

<script>
  const BASE = window.location.origin;

  function toggle(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector('.chevron');
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    header.classList.toggle('open', !isOpen);
    chevron.classList.toggle('open', !isOpen);
  }

  async function sendReq(method, path, body, responseId) {
    const box = document.getElementById(responseId);
    box.className = 'response-box visible';
    box.textContent = '⏳ Aguardando...';
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = body;
      const res = await fetch(BASE + path, opts);
      const data = await res.json();
      const statusClass = res.ok ? 'status-ok' : (res.status === 409 ? 'status-warn' : 'status-err');
      box.innerHTML = '<span class="' + statusClass + '">HTTP ' + res.status + ' ' + res.statusText + '</span>\\n\\n' + JSON.stringify(data, null, 2);
    } catch (e) {
      box.innerHTML = '<span class="status-err">Erro de conexão: ' + e.message + '</span>';
    }
  }

  async function loadUsers() {
    const box = document.getElementById('res-users');
    const chips = document.getElementById('users-chips');
    box.className = 'response-box visible';
    box.textContent = '⏳ Aguardando...';
    chips.style.display = 'none';
    try {
      const res = await fetch(BASE + '/users');
      const data = await res.json();
      box.innerHTML = '<span class="status-ok">HTTP ' + res.status + '</span>\\n\\n' + JSON.stringify(data, null, 2);
      if (Array.isArray(data) && data.length > 0) {
        chips.style.display = 'flex';
        chips.innerHTML = data.map(u => '<span class="user-chip">👤 ' + u.name + '</span>').join('');
      } else {
        chips.style.display = 'none';
      }
    } catch (e) {
      box.innerHTML = '<span class="status-err">Erro de conexão: ' + e.message + '</span>';
    }
  }
</script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  jsonResponse(res, 404, { error: 'Not Found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat server running on http://0.0.0.0:${PORT}`);
  console.log(`API Docs:           http://localhost:${PORT}/api-docs`);
  console.log(`Logs will be written to: ${LOG_FILE}`);
});
