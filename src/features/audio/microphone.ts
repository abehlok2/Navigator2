export type MicrophoneErrorCode =
  | 'permission-denied'
  | 'not-found'
  | 'not-readable'
  | 'security'
  | 'aborted'
  | 'unsupported'
  | 'unknown';

export class MicrophoneError extends Error {
  public readonly code: MicrophoneErrorCode;

  public readonly originalError: unknown;

  constructor(error: unknown) {
    const { message, code } = parseMicrophoneError(error);
    super(message);
    this.name = 'MicrophoneError';
    this.code = code;
    this.originalError = error;
  }
}

export interface MicrophoneConstraints extends MediaTrackConstraints {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channelCount: number;
}

export const audioConstraints: MicrophoneConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
};

export type AudioAnalyserEntry = {
  context: AudioContext;
  analyser: AnalyserNode;
  dataArray: Uint8Array;
  source: MediaStreamAudioSourceNode;
};

const audioContexts = new WeakMap<MediaStream, AudioAnalyserEntry>();

function parseMicrophoneError(error: unknown): { message: string; code: MicrophoneErrorCode } {
  if (error instanceof MicrophoneError) {
    return { message: error.message, code: error.code };
  }

  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return {
          message: 'Microphone access was denied. Please grant permission to continue.',
          code: 'permission-denied',
        };
      case 'NotFoundError':
        return {
          message: 'No microphone was found. Connect a microphone and try again.',
          code: 'not-found',
        };
      case 'NotReadableError':
        return {
          message: 'The microphone could not be read. It may be in use by another application.',
          code: 'not-readable',
        };
      case 'SecurityError':
        return {
          message: 'Microphone access is blocked by browser security settings.',
          code: 'security',
        };
      case 'AbortError':
        return {
          message: 'Microphone access was aborted. Please try again.',
          code: 'aborted',
        };
      case 'NotSupportedError':
        return {
          message: error.message || 'Microphone access is not supported in this browser.',
          code: 'unsupported',
        };
      default:
        return {
          message: error.message || 'An unknown microphone error occurred.',
          code: 'unknown',
        };
    }
  }

  if (error instanceof Error) {
    const message = error.message || 'An unknown microphone error occurred.';
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes('denied')) {
      return {
        message,
        code: 'permission-denied',
      };
    }

    return {
      message,
      code: 'unknown',
    };
  }

  if (typeof error === 'object' && error !== null) {
    const { name, message } = error as { name?: unknown; message?: unknown };
    if (name === 'UnsupportedError' || name === 'NotSupportedError') {
      return {
        message: typeof message === 'string' ? message : 'Microphone access is not supported in this browser.',
        code: 'unsupported',
      };
    }
    if (typeof message === 'string') {
      return {
        message,
        code: 'unknown',
      };
    }
  }

  return {
    message: 'Unable to access the microphone due to an unknown error.',
    code: 'unknown',
  };
}

async function ensureMediaDevices(): Promise<MediaDevices> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new MicrophoneError(
      new DOMException('Media devices are not supported in this browser.', 'NotSupportedError')
    );
  }

  return navigator.mediaDevices;
}

function createAnalyser(stream: MediaStream): AudioAnalyserEntry {
  const AudioContextClass = (
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  ) as (new () => AudioContext) | undefined;

  if (!AudioContextClass) {
    throw new MicrophoneError(
      new DOMException('Web Audio API is not supported in this browser.', 'NotSupportedError')
    );
  }

  const context = new AudioContextClass();

  if (context.state === 'suspended') {
    context.resume().catch(() => {
      /* noop */
    });
  }

  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;

  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  return { context, analyser, dataArray, source };
}

function buildAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const baseConstraints: MediaTrackConstraints = { ...audioConstraints };
  if (deviceId) {
    return {
      ...baseConstraints,
      deviceId: { exact: deviceId },
    };
  }
  return baseConstraints;
}

export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  try {
    const mediaDevices = await ensureMediaDevices();
    const constraints: MediaStreamConstraints = {
      audio: buildAudioConstraints(deviceId),
      video: false,
    };

    const stream = await mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (error) {
    throw new MicrophoneError(error);
  }
}

export function getAudioLevel(stream: MediaStream): number {
  let entry = audioContexts.get(stream);

  if (!entry) {
    entry = createAnalyser(stream);
    audioContexts.set(stream, entry);
  }

  const { analyser, dataArray, context } = entry;

  if (context.state === 'suspended') {
    context.resume().catch(() => {
      /* noop */
    });
  }

  analyser.getByteFrequencyData(dataArray as Uint8Array<ArrayBuffer>);

  const sum = dataArray.reduce((accumulator, value) => accumulator + value, 0);
  const average = sum / dataArray.length;

  return Math.round(Math.min(100, Math.max(0, (average / 255) * 100)));
}

export class AudioLevelMonitor {
  private readonly analyser: AnalyserNode;

  private readonly dataArray: Uint8Array;

  private animationFrame?: number;

  private readonly source: MediaStreamAudioSourceNode;

  constructor(audioContext: AudioContext, stream: MediaStream) {
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.6;

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    this.source = audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
  }

  getLevel(): number {
    this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);
    const sum = this.dataArray.reduce((a, b) => a + b, 0);
    return (sum / this.dataArray.length / 255) * 100;
  }

  startMonitoring(callback: (level: number) => void): void {
    this.stopMonitoring();

    const monitor = () => {
      callback(this.getLevel());
      this.animationFrame = requestAnimationFrame(monitor);
    };

    monitor();
  }

  stopMonitoring(): void {
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }
}

export async function getMicrophoneDevices(): Promise<MediaDeviceInfo[]> {
  const mediaDevices = await ensureMediaDevices();
  const devices = await mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'audioinput');
}

export function stopMicrophoneStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    track.stop();
  });

  const entry = audioContexts.get(stream);
  if (entry) {
    entry.source.disconnect();
    entry.context.close().catch(() => {
      // Ignore errors when closing already closed contexts
    });
    audioContexts.delete(stream);
  }
}
