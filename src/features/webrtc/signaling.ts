import {
  type SignalingClientEventMap,
  type SignalingClientMessage,
  type SignalingEventHandler,
  type SignalingMessageEnvelope,
  type SignalingPendingRequest,
  type SignalingRequestType,
  type SignalingRoomAckPayloads,
  type SignalingServerMessage,
} from '../../types/signaling';

const SIGNALING_SERVER_URL = (() => {
  const rawUrl = import.meta.env.VITE_SIGNALING_SERVER_URL?.trim();
  console.log(rawUrl);
  if (!rawUrl) {
    throw new Error('VITE_SIGNALING_SERVER_URL is not configured');
  }

  return rawUrl.replace(/\/$/, '');
})();

const MAX_RECONNECT_DELAY_MS = 15_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

const REQUEST_RESPONSE_MAP = {
  'create-room': 'room-created',
  'join-room': 'room-joined',
} as const satisfies Record<'create-room' | 'join-room', SignalingRequestType>;

type RequestResponseType<
  RequestType extends keyof typeof REQUEST_RESPONSE_MAP,
> = (typeof REQUEST_RESPONSE_MAP)[RequestType];

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildWebSocketUrl(token: string): string {
  const url = new URL(SIGNALING_SERVER_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

export class SignalingClient {
  private socket: WebSocket | null = null;

  private readonly eventHandlers = new Map<
    keyof SignalingClientEventMap,
    Set<SignalingEventHandler<any>>
  >();

  private readonly pendingRequests = new Map<string, SignalingPendingRequest>();

  private connectPromise: Promise<void> | null = null;

  private reconnectAttempts = 0;

  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private manualDisconnect = false;

  private authToken: string | null = null;

  private currentRoomId: string | null = null;

  private readonly handleSocketMessage = (event: MessageEvent<string>): void => {
    let message: SignalingServerMessage;

    try {
      message = JSON.parse(event.data) as SignalingServerMessage;
    } catch (error) {
      this.emit('error', {
        message: 'Received malformed message from signaling server',
        code: 'invalid_message',
      });
      return;
    }

    if (message.requestId && this.pendingRequests.has(message.requestId)) {
      const pending = this.pendingRequests.get(message.requestId);

      if (pending) {
        if (message.type === 'error') {
          pending.reject(new Error(message.payload.message));
        } else if (message.type === pending.expectedType) {
          pending.resolve(
            message.payload as SignalingRoomAckPayloads[SignalingRequestType],
          );
        } else {
          pending.reject(
            new Error(
              `Unexpected response type "${message.type}" for request ${message.requestId}`,
            ),
          );
        }

        this.pendingRequests.delete(message.requestId);
      }
    }

    this.dispatchServerEvent(message);
  };

  public connect(token: string): Promise<void> {
    this.authToken = token;
    this.manualDisconnect = false;
    this.clearReconnectTimer();

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.initializeSocket(token, false);

    return this.connectPromise.finally(() => {
      this.connectPromise = null;
    });
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.removeEventListener('message', this.handleSocketMessage);
      this.socket.close();
      this.socket = null;
    }

    this.currentRoomId = null;
    this.rejectPendingRequests(new Error('Disconnected from signaling server'));
  }

  public async createRoom(password: string): Promise<{ roomId: string }> {
    const response = await this.sendRequest('create-room', { password });
    this.currentRoomId = response.roomId;
    return response;
  }

  public async joinRoom(
    roomId: string,
    password: string,
  ): Promise<{ participantId: string }> {
    const response = await this.sendRequest('join-room', { roomId, password });

    this.currentRoomId = roomId;
    return { participantId: response.participantId };
  }

  public leaveRoom(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: SignalingMessageEnvelope<'leave-room', Record<string, never>> = {
      type: 'leave-room',
      payload: {},
    };

    this.socket.send(JSON.stringify(message satisfies SignalingClientMessage));
    this.currentRoomId = null;
  }

  public sendOffer(targetId: string, offer: RTCSessionDescriptionInit): void {
    this.sendSignalMessage('offer', { targetId, description: offer });
  }

  public sendAnswer(targetId: string, answer: RTCSessionDescriptionInit): void {
    this.sendSignalMessage('answer', { targetId, description: answer });
  }

  public sendIceCandidate(targetId: string, candidate: RTCIceCandidate): void {
    const payload = { targetId, candidate: candidate.toJSON() };
    this.sendSignalMessage('ice-candidate', payload);
  }

  public on<Event extends keyof SignalingClientEventMap>(
    event: Event,
    handler: SignalingEventHandler<Event>,
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    const handlers = this.eventHandlers.get(event);
    handlers?.add(handler as SignalingEventHandler<any>);
  }

  public off<Event extends keyof SignalingClientEventMap>(
    event: Event,
    handler: SignalingEventHandler<Event>,
  ): void {
    const handlers = this.eventHandlers.get(event);
    handlers?.delete(handler as SignalingEventHandler<any>);

    if (handlers && handlers.size === 0) {
      this.eventHandlers.delete(event);
    }
  }

  private initializeSocket(token: string, isReconnect: boolean): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        this.socket?.addEventListener('open', () => resolve(), { once: true });
        this.socket?.addEventListener(
          'error',
          () => reject(new Error('Failed to establish signaling connection')),
          { once: true },
        );
      });
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    const url = buildWebSocketUrl(token);
    const socket = new WebSocket(url);
    this.socket = socket;

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('close', handleClose);
        socket.removeEventListener('error', handleError);
        socket.removeEventListener('message', this.handleSocketMessage);
      };

      const handleOpen = (): void => {
        settled = true;
        socket.addEventListener('message', this.handleSocketMessage);
        this.reconnectAttempts = 0;
        this.manualDisconnect = false;
        this.emit('connected', undefined);

        if (isReconnect) {
          this.emit('reconnected', undefined);
        }

        resolve();
      };

      const handleError = (): void => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('Failed to establish signaling connection'));
        } else {
          this.emit('error', {
            message: 'Unexpected WebSocket error',
            code: 'socket_error',
          });
        }
      };

      const handleClose = (event: CloseEvent): void => {
        this.socket = null;
        cleanup();

        if (!settled) {
          settled = true;
          reject(new Error('Signaling connection closed unexpectedly'));
        }

        this.emit('disconnected', {
          code: event.code,
          reason: event.reason ?? 'Connection closed',
        });

        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        }
      };

      socket.addEventListener('open', handleOpen, { once: true });
      socket.addEventListener('close', handleClose);
      socket.addEventListener('error', handleError);
    });
  }

  private scheduleReconnect(): void {
    if (!this.authToken) {
      return;
    }

    if (this.reconnectTimeoutId) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS,
    );

    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;

      this.initializeSocket(this.authToken as string, true).catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  private sendSignalMessage<Type extends 'offer' | 'answer' | 'ice-candidate'>(
    type: Type,
    payload: Extract<SignalingClientMessage, { type: Type }>['payload'],
  ): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling socket is not connected');
    }

    const message = { type, payload };

    this.socket.send(JSON.stringify(message));
  }

  private async sendRequest<RequestType extends keyof typeof REQUEST_RESPONSE_MAP>(
    type: RequestType,
    payload: Extract<SignalingClientMessage, { type: RequestType }>['payload'],
  ): Promise<SignalingRoomAckPayloads[RequestResponseType<RequestType>]> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling socket is not connected');
    }

    const requestId = generateRequestId();
    const expectedType = REQUEST_RESPONSE_MAP[type];

    const message = { type, payload, requestId };

    const responsePromise = new Promise<
      SignalingRoomAckPayloads[RequestResponseType<RequestType>]
    >((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: SignalingRoomAckPayloads[SignalingRequestType]) => void,
        reject,
        expectedType,
      });
    });

    this.socket.send(JSON.stringify(message));

    return responsePromise;
  }

  private dispatchServerEvent(message: SignalingServerMessage): void {
    switch (message.type) {
      case 'room-created':
        this.emit('roomCreated', message.payload);
        return;
      case 'room-joined':
        this.emit('roomJoined', message.payload);
        return;
      case 'participant-joined':
        this.emit('participantJoined', message.payload);
        return;
      case 'participant-left':
        this.emit('participantLeft', message.payload);
        return;
      case 'offer':
        this.emit('offer', message.payload);
        return;
      case 'answer':
        this.emit('answer', message.payload);
        return;
      case 'ice-candidate':
        this.emit('iceCandidate', message.payload);
        return;
      case 'error':
        this.emit('error', message.payload);
        return;
    }

    const unexpected = message as SignalingMessageEnvelope<string, unknown>;
    this.emit('error', {
      message: `Unhandled signaling message type: ${unexpected.type}`,
      code: 'unhandled_message',
    });
  }

  private emit<Event extends keyof SignalingClientEventMap>(
    event: Event,
    payload: SignalingClientEventMap[Event],
  ): void {
    const handlers = this.eventHandlers.get(event);

    if (!handlers || handlers.size === 0) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        if (payload === undefined) {
          (handler as () => void)();
        } else {
          (handler as (value: SignalingClientEventMap[Event]) => void)(payload);
        }
      } catch (error) {
        console.error(`Error executing handler for event "${String(event)}"`, error);
      }
    });
  }

  private rejectPendingRequests(error: Error): void {
    this.pendingRequests.forEach((pending, requestId) => {
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    });
  }
}

export default SignalingClient;
