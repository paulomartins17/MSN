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

// Helper to read messages
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

// Helper to write messages
function writeMessages(messages) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing messages file:', err);
  }
}

// Helper to append to log file
function appendLog(ip, name, text) {
  const timestamp = new Date().toISOString();
  // Formata o IP para remover prefixo IPv6 em desenvolvimento se necessário (ex: ::ffff:)
  const formattedIp = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
  const logLine = `[${timestamp}] IP: ${formattedIp} | User: ${name} | Message: ${text}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    console.log(logLine.trim());
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /messages
  if (req.url === '/messages' && req.method === 'GET') {
    const messages = readMessages();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(messages));
    return;
  }

  // POST /messages
  if (req.url === '/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.name || !payload.text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Name and text are required' }));
          return;
        }

        // Get IP address
        const clientIp = req.headers['x-forwarded-for'] || 
                         req.socket.remoteAddress || 
                         (req.connection && req.connection.remoteAddress) || 
                         '127.0.0.1';

        // Append to security log
        appendLog(clientIp, payload.name, payload.text);

        // Add to messages list
        const messages = readMessages();
        const newMessage = {
          id: String(Date.now() + Math.random()),
          name: payload.name,
          text: payload.text,
          timestamp: new Date().toISOString(),
          ip: clientIp.startsWith('::ffff:') ? clientIp.substring(7) : clientIp
        };
        messages.push(newMessage);
        writeMessages(messages);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newMessage));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process request: ' + err.message }));
      }
    });
    return;
  }

  // Default Not Found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat server running on http://0.0.0.0:${PORT}`);
  console.log(`Logs will be written to: ${LOG_FILE}`);
});
