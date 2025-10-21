import crypto from 'crypto';
import http, { IncomingMessage, ServerResponse } from 'http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { URL } from 'url';
import { createHealthHandler } from './health.js';
import { sendJsonError } from './errors.js';
import { UserStore } from './users.js';
import { RoomStore, ParticipantState, ParticipantRole, Room } from './rooms.js';
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

interface SignalingContext {
  socket: WebSocket;
  user: ReturnType<UserStore['toPublicUser']>;
  participantId: string;
  roomId?: string;
  username: string;
  role: ParticipantRole;
}

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

const sendJson = (res: Response, statusCode: number, payload: unknown) => {
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

const setCorsHeaders = (res: ServerResponse, req: IncomingMessage) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const handleCorsPrelight = (res: ServerResponse) => {
  res.statusCode = 204;
  res.end();
};

// Modify the existing server creation
const server = http.createServer(async (req, res) => {
  setCorsHeaders(res, req);
  
  if (req.method === 'OPTIONS') {
    handleCorsPrelight(res);
    return;
  }

  try {
    await router(req as JsonRequest, res);
  } catch (error) {
    console.error('Unexpected router error', error);
    if (!res.headersSent) {
      sendJsonError(res, 500, 'SERVER_ERROR', 'Unexpected server error.');
    }
  }
});

type SignalingMessage<Type extends string, Payload> = {
  type: Type;
  payload: Payload;
  requestId?: string;
};

const sendEnvelope = <Type extends string, Payload>(
  socket: WebSocket,
  message: SignalingMessage<Type, Payload>,
) => {
  socket.send(JSON.stringify(message));
};

const sendErrorEnvelope = (
  socket: WebSocket,
  message: string,
  options: { requestId?: string; code?: string } = {},
) => {
  const payload: { message: string; code?: string } = { message };

  if (options.code) {
    payload.code = options.code;
  }

  sendEnvelope(socket, {
    type: 'error',
    payload,
    requestId: options.requestId,
  });
};

const deriveUsername = (user: ReturnType<UserStore['toPublicUser']>): string => {
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
  }

  if (user.email && user.email.includes('@')) {
    return user.email.split('@')[0] ?? user.email;
  }

  return `participant-${user.id.slice(0, 8)}`;
};

const broadcast = <Type extends string, Payload>(
  room: Room,
  message: SignalingMessage<Type, Payload>,
  exclude?: WebSocket,
) => {
  room.participants.forEach((participant) => {
    if (participant.socket !== exclude) {
      sendEnvelope(participant.socket, message);
    }
  });
};

const leaveCurrentRoom = (ctx: SignalingContext) => {
  if (!ctx.roomId) {
    return;
  }

  const room = roomStore.getRoom(ctx.roomId);
  if (!room) {
    ctx.roomId = undefined;
    return;
  }

  const participant = room.participants.get(ctx.participantId);
  if (!participant) {
    ctx.roomId = undefined;
    return;
  }

  roomStore.removeParticipant(room, ctx.participantId);
  ctx.roomId = undefined;

  const message: SignalingMessage<'participant-left', { participantId: string }> = {
    type: 'participant-left',
    payload: { participantId: participant.id },
  };

  broadcast(room, message);
};

const handleCreateRoom = (
  ctx: SignalingContext,
  message: SignalingMessage<'create-room', { password?: unknown }>,
) => {
  const password = typeof message.payload?.password === 'string' ? message.payload.password : '';

  try {
    const room = roomStore.createRoom({ ownerUserId: ctx.user.id, password });

    const response: SignalingMessage<'room-created', { roomId: string }> = {
      type: 'room-created',
      payload: { roomId: room.id },
      requestId: message.requestId,
    };

    sendEnvelope(ctx.socket, response);
  } catch (error) {
    console.error('room create error', error);
    sendErrorEnvelope(
      ctx.socket,
      error instanceof Error ? error.message : 'Unable to create room.',
      { requestId: message.requestId, code: 'room_creation_failed' },
    );
  }
};

