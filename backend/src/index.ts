import http, { IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { URL } from 'url';
import { createHealthHandler } from './health.js';
import { sendJsonError } from './errors.js';
import { UserStore } from './users.js';
import { RoomStore, ParticipantState } from './rooms.js';
import { signToken, verifyToken, TokenError } from './tokens.js';

interface JsonRequest extends IncomingMessage {
  body?: unknown;
}

interface AuthResponse {
  user: ReturnType<UserStore['toPublicUser']>;
  token: string;
}

interface VerifyResponse {
  user: ReturnType<UserStore['toPublicUser']>;
  token: {
    expiresAt: string;
  };
}

interface ClientContext {
  socket: WebSocket;
  authenticated: boolean;
  clientId?: string;
  user?: ReturnType<UserStore['toPublicUser']>;
  roomId?: string;
}

type ClientMessage = {
  type: string;
  data?: any;
};

type AckData = Record<string, unknown> | undefined;

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const SECRET = process.env.NAVIGATOR_SECRET ?? 'change-me';

const userStore = new UserStore();
const roomStore = new RoomStore();

const getExpiresAt = () => new Date(Date.now() + TOKEN_TTL_MS);

const readJsonBody = async (req: IncomingMessage): Promise<any> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error('Invalid JSON payload');
  }
};

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const validateEmail = (email: unknown): email is string =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validatePassword = (password: unknown): password is string =>
  typeof password === 'string' && password.length >= 8;

const requireAuthHeader = (req: IncomingMessage): string | undefined => {
  const header = req.headers['authorization'];
  if (!header || typeof header !== 'string') {
    return undefined;
  }

  const [, token] = header.split(' ');
  return token;
};

const authenticateToken = (token: string) => {
  const payload = verifyToken(token, SECRET);
  const user = userStore.getById(payload.sub);
  if (!user) {
    throw new TokenError('User not found');
  }

  return { payload, user };
};

const registerHandler = async (req: JsonRequest, res: ServerResponse) => {
  try {
    const body = await readJsonBody(req);
    const { email, password, displayName } = body as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
    };

    if (!validateEmail(email) || !validatePassword(password)) {
      return sendJsonError(res, 400, 'VALIDATION_ERROR', 'Invalid email or password format.');
    }

    if (displayName !== undefined && typeof displayName !== 'string') {
      return sendJsonError(res, 400, 'VALIDATION_ERROR', 'displayName must be a string when provided.');
    }

    if (userStore.hasEmail(email)) {
      return sendJsonError(res, 409, 'AUTH_EMAIL_IN_USE', 'An account with that email already exists.');
    }

    const user = userStore.createUser({ email, password, displayName });
    const expiresAt = getExpiresAt();
    const token = signToken({ sub: user.id, exp: expiresAt.getTime() }, SECRET);

    const response: AuthResponse = {
      user: userStore.toPublicUser(user),
      token,
    };

    sendJson(res, 201, response);
  } catch (error) {
    console.error('register error', error);
    if (error instanceof Error && error.message === 'Invalid JSON payload') {
      sendJsonError(res, 400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
    } else {
      sendJsonError(res, 500, 'SERVER_ERROR', 'Unable to create account.');
    }
  }
};

