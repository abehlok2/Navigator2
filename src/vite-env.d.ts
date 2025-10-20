/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL for API requests served by the Navigator backend.
   * Example: "https://navigator.example.com/api".
   */
  readonly VITE_API_BASE_URL: string;
  /**
   * Socket.IO server endpoint used for the application's realtime features.
   * Example: "https://navigator.example.com" or "http://localhost:4000".
   */
  readonly VITE_SOCKET_SERVER_URL: string;
  /**
   * Dedicated WebSocket endpoint powering the WebRTC signaling workflow.
   * Example: "wss://navigator.example.com/signaling".
   */
  readonly VITE_SIGNALING_SERVER_URL: string;
  /**
   * Flag that toggles verbose logging for development troubleshooting.
   * Accepts string literal booleans so it can be mapped from environment values.
   */
  readonly VITE_ENABLE_DEBUG_LOGS?: 'true' | 'false';
  /**
   * Build-time environment marker. Defaults to the mode provided by Vite but can
   * be overridden for CI pipelines.
   */
  readonly VITE_APP_ENV?: 'development' | 'production' | 'test';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.svg' {
  import type { FC, SVGProps } from 'react';
  const src: string;
  export default src;
  export const ReactComponent: FC<SVGProps<SVGSVGElement>>;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.mp3' {
  const src: string;
  export default src;
}

declare module '*.wav' {
  const src: string;
  export default src;
}

declare module '*.ogg' {
  const src: string;
  export default src;
}

declare module '*.mp4' {
  const src: string;
  export default src;
}

declare module '*.webm' {
  const src: string;
  export default src;
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.sass' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

export type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
  UserRole,
} from './types/auth';

export type {
  ConnectionStatus,
  Participant,
  ParticipantRole,
} from './types/session';

export type {
  SignalingClientEventMap,
  SignalingClientMessage,
  SignalingEventHandler,
  SignalingErrorPayload,
  SignalingMessageEnvelope,
  SignalingParticipantPayloads,
  SignalingRequestType,
  SignalingRoomAckPayloads,
  SignalingRtcPayloads,
  SignalingServerMessage,
} from './types/signaling';

export {};