const createParticipantState = (
  ctx: SignalingContext,
  role: ParticipantRole,
): ParticipantState => ({
  id: ctx.participantId,
  userId: ctx.user.id,
  username: ctx.username,
  role,
  socket: ctx.socket,
});

const handleJoinRoom = (
  ctx: SignalingContext,
  message: SignalingMessage<'join-room', { roomId?: unknown; password?: unknown }>,
) => {
  const roomId = typeof message.payload?.roomId === 'string' ? message.payload.roomId : undefined;
  const password = typeof message.payload?.password === 'string' ? message.payload.password : '';

  if (!roomId) {
    sendErrorEnvelope(ctx.socket, 'roomId is required.', {
      requestId: message.requestId,
      code: 'room_join_failed',
    });
    return;
  }

  const room = roomStore.getRoom(roomId);
  if (!room) {
    sendErrorEnvelope(ctx.socket, 'Requested room was not found.', {
      requestId: message.requestId,
      code: 'room_join_failed',
    });
    return;
  }

  if (!roomStore.verifyPassword(room, password)) {
    sendErrorEnvelope(ctx.socket, 'Invalid room password.', {
      requestId: message.requestId,
      code: 'room_join_failed',
    });
    return;
  }

  if (ctx.roomId && ctx.roomId !== room.id) {
    leaveCurrentRoom(ctx);
  }

  try {
    const existing = room.participants.get(ctx.participantId);
    if (existing) {
      ctx.roomId = room.id;

      const response: SignalingMessage<'room-joined', { roomId: string; participantId: string; participants: ReturnType<RoomStore['listParticipants']> }> = {
        type: 'room-joined',
        payload: {
          roomId: room.id,
          participantId: existing.id,
          participants: roomStore.listParticipants(room),
        },
        requestId: message.requestId,
      };

      sendEnvelope(ctx.socket, response);
      return;
    }

    const role: ParticipantRole = room.ownerUserId === ctx.user.id ? 'facilitator' : 'explorer';
    ctx.role = role;

    const participant = createParticipantState(ctx, role);
    roomStore.addParticipant(room, participant);
    ctx.roomId = room.id;

    const response: SignalingMessage<'room-joined', { roomId: string; participantId: string; participants: ReturnType<RoomStore['listParticipants']> }> = {
      type: 'room-joined',
      payload: {
        roomId: room.id,
        participantId: participant.id,
        participants: roomStore.listParticipants(room),
      },
      requestId: message.requestId,
    };

    sendEnvelope(ctx.socket, response);

    const joinedNotification: SignalingMessage<'participant-joined', { participantId: string; username: string; role: ParticipantRole }> = {
      type: 'participant-joined',
      payload: {
        participantId: participant.id,
        username: participant.username,
        role: participant.role,
      },
    };

    broadcast(room, joinedNotification, ctx.socket);
  } catch (error) {
    console.error('room join error', error);
    sendErrorEnvelope(
      ctx.socket,
      error instanceof Error ? error.message : 'Unable to join room.',
      { requestId: message.requestId, code: 'room_join_failed' },
    );
  }
};

const handleLeaveRoom = (ctx: SignalingContext) => {
  leaveCurrentRoom(ctx);
};

