import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { loadSignalingConfig } from '@hotel-app/config';
import { authMiddleware } from './middleware/auth.middleware';
import { PresenceManager } from './services/presence.manager';
import { RateLimiter } from './services/rate-limiter';
import { CallHandler } from './handlers/call.handler';

const config = loadSignalingConfig();

// ── Express for health check ─────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Socket.IO server ─────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: {
    origin: config.CORS_ORIGINS,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000,
});

// ── Services ─────────────────────────────────────────────────────────────────
const presenceManager = new PresenceManager();
const rateLimiter = new RateLimiter(config.REDIS_URL);
const callHandler = new CallHandler(io, presenceManager, rateLimiter, config);

// ── Auth middleware ──────────────────────────────────────────────────────────
io.use((socket, next) => authMiddleware(socket, config.JWT_SECRET, next));

// ── Connection handling ──────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const user = (socket as any).user as {
    sub: string;
    tenant_id: string;
    entity_type: string;
    room?: string;
    grants: string[];
  };

  // Register presence
  if (user.entity_type === 'STAFF' || user.entity_type === 'ADMIN') {
    const department = (socket.handshake.query['department'] as string) ?? '';
    presenceManager.addStaff(user.tenant_id, department, {
      socketId: socket.id,
      identityId: user.sub,
      department,
    });

    socket.on('disconnect', () => {
      presenceManager.removeStaff(user.tenant_id, department, socket.id);
    });
  } else {
    // Guest — track for call routing responses
    presenceManager.addGuest(user.sub, socket.id);

    socket.on('disconnect', () => {
      presenceManager.removeGuest(user.sub);
    });
  }

  // ── Call events ──────────────────────────────────────────────────────────
  socket.on('call:initiate', (data) => callHandler.handleInitiate(socket, user, data));
  socket.on('call:accept', (data) => callHandler.handleAccept(socket, user, data));
  socket.on('call:reject', (data) => callHandler.handleReject(socket, user, data));
  socket.on('call:ice-candidate', (data) => callHandler.handleIceCandidate(socket, data));
  socket.on('call:sdp', (data) => callHandler.handleSdp(socket, data));
  socket.on('call:end', (data) => callHandler.handleEnd(socket, user, data));
});

// ── Start server ─────────────────────────────────────────────────────────────
server.listen(config.PORT, () => {
  console.warn(`[signaling-server] Listening on port ${config.PORT}`);
});

export { io, server };
