type AudioAnalyserEntry = {
  context: AudioContext;
  analyser: AnalyserNode;
  dataArray: Uint8Array;
};

const audioContexts = new WeakMap<MediaStream, AudioAnalyserEntry>();

async function ensureMediaDevices(): Promise<MediaDevices> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Media devices are not supported in this browser.');
  }
  return navigator.mediaDevices;
}

function createAnalyser(stream: MediaStream): AudioAnalyserEntry {
  const AudioContextClass = (
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  ) as (new () => AudioContext) | undefined;

  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const context = new AudioContextClass();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);

  return { context, analyser, dataArray };
}

export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  const mediaDevices = await ensureMediaDevices();
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? {
          deviceId: { exact: deviceId },
        }
      : true,
    video: false,
  };

  const stream = await mediaDevices.getUserMedia(constraints);
  return stream;
}

export function getAudioLevel(stream: MediaStream): number {
  let entry = audioContexts.get(stream);

  if (!entry) {
    entry = createAnalyser(stream);
    audioContexts.set(stream, entry);
  }

  const { analyser, dataArray } = entry;
  analyser.getByteTimeDomainData(dataArray as Uint8Array<ArrayBuffer>);

  let sumSquares = 0;
  for (let i = 0; i < dataArray.length; i += 1) {
    const value = (dataArray[i] - 128) / 128;
    sumSquares += value * value;
  }

  const rms = Math.sqrt(sumSquares / dataArray.length);
  const level = Math.min(100, Math.max(0, Math.round(rms * 100)));

  return level;
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
    entry.context.close().catch(() => {
      // Ignore errors when closing already closed contexts
    });
    audioContexts.delete(stream);
  }
}