const forwardRtcMessage = (
  ctx: SignalingContext,
  message:
    | SignalingMessage<'offer', { targetId?: unknown; description?: unknown }>
    | SignalingMessage<'answer', { targetId?: unknown; description?: unknown }>
    | SignalingMessage<'ice-candidate', { targetId?: unknown; candidate?: unknown }>,
) => {
  if (!ctx.roomId) {
    sendErrorEnvelope(ctx.socket, 'Join a room before sending signaling messages.', {
      requestId: message.requestId,
      code: 'signaling_not_allowed',
    });
    return;
  }

  const room = roomStore.getRoom(ctx.roomId);
  if (!room) {
    ctx.roomId = undefined;
    sendErrorEnvelope(ctx.socket, 'Room no longer exists.', {
      requestId: message.requestId,
      code: 'signaling_not_allowed',
    });
    return;
  }

  const targetId = typeof message.payload?.targetId === 'string' ? message.payload.targetId : undefined;
  if (!targetId) {
    sendErrorEnvelope(ctx.socket, 'targetId is required.', {
      requestId: message.requestId,
      code: 'signaling_target_offline',
    });
    return;
  }

  const target = room.participants.get(targetId);
  if (!target) {
    sendErrorEnvelope(ctx.socket, 'Target participant is offline.', {
      requestId: message.requestId,
      code: 'signaling_target_offline',
    });
    return;
  }

  switch (message.type) {
    case 'offer':
    case 'answer': {
      const description = message.payload?.description;
      if (!description || typeof description !== 'object') {
        sendErrorEnvelope(ctx.socket, 'Invalid session description.', {
          requestId: message.requestId,
          code: 'invalid_payload',
        });
        return;
      }

      sendEnvelope(target.socket, {
        type: message.type,
        payload: { from: ctx.participantId, description },
      });
      break;
    }
    case 'ice-candidate': {
      const candidate = message.payload?.candidate;
      if (!candidate || typeof candidate !== 'object') {
        sendErrorEnvelope(ctx.socket, 'Invalid ICE candidate.', {
          requestId: message.requestId,
          code: 'invalid_payload',
        });
        return;
      }

      sendEnvelope(target.socket, {
        type: 'ice-candidate',
        payload: { from: ctx.participantId, candidate },
      });
      break;
    }
  }
};

const handleMessage = (ctx: SignalingContext, raw: RawData) => {
  let parsed: SignalingMessage<string, Record<string, unknown>>;

  try {
    parsed = JSON.parse(raw.toString());
  } catch (error) {
    console.error('Invalid message received', error);
    sendErrorEnvelope(ctx.socket, 'Unable to parse message.', { code: 'invalid_message' });
    return;
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    sendErrorEnvelope(ctx.socket, 'Missing message type.', { code: 'invalid_message' });
    return;
  }

  switch (parsed.type) {
    case 'create-room':
      handleCreateRoom(ctx, parsed as SignalingMessage<'create-room', { password?: unknown }>);
      break;
    case 'join-room':
      handleJoinRoom(
        ctx,
        parsed as SignalingMessage<'join-room', { roomId?: unknown; password?: unknown }>,
      );
      break;
    case 'leave-room':
      handleLeaveRoom(ctx);
      break;
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      forwardRtcMessage(
        ctx,
        parsed as
          | SignalingMessage<'offer', { targetId?: unknown; description?: unknown }>
          | SignalingMessage<'answer', { targetId?: unknown; description?: unknown }>
          | SignalingMessage<'ice-candidate', { targetId?: unknown; candidate?: unknown }>,
      );
      break;
    case 'authenticate':
      // Authentication is handled during the connection handshake. Accept the message silently.
      break;
    default:
      sendErrorEnvelope(ctx.socket, `Unsupported message type: ${parsed.type}`, {
        requestId: parsed.requestId,
        code: 'invalid_message',
      });
  }
};

const attachWebSocketServer = () => {
  wss = new WebSocketServer({ server, path: '/signaling' });

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const requestUrl = request.url ? new URL(request.url, 'http://localhost') : null;
    const token = requestUrl?.searchParams.get('token');

    if (!token) {
      socket.close(4401, 'Authentication token missing.');
      return;
    }

    let publicUser: ReturnType<UserStore['toPublicUser']>;

    try {
      const { user } = authenticateToken(token);
      publicUser = userStore.toPublicUser(user);
    } catch (error) {
      console.error('signaling authentication error', error);
      socket.close(4401, 'Authentication failed.');
      return;
    }

    const context: SignalingContext = {
      socket,
      user: publicUser,
      participantId: crypto.randomUUID(),
      username: deriveUsername(publicUser),
      role: 'explorer',
    };

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

const entryUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (import.meta.url === entryUrl) {
  start();
}
