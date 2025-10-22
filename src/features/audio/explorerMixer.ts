import { AudioLevelMonitor } from './microphone';

class GainNodeAudioLevelMonitor extends AudioLevelMonitor {
  private readonly gainNode: GainNode;

  private readonly destination: MediaStreamAudioDestinationNode;

  constructor(audioContext: AudioContext, gainNode: GainNode) {
    const destination = audioContext.createMediaStreamDestination();
    gainNode.connect(destination);

    super(audioContext, destination.stream);

    this.gainNode = gainNode;
    this.destination = destination;
  }

  override stopMonitoring(): void {
    super.stopMonitoring();
    this.gainNode.disconnect(this.destination);
  }
}

export class ExplorerAudioMixer {
  private readonly audioContext: AudioContext;

  private facilitatorSource: MediaStreamAudioSourceNode | null = null;

  private backgroundSource: MediaStreamAudioSourceNode | null = null;

  private readonly facilitatorGain: GainNode;

  private readonly backgroundGain: GainNode;

  private readonly masterGain: GainNode;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 48000 });

    this.facilitatorGain = this.audioContext.createGain();
    this.backgroundGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();

    this.facilitatorGain.gain.value = 1.0;
    this.backgroundGain.gain.value = 0.8;
    this.masterGain.gain.value = 1.0;

    this.facilitatorGain.connect(this.masterGain);
    this.backgroundGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  connectFacilitatorStream(stream: MediaStream): void {
    if (this.facilitatorSource) {
      this.facilitatorSource.disconnect();
    }

    this.facilitatorSource = this.audioContext.createMediaStreamSource(stream);
    this.facilitatorSource.connect(this.facilitatorGain);
  }

  connectBackgroundStream(stream: MediaStream): void {
    if (this.backgroundSource) {
      this.backgroundSource.disconnect();
    }

    this.backgroundSource = this.audioContext.createMediaStreamSource(stream);
    this.backgroundSource.connect(this.backgroundGain);
  }

  setFacilitatorVolume(value: number): void {
    this.facilitatorGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  setBackgroundVolume(value: number): void {
    this.backgroundGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  setMasterVolume(value: number): void {
    this.masterGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  /**
   * Resume the audio context if it's suspended (required for browser autoplay policies)
   * Should be called when receiving audio from facilitator
   */
  async resumeAudioContext(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[ExplorerAudioMixer] AudioContext resumed');
      } catch (error) {
        console.error('[ExplorerAudioMixer] Failed to resume AudioContext:', error);
      }
    }
  }

  createLevelMonitor(sourceType: 'facilitator' | 'background'): AudioLevelMonitor {
    const gainNode = sourceType === 'facilitator' ? this.facilitatorGain : this.backgroundGain;
    return new GainNodeAudioLevelMonitor(this.audioContext, gainNode);
  }

  async disconnect(): Promise<void> {
    if (this.facilitatorSource) {
      this.facilitatorSource.disconnect();
      this.facilitatorSource = null;
    }

    if (this.backgroundSource) {
      this.backgroundSource.disconnect();
      this.backgroundSource = null;
    }

    await this.audioContext.close();
  }
}