const loginHandler = async (req: JsonRequest, res: ServerResponse) => {
  try {
    const body = await readJsonBody(req);
    const { email, password } = body as { email?: unknown; password?: unknown };

    if (!validateEmail(email) || !validatePassword(password)) {
      return sendJsonError(res, 400, 'VALIDATION_ERROR', 'Invalid email or password format.');
    }

    const user = userStore.getByEmail(email);
    if (!user || !userStore.verifyPassword(user, password)) {
      return sendJsonError(res, 401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const expiresAt = getExpiresAt();
    const token = signToken({ sub: user.id, exp: expiresAt.getTime() }, SECRET);

    const response: AuthResponse = {
      user: userStore.toPublicUser(user),
      token,
    };

    sendJson(res, 200, response);
  } catch (error) {
    console.error('login error', error);
    if (error instanceof Error && error.message === 'Invalid JSON payload') {
      sendJsonError(res, 400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
    } else {
      sendJsonError(res, 500, 'SERVER_ERROR', 'Unable to login.');
    }
  }
};

const verifyHandler = async (req: JsonRequest, res: ServerResponse) => {
  try {
    const token = requireAuthHeader(req);
    if (!token) {
      return sendJsonError(res, 401, 'AUTH_TOKEN_INVALID', 'Missing bearer token.');
    }

    const { payload, user } = authenticateToken(token);

    const response: VerifyResponse = {
      user: userStore.toPublicUser(user),
      token: {
        expiresAt: new Date(payload.exp).toISOString(),
      },
    };

    sendJson(res, 200, response);
  } catch (error) {
    console.error('verify error', error);
    if (error instanceof TokenError) {
      sendJsonError(res, 401, 'AUTH_TOKEN_INVALID', 'Authentication token expired or invalid.');
    } else {
      sendJsonError(res, 500, 'SERVER_ERROR', 'Unable to verify token.');
    }
  }
};

const router = async (req: JsonRequest, res: ServerResponse) => {
  const url = req.url ? new URL(req.url, 'http://localhost') : undefined;
  const { method } = req;

  if (!url) {
    return sendJsonError(res, 404, 'SERVER_ERROR', 'Route not found.');
  }

  if (method === 'POST' && url.pathname === '/auth/register') {
    return registerHandler(req, res);
  }

  if (method === 'POST' && url.pathname === '/auth/login') {
    return loginHandler(req, res);
  }

  if (method === 'GET' && url.pathname === '/auth/verify') {
    return verifyHandler(req, res);
  }

  if (method === 'GET' && url.pathname === '/health') {
    return handleHealthRequest(req, res);
  }

  sendJsonError(res, 404, 'SERVER_ERROR', 'Route not found.');
};

let wss: WebSocketServer | undefined;

const metricsProvider = {
  getConnections: () => (wss ? wss.clients.size : 0),
  getActiveRooms: () => roomStore.getActiveCount(),
  startedAt: Date.now(),
};

const healthHandler = createHealthHandler(metricsProvider);

const handleHealthRequest = (_req: IncomingMessage, res: ServerResponse) => {
  healthHandler(_req, {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    },
  });
};

const server = http.createServer(async (req, res) => {
  try {
    await router(req as JsonRequest, res);
  } catch (error) {
    console.error('Unexpected router error', error);
    if (!res.headersSent) {
      sendJsonError(res, 500, 'SERVER_ERROR', 'Unexpected server error.');
    }
  }
});

const sendMessage = (socket: WebSocket, type: string, data?: unknown) => {
  const payload = JSON.stringify({ type, data });
  socket.send(payload);
};

const sendAck = (socket: WebSocket, type: string, data?: AckData) => {
  sendMessage(socket, `${type}.ack`, data);
};

const sendErrorMessage = (socket: WebSocket, code: string, message: string) => {
  sendMessage(socket, 'error', { code, message });
};

const broadcast = (room: ReturnType<RoomStore['getRoom']>, type: string, data: unknown, exclude?: WebSocket) => {
  if (!room) return;
  for (const participant of room.participants.values()) {
    if (participant.socket !== exclude) {
      sendMessage(participant.socket, type, data);
    }
  }
};

const ensureAuthenticated = (ctx: ClientContext, socket: WebSocket) => {
  if (!ctx.authenticated || !ctx.user || !ctx.clientId) {
    sendErrorMessage(socket, 'AUTH_TOKEN_INVALID', 'Authentication required.');
    throw new Error('Unauthenticated');
  }
};

const handleConnectionInit = (ctx: ClientContext, message: ClientMessage) => {
  const data = message.data ?? {};
  const token = typeof data.token === 'string' ? data.token : undefined;
  const clientId = typeof data.clientId === 'string' ? data.clientId : undefined;

  if (!token || !clientId) {
    sendMessage(ctx.socket, 'connection.error', {
      code: 'AUTH_TOKEN_INVALID',
      message: 'Authentication token missing.',
    });
    ctx.socket.close();
    return;
  }

  try {
    const { user } = authenticateToken(token);
    ctx.authenticated = true;
    ctx.clientId = clientId;
    ctx.user = userStore.toPublicUser(user);

    sendMessage(ctx.socket, 'connection.init.ack', {
      clientId,
      user: ctx.user,
    });
  } catch (error) {
    console.error('connection init error', error);
    sendMessage(ctx.socket, 'connection.error', {
      code: 'AUTH_TOKEN_INVALID',
      message: 'Authentication token expired or invalid.',
    });
    ctx.socket.close();
  }
};

const createParticipantState = (ctx: ClientContext, socket: WebSocket): ParticipantState => ({
  clientId: ctx.clientId!,
  user: ctx.user!,
  socket,
  metadata: {
    id: ctx.clientId!,
    displayName: ctx.user!.displayName,
    isPublisher: true,
  },
});

const handleRoomCreate = (ctx: ClientContext, message: ClientMessage) => {
  const data = message.data ?? {};
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  let maxParticipants = 6;
  if (typeof data.maxParticipants === 'number' && Number.isInteger(data.maxParticipants)) {
    maxParticipants = data.maxParticipants;
  } else if (typeof data.maxParticipants === 'string') {
    const parsed = Number.parseInt(data.maxParticipants, 10);
    if (Number.isInteger(parsed)) {
      maxParticipants = parsed;
    }
  }
  maxParticipants = Math.max(1, Math.min(32, maxParticipants));

  if (!name) {
    sendErrorMessage(ctx.socket, 'ROOM_CREATION_FAILED', 'Room name is required.');
    return;
  }

  try {
    const room = roomStore.createRoom({
      name,
      maxParticipants,
      ownerUserId: ctx.user!.id,
    });

    const participant = createParticipantState(ctx, ctx.socket);
    roomStore.addParticipant(room, participant);
    participant.roomId = room.id;
    ctx.roomId = room.id;

    sendAck(ctx.socket, 'room.create', {
      roomId: room.id,
      name: room.name,
      maxParticipants: room.maxParticipants,
    });

    sendMessage(ctx.socket, 'participant.list', {
      roomId: room.id,
      participants: roomStore.listParticipants(room),
    });
  } catch (error) {
    console.error('room create error', error);
    sendErrorMessage(ctx.socket, 'ROOM_CREATION_FAILED', (error as Error).message);
  }
};

const handleRoomJoin = (ctx: ClientContext, message: ClientMessage) => {
  const data = message.data ?? {};
  const roomId = typeof data.roomId === 'string' ? data.roomId : undefined;
  if (!roomId) {
    sendErrorMessage(ctx.socket, 'ROOM_JOIN_FAILED', 'roomId is required.');
    return;
  }

  const room = roomStore.getRoom(roomId);
  if (!room) {
    sendErrorMessage(ctx.socket, 'ROOM_JOIN_FAILED', 'Requested room was not found.');
    return;
  }

  if (ctx.roomId && ctx.roomId === room.id) {
    sendAck(ctx.socket, 'room.join', { roomId: room.id });
    return;
  }

  if (ctx.roomId && ctx.roomId !== room.id) {
    leaveCurrentRoom(ctx);
  }

  try {
    const participant: ParticipantState = {
      clientId: ctx.clientId!,
      user: ctx.user!,
      socket: ctx.socket,
      roomId: room.id,
      metadata: {
        id: ctx.clientId!,
        displayName: ctx.user!.displayName,
        isPublisher: false,
      },
    };

    roomStore.addParticipant(room, participant);
    ctx.roomId = room.id;

    sendMessage(ctx.socket, 'participant.list', {
      roomId: room.id,
      participants: roomStore.listParticipants(room),
    });

    broadcast(
      room,
      'room.participant_joined',
      {
        roomId: room.id,
        participant: participant.metadata,
      },
      undefined
    );

    sendAck(ctx.socket, 'room.join', { roomId: room.id });
  } catch (error) {
    console.error('room join error', error);
    sendErrorMessage(ctx.socket, 'ROOM_JOIN_FAILED', (error as Error).message);
  }
};

const leaveCurrentRoom = (ctx: ClientContext) => {
  if (!ctx.roomId) {
    return;
  }

  const room = roomStore.getRoom(ctx.roomId);
  if (!room) {
    ctx.roomId = undefined;
    return;
  }

  const participant = room.participants.get(ctx.clientId!);
  if (!participant) {
    ctx.roomId = undefined;
    return;
  }

  roomStore.deleteParticipant(room, ctx.clientId!);
  ctx.roomId = undefined;

  broadcast(room, 'room.participant_left', {
    roomId: room.id,
    participantId: ctx.clientId!,
  });
};

const handleRoomLeave = (ctx: ClientContext) => {
  if (!ctx.roomId) {
    sendErrorMessage(ctx.socket, 'ROOM_LEAVE_FAILED', 'Not currently joined to a room.');
    return;
  }

  const previousRoomId = ctx.roomId;
  leaveCurrentRoom(ctx);
  sendAck(ctx.socket, 'room.leave', { roomId: previousRoomId });
};

const handleSignaling = (ctx: ClientContext, message: ClientMessage) => {
  if (!ctx.roomId) {
    sendErrorMessage(ctx.socket, 'ROOM_JOIN_FAILED', 'Join a room before sending signaling messages.');
    return;
  }

  const room = roomStore.getRoom(ctx.roomId);
  if (!room) {
    sendErrorMessage(ctx.socket, 'ROOM_JOIN_FAILED', 'Room no longer exists.');
    return;
  }

  const data = message.data ?? {};
  const targetId = typeof data.targetId === 'string' ? data.targetId : undefined;
  if (!targetId) {
    sendErrorMessage(ctx.socket, 'SIGNALING_TARGET_OFFLINE', 'targetId is required.');
    return;
  }

  const target = room.participants.get(targetId);
  if (!target) {
    sendErrorMessage(ctx.socket, 'SIGNALING_TARGET_OFFLINE', 'Target participant is offline.');
    return;
  }

  sendMessage(target.socket, message.type, {
    roomId: room.id,
    targetId,
    payload: data.payload,
    senderId: ctx.clientId,
  });

  sendAck(ctx.socket, message.type, { roomId: room.id, targetId });
};

const handleMessage = (ctx: ClientContext, raw: RawData) => {
  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(raw.toString());
  } catch (error) {
    console.error('Invalid message received', error);
    sendErrorMessage(ctx.socket, 'SERVER_ERROR', 'Unable to parse message.');
    return;
  }

  if (!parsed.type) {
    sendErrorMessage(ctx.socket, 'SERVER_ERROR', 'Missing message type.');
    return;
  }

  if (!ctx.authenticated) {
    if (parsed.type !== 'connection.init') {
      sendMessage(ctx.socket, 'connection.error', {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Authenticate before sending other messages.',
      });
      ctx.socket.close();
      return;
    }

    return handleConnectionInit(ctx, parsed);
  }

  try {
    ensureAuthenticated(ctx, ctx.socket);
  } catch {
    ctx.socket.close();
    return;
  }

  switch (parsed.type) {
    case 'room.create':
      handleRoomCreate(ctx, parsed);
      break;
    case 'room.join':
      handleRoomJoin(ctx, parsed);
      break;
    case 'room.leave':
      handleRoomLeave(ctx);
      break;
    case 'webrtc.offer':
    case 'webrtc.answer':
    case 'webrtc.ice':
      handleSignaling(ctx, parsed);
      break;
    default:
      sendErrorMessage(ctx.socket, 'SERVER_ERROR', `Unsupported message type: ${parsed.type}`);
  }
};

const attachWebSocketServer = () => {
  wss = new WebSocketServer({ server });

  wss.on('connection', (socket: WebSocket) => {
    const context: ClientContext = { socket, authenticated: false };

    socket.on('message', (raw: RawData) => handleMessage(context, raw));

    socket.on('close', () => {
      leaveCurrentRoom(context);
    });

    socket.on('error', (error: Error) => {
      console.error('WebSocket error', error);
      leaveCurrentRoom(context);
    });
  });
};

attachWebSocketServer();

const PORT = Number(process.env.PORT ?? 4000);

export const start = () =>
  server.listen(PORT, () => {
    console.log(`Navigator backend listening on port ${PORT}`);
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
