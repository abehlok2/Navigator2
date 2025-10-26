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
    this.backgroundGain.gain.value = 1.0;
    this.masterGain.gain.value = 1.0;

    this.facilitatorGain.connect(this.masterGain);
    this.backgroundGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  async connectFacilitatorStream(stream: MediaStream): Promise<void> {
    console.log('[ExplorerAudioMixer] Connecting facilitator stream');
    console.log(`[ExplorerAudioMixer] Stream active: ${stream.active}, track count: ${stream.getAudioTracks().length}`);

    // Verify stream has active audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error('[ExplorerAudioMixer] No audio tracks in facilitator stream');
      return;
    }

    const track = audioTracks[0];
    console.log(`[ExplorerAudioMixer] Track: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);

    // Just enable the track - that's all you can control
    track.enabled = true;

    // Disconnect old source if exists
    if (this.facilitatorSource) {
      try {
        this.facilitatorSource.disconnect();
      } catch (e) {
        // Ignore errors from disconnecting already-disconnected nodes
      }
    }

    // Resume AudioContext BEFORE creating source
    await this.resumeAudioContext();

    // Create source immediately
    this.facilitatorSource = this.audioContext.createMediaStreamSource(stream);
    this.facilitatorSource.connect(this.facilitatorGain);

    console.log(`[ExplorerAudioMixer] AudioContext state: ${this.audioContext.state}, sample rate: ${this.audioContext.sampleRate}`);
    console.log(`[ExplorerAudioMixer] Facilitator gain value: ${this.facilitatorGain.gain.value}`);
    console.log(`[ExplorerAudioMixer] Master gain value: ${this.masterGain.gain.value}`);

    // Add diagnostic analyzer to verify audio is flowing
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    this.facilitatorSource.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let consecutiveZeros = 0;

    const checkAudio = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      if (average === 0) {
        consecutiveZeros++;
        if (consecutiveZeros >= 3) {
          console.error('[ExplorerAudioMixer] ⚠️ NO AUDIO DATA for 3+ seconds', {
            trackEnabled: track.enabled,
            trackMuted: track.muted,
            trackReadyState: track.readyState,
            audioContextState: this.audioContext.state,
            facilitatorGainValue: this.facilitatorGain.gain.value,
          });
        }
      } else {
        consecutiveZeros = 0;
        console.log(`[ExplorerAudioMixer] ✓ Facilitator audio flowing: ${average.toFixed(1)} dB`);
      }
    }, 1000);

    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkAudio), 30000);

    console.log('[ExplorerAudioMixer] Successfully connected facilitator stream');
  }

  async connectBackgroundStream(stream: MediaStream): Promise<void> {
    console.log('[ExplorerAudioMixer] Connecting background stream');
    console.log(`[ExplorerAudioMixer] Stream active: ${stream.active}, track count: ${stream.getAudioTracks().length}`);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error('[ExplorerAudioMixer] No audio tracks in background stream');
      return;
    }

    const track = audioTracks[0];
    console.log(`[ExplorerAudioMixer] Background track: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);

    // Just enable the track - that's all you can control
    track.enabled = true;

    // Disconnect old source if exists
    if (this.backgroundSource) {
      try {
        this.backgroundSource.disconnect();
      } catch (e) {
        // Ignore errors
      }
    }

    // Resume AudioContext BEFORE creating source
    await this.resumeAudioContext();

    // Create source immediately
    this.backgroundSource = this.audioContext.createMediaStreamSource(stream);
    this.backgroundSource.connect(this.backgroundGain);

    // Add diagnostic analyzer to verify audio is flowing
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    this.backgroundSource.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let consecutiveZeros = 0;

    const checkAudio = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      if (average === 0) {
        consecutiveZeros++;
        if (consecutiveZeros >= 3) {
          console.error('[ExplorerAudioMixer] ⚠️ NO BACKGROUND AUDIO DATA for 3+ seconds', {
            trackEnabled: track.enabled,
            trackMuted: track.muted,
            trackReadyState: track.readyState,
            audioContextState: this.audioContext.state,
            backgroundGainValue: this.backgroundGain.gain.value,
          });
        }
      } else {
        consecutiveZeros = 0;
        console.log(`[ExplorerAudioMixer] ✓ Background audio flowing: ${average.toFixed(1)} dB`);
      }
    }, 1000);

    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkAudio), 30000);

    console.log('[ExplorerAudioMixer] Background stream connected successfully');
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
