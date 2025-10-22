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
    console.log('[ExplorerAudioMixer] Connecting facilitator stream');
    console.log(`[ExplorerAudioMixer] Stream active: ${stream.active}, track count: ${stream.getAudioTracks().length}`);

    // Log track details
    stream.getAudioTracks().forEach((track, index) => {
      console.log(`[ExplorerAudioMixer] Track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    if (this.facilitatorSource) {
      this.facilitatorSource.disconnect();
    }

    // Verify stream has active audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error('[ExplorerAudioMixer] No audio tracks in facilitator stream');
      return;
    }

    this.facilitatorSource = this.audioContext.createMediaStreamSource(stream);
    this.facilitatorSource.connect(this.facilitatorGain);

    console.log(`[ExplorerAudioMixer] AudioContext state: ${this.audioContext.state}, sample rate: ${this.audioContext.sampleRate}`);
    console.log(`[ExplorerAudioMixer] Facilitator gain value: ${this.facilitatorGain.gain.value}`);
    console.log(`[ExplorerAudioMixer] Master gain value: ${this.masterGain.gain.value}`);
    console.log('[ExplorerAudioMixer] Successfully connected facilitator stream');

    // Attempt to resume audio context immediately
    void this.resumeAudioContext();
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
    console.log(`[ExplorerAudioMixer] Current AudioContext state: ${this.audioContext.state}`);

    if (this.audioContext.state === 'suspended') {
      try {
        console.log('[ExplorerAudioMixer] Attempting to resume AudioContext...');
        await this.audioContext.resume();
        console.log(`[ExplorerAudioMixer] AudioContext resumed successfully. New state: ${this.audioContext.state}`);
      } catch (error) {
        console.error('[ExplorerAudioMixer] Failed to resume AudioContext:', error);
      }
    } else {
      console.log('[ExplorerAudioMixer] AudioContext already running');
    }

    // Log connection status
    if (this.facilitatorSource) {
      console.log('[ExplorerAudioMixer] Facilitator source is connected');
    } else {
      console.log('[ExplorerAudioMixer] No facilitator source connected');
    }

    if (this.backgroundSource) {
      console.log('[ExplorerAudioMixer] Background source is connected');
    } else {
      console.log('[ExplorerAudioMixer] No background source connected');
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
