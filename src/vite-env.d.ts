/// <reference types="vite/client" />

import type {
  AudioAnalyserEntry as AudioAnalyserEntryType,
  AudioLevelMonitor as AudioLevelMonitorClass,
  MicrophoneConstraints as MicrophoneConstraintsType,
  MicrophoneError as MicrophoneErrorClass,
  MicrophoneErrorCode as MicrophoneErrorCodeType,
} from './features/audio/microphone';
import type {
  AudioPlayer as AudioPlayerClass,
  AudioPlayerEvent as AudioPlayerEventType,
} from './features/audio/player';
import type { FacilitatorAudioMixer as FacilitatorAudioMixerClass } from './features/audio/facilitatorMixer';
import type { ExplorerAudioMixer as ExplorerAudioMixerClass } from './features/audio/explorerMixer';
import type { SessionRecorder as SessionRecorderClass } from './features/audio/recorder';
import type { BackgroundPlayerProps as BackgroundPlayerPropsType } from './components/audio/BackgroundPlayer';
import type { MicrophoneControlProps as MicrophoneControlPropsType } from './components/audio/MicrophoneControl';
import type { RecordingControlProps as RecordingControlPropsType } from './components/audio/RecordingControl';
import type { AudioLevelDisplayProps as AudioLevelDisplayPropsType } from './components/audio/AudioLevelDisplay';
import type { BackgroundAudioStatusProps as BackgroundAudioStatusPropsType } from './components/audio/BackgroundAudioStatus';
import type { VolumeControlProps as VolumeControlPropsType } from './components/audio/VolumeControl';
import type { FacilitatorPlaybackState as FacilitatorPlaybackStateType } from './components/session/FacilitatorPanel';
import type {
  SessionNote as SessionNoteType,
  SessionNotesProps as SessionNotesPropsType,
} from './components/session/SessionNotes';
import type { ControlChannel as ControlChannelClass } from './features/webrtc/ControlChannel';
import type {
  ConnectionMonitor as ConnectionMonitorClass,
  ConnectionStats as ConnectionStatsType,
  ConnectionQuality as ConnectionQualityType,
} from './features/webrtc/monitor';
import type { WebRTCConfig as WebRTCConfigType } from './config/webrtc';
import type {
  IceCandidateType as IceCandidateTypeType,
  IceGatheringSummary as IceGatheringSummaryType,
  ConnectionType as ConnectionTypeType,
  ManagedPeerConnection as ManagedPeerConnectionType,
  RemoteStreamHandler as RemoteStreamHandlerType,
} from './features/webrtc/connection';
import type { ConnectionQualityProps as ConnectionQualityPropsType } from './components/session/ConnectionQuality';
import type {
  ControlMessage as ControlMessageType,
  ControlMessageType as ControlMessageTypeEnum,
  ControlMessageHandler as ControlMessageHandlerType,
  ControlMessageEventMap as ControlMessageEventMapType,
  AudioPlayMessage as AudioPlayMessageType,
  AudioPauseMessage as AudioPauseMessageType,
  AudioStopMessage as AudioStopMessageType,
  AudioProgressMessage as AudioProgressMessageType,
  AudioVolumeMessage as AudioVolumeMessageType,
  AudioFileLoadedMessage as AudioFileLoadedMessageType,
  RecordingStartMessage as RecordingStartMessageType,
  RecordingStopMessage as RecordingStopMessageType,
} from './types/control-messages';

declare global {
  type AudioAnalyserEntry = AudioAnalyserEntryType;
  type AudioLevelMonitor = AudioLevelMonitorClass;
  type MicrophoneConstraints = MicrophoneConstraintsType;
  type MicrophoneError = MicrophoneErrorClass;
  type MicrophoneErrorCode = MicrophoneErrorCodeType;
  type AudioPlayer = AudioPlayerClass;
  type AudioPlayerEvent = AudioPlayerEventType;
  type FacilitatorAudioMixer = FacilitatorAudioMixerClass;
  type ExplorerAudioMixer = ExplorerAudioMixerClass;
  type SessionRecorder = SessionRecorderClass;
  type BackgroundPlayerProps = BackgroundPlayerPropsType;
  type MicrophoneControlProps = MicrophoneControlPropsType;
  type RecordingControlProps = RecordingControlPropsType;
  type AudioLevelDisplayProps = AudioLevelDisplayPropsType;
  type BackgroundAudioStatusProps = BackgroundAudioStatusPropsType;
  type VolumeControlProps = VolumeControlPropsType;
  type FacilitatorPlaybackState = FacilitatorPlaybackStateType;
  type SessionNote = SessionNoteType;
  type SessionNotesProps = SessionNotesPropsType;
  type ControlChannel = ControlChannelClass;
  type ConnectionMonitor = ConnectionMonitorClass;
  type ConnectionStats = ConnectionStatsType;
  type ConnectionQuality = ConnectionQualityType;
  type WebRTCConfig = WebRTCConfigType;
  type IceCandidateType = IceCandidateTypeType;
  type IceGatheringSummary = IceGatheringSummaryType;
  type ConnectionType = ConnectionTypeType;
  type ManagedPeerConnection = ManagedPeerConnectionType;
  type RemoteStreamHandler = RemoteStreamHandlerType;
  type ConnectionQualityProps = ConnectionQualityPropsType;
  type ControlMessage = ControlMessageType;
  type ControlMessageTypeEnum = ControlMessageTypeEnum;
  type ControlMessageHandler<T extends ControlMessageTypeEnum = ControlMessageTypeEnum> = ControlMessageHandlerType<T>;
  type ControlMessageEventMap = ControlMessageEventMapType;
  type AudioPlayMessage = AudioPlayMessageType;
  type AudioPauseMessage = AudioPauseMessageType;
  type AudioStopMessage = AudioStopMessageType;
  type AudioProgressMessage = AudioProgressMessageType;
  type AudioVolumeMessage = AudioVolumeMessageType;
  type AudioFileLoadedMessage = AudioFileLoadedMessageType;
  type RecordingStartMessage = RecordingStartMessageType;
  type RecordingStopMessage = RecordingStopMessageType;
}

export {};

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
  LeaveRoomCallback,
  SessionOverview,
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

export type {
  AudioAnalyserEntry,
  AudioLevelMonitor,
  AudioPlayer,
  AudioPlayerEvent,
  MicrophoneConstraints,
  MicrophoneError,
  MicrophoneErrorCode,
  SessionRecorder,
} from './features/audio';

export type {
  BackgroundPlayerProps,
  MicrophoneControlProps,
  RecordingControlProps,
  AudioLevelDisplayProps,
  BackgroundAudioStatusProps,
  VolumeControlProps,
} from './components/audio';

export type { FacilitatorPlaybackState } from './components/session/FacilitatorPanel';
export type { SessionNote, SessionNotesProps } from './components/session/SessionNotes';
export type { ControlChannel } from './features/webrtc/ControlChannel';
export type {
  ConnectionMonitor,
  ConnectionStats,
  ConnectionQuality,
} from './features/webrtc/monitor';
export type { ConnectionQualityProps } from './components/session/ConnectionQuality';
export type {
  ControlMessage,
  ControlMessageType,
  ControlMessageHandler,
  ControlMessageEventMap,
  AudioPlayMessage,
  AudioPauseMessage,
  AudioStopMessage,
  AudioProgressMessage,
  AudioVolumeMessage,
  AudioFileLoadedMessage,
  RecordingStartMessage,
  RecordingStopMessage,
} from './types/control-messages';

export {};
