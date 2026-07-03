// server.js - Backend Song Request LED
// Node.js + Express + SSE (Server-Sent Events)
// Deploy en Railway.app gratis

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Almacenamiento en memoria (se reinicia si el servidor reinicia)
let requests = [];
let currentDisplay = null;
let sseClients = [];

// ====== SSE - Tiempo real ======
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const client = { id: uuidv4(), res };
  sseClients.push(client);

  // Heartbeat cada 30s para mantener conexion
  const heartbeat = setInterval(() => {
    res.write('data: ping\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

function broadcast(eventData) {
  const msg = 'data: ' + JSON.stringify(eventData) + '\n\n';
  sseClients.forEach(c => {
    try { c.res.write(msg); } catch(e) {}
  });
}

// ====== ENDPOINTS ======

// POST /request - Nueva solicitud de cancion
app.post('/request', (req, res) => {
  const { igUser, song, artist, message, timestamp } = req.body;
  if (!song || song.trim() === '') {
    return res.status(400).json({ error: 'La cancion es requerida' });
  }

  const newRequest = {
    id: uuidv4(),
    igUser: (igUser || '').trim().substring(0, 30),
    song: song.trim().substring(0, 80),
    artist: (artist || '').trim().substring(0, 60),
    message: (message || '').trim().substring(0, 200),
    timestamp: timestamp || new Date().toISOString(),
    status: 'pending'
  };

  requests.push(newRequest);
  broadcast({ type: 'new_request', request: newRequest });

  console.log('[+] Nueva solicitud:', newRequest.song, '| IG:', newRequest.igUser || 'anonimo');
  res.json({ ok: true, id: newRequest.id });
});

// GET /requests - Obtener lista de solicitudes pendientes
app.get('/requests', (req, res) => {
  res.json(requests.filter(r => r.status === 'pending').reverse());
});

// POST /display - Enviar una solicitud a la pantalla LED
app.post('/display', (req, res) => {
  const data = req.body;
  currentDisplay = data;

  // Marcar como mostrada en cola
  const idx = requests.findIndex(r => r.id === data.id);
  if (idx !== -1) {
    requests[idx].status = 'displayed';
    setTimeout(() => {
      requests = requests.filter(r => r.id !== data.id);
    }, 5000);
  }

  broadcast({ type: 'display', data: currentDisplay });
  console.log('[LED] Mostrando:', data.song, '| IG:', data.igUser || 'anonimo');
  res.json({ ok: true });
});

// GET /display - Obtener lo que esta en la pantalla ahora
app.get('/display', (req, res) => {
  res.json(currentDisplay || {});
});

// DELETE /reject/:id - Rechazar una solicitud
app.delete('/reject/:id', (req, res) => {
  requests = requests.filter(r => r.id !== req.params.id);
  broadcast({ type: 'rejected', id: req.params.id });
  res.json({ ok: true });
});

// GET /stats - Estadisticas rapidas
app.get('/stats', (req, res) => {
  res.json({
    pending: requests.filter(r => r.status === 'pending').length,
    displayed: requests.filter(r => r.status === 'displayed').length,
    clients: sseClients.length
  });
});

app.listen(PORT, () => {
  console.log('Song Request LED Server corriendo en puerto ' + PORT);
});
