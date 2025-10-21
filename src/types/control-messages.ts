/**
 * Control message types for session coordination between facilitator and explorers
 */

/**
 * Audio control message types
 */
export type AudioControlMessageType =
  | 'audio:play'
  | 'audio:pause'
  | 'audio:stop'
  | 'audio:progress'
  | 'audio:volume'
  | 'audio:file-loaded';

/**
 * Recording control message types
 */
export type RecordingControlMessageType =
  | 'recording:start'
  | 'recording:stop';

/**
 * Channel lifecycle message types
 */
export type ChannelLifecycleMessageType =
  | 'channel:open'
  | 'channel:close'
  | 'channel:error';

/**
 * Latency measurement message types
 */
export type LatencyMessageType =
  | 'latency:ping'
  | 'latency:pong';

/**
 * All control message types
 */
export type ControlMessageType =
  | AudioControlMessageType
  | RecordingControlMessageType
  | ChannelLifecycleMessageType
  | LatencyMessageType;

/**
 * Base control message structure
 */
export interface BaseControlMessage<T extends ControlMessageType = ControlMessageType> {
  type: T;
  timestamp: number;
}

/**
 * Audio playback control messages
 */
export interface AudioPlayMessage extends BaseControlMessage<'audio:play'> {
  fileName?: string;
}

export interface AudioPauseMessage extends BaseControlMessage<'audio:pause'> {
  currentTime?: number;
}

export interface AudioStopMessage extends BaseControlMessage<'audio:stop'> {
  // No additional data needed
}

export interface AudioProgressMessage extends BaseControlMessage<'audio:progress'> {
  currentTime: number;
  duration: number;
}

export interface AudioVolumeMessage extends BaseControlMessage<'audio:volume'> {
  volume: number; // 0-1
}

export interface AudioFileLoadedMessage extends BaseControlMessage<'audio:file-loaded'> {
  fileName: string;
  duration: number;
}

/**
 * Recording control messages
 */
export interface RecordingStartMessage extends BaseControlMessage<'recording:start'> {
  // No additional data needed
}

export interface RecordingStopMessage extends BaseControlMessage<'recording:stop'> {
  // No additional data needed
}

/**
 * Channel lifecycle messages
 */
export interface ChannelOpenMessage extends BaseControlMessage<'channel:open'> {
  // No additional data needed
}

export interface ChannelCloseMessage extends BaseControlMessage<'channel:close'> {
  // No additional data needed
}

export interface ChannelErrorMessage extends BaseControlMessage<'channel:error'> {
  // No additional data needed
}

/**
 * Latency measurement messages
 */
export interface LatencyPingMessage extends BaseControlMessage<'latency:ping'> {
  pingId: string;
}

export interface LatencyPongMessage extends BaseControlMessage<'latency:pong'> {
  pingId: string;
}

/**
 * Union of all possible control messages
 */
export type ControlMessage =
  | AudioPlayMessage
  | AudioPauseMessage
  | AudioStopMessage
  | AudioProgressMessage
  | AudioVolumeMessage
  | AudioFileLoadedMessage
  | RecordingStartMessage
  | RecordingStopMessage
  | ChannelOpenMessage
  | ChannelCloseMessage
  | ChannelErrorMessage
  | LatencyPingMessage
  | LatencyPongMessage;

/**
 * Type guard to check if a message is a valid control message
 */
export function isControlMessage(value: unknown): value is ControlMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Partial<ControlMessage>;

  return (
    typeof message.type === 'string' &&
    typeof message.timestamp === 'number' &&
    (message.type.startsWith('audio:') ||
     message.type.startsWith('recording:') ||
     message.type.startsWith('channel:') ||
     message.type.startsWith('latency:'))
  );
}

/**
 * Extract payload type for a specific message type
 */
export type ControlMessagePayload<T extends ControlMessageType> = Extract<
  ControlMessage,
  { type: T }
>;

/**
 * Control message handler function type
 */
export type ControlMessageHandler<T extends ControlMessageType = ControlMessageType> = (
  message: ControlMessagePayload<T>
) => void;

/**
 * Map of event types to their handler functions
 */
export type ControlMessageEventMap = {
  [K in ControlMessageType]: ControlMessagePayload<K>;
};
