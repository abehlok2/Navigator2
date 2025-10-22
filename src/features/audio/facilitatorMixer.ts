export class FacilitatorAudioMixer {
  private audioContext: AudioContext;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private explorerMicSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private explorerMicGains: Map<string, GainNode> = new Map();
  private backgroundSource: MediaElementAudioSourceNode | null = null;
  private backgroundAudioElement: HTMLAudioElement | null = null;
  private micGain: GainNode;
  private backgroundGain: GainNode;
  private masterGain: GainNode;
  private destination: MediaStreamAudioDestinationNode;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 48000 });

    this.micGain = this.audioContext.createGain();
    this.backgroundGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.destination = this.audioContext.createMediaStreamDestination();

    this.micGain.gain.value = 1.0;
    this.backgroundGain.gain.value = 0.7;
    this.masterGain.gain.value = 1.0;

    this.micGain.connect(this.masterGain);
    this.backgroundGain.connect(this.masterGain);
    this.masterGain.connect(this.destination);
  }

  connectMicrophone(micStream: MediaStream): void {
    if (this.micSource) {
      this.micSource.disconnect();
    }

    this.micSource = this.audioContext.createMediaStreamSource(micStream);
    this.micSource.connect(this.micGain);
  }

  /**
   * Connect an explorer's microphone to the mixer
   */
  connectExplorerMicrophone(participantId: string, micStream: MediaStream): void {
    // Remove existing connection if present
    this.disconnectExplorerMicrophone(participantId);

    // Create new source and gain for this explorer
    const source = this.audioContext.createMediaStreamSource(micStream);
    const gain = this.audioContext.createGain();
    gain.gain.value = 1.0;

    // Connect: Source → Gain → Master
    source.connect(gain);
    gain.connect(this.masterGain);

    // Store references
    this.explorerMicSources.set(participantId, source);
    this.explorerMicGains.set(participantId, gain);

    console.log(`[FacilitatorAudioMixer] Connected explorer microphone: ${participantId}`);
  }

  /**
   * Disconnect an explorer's microphone from the mixer
   */
  disconnectExplorerMicrophone(participantId: string): void {
    const source = this.explorerMicSources.get(participantId);
    const gain = this.explorerMicGains.get(participantId);

    if (source) {
      source.disconnect();
      this.explorerMicSources.delete(participantId);
    }

    if (gain) {
      gain.disconnect();
      this.explorerMicGains.delete(participantId);
    }

    if (source || gain) {
      console.log(`[FacilitatorAudioMixer] Disconnected explorer microphone: ${participantId}`);
    }
  }

  /**
   * Set volume for a specific explorer's microphone
   */
  setExplorerMicVolume(participantId: string, value: number): void {
    const gain = this.explorerMicGains.get(participantId);
    if (gain) {
      gain.gain.setValueAtTime(value, this.audioContext.currentTime);
    }
  }

  connectBackgroundAudio(audioElement: HTMLAudioElement): void {
    // If the audio element hasn't changed and we already have a source, just ensure it's connected
    if (this.backgroundAudioElement === audioElement && this.backgroundSource) {
      // Already connected to this audio element, no need to recreate the source
      // Just ensure it's connected to the background gain
      try {
        this.backgroundSource.connect(this.backgroundGain);
      } catch (error) {
        // Already connected, ignore the error
      }
      return;
    }

    // Disconnect previous source if it exists
    if (this.backgroundSource) {
      this.backgroundSource.disconnect();
      this.backgroundSource = null;
    }

    // Create new source for the new audio element
    // Note: createMediaElementSource can only be called once per HTMLAudioElement
    this.backgroundSource = this.audioContext.createMediaElementSource(audioElement);
    this.backgroundSource.connect(this.backgroundGain);
    this.backgroundAudioElement = audioElement;
  }

  getMixedStream(): MediaStream {
    return this.destination.stream;
  }

  setMicVolume(value: number): void {
    this.micGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  setBackgroundVolume(value: number): void {
    this.backgroundGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  setMasterVolume(value: number): void {
    this.masterGain.gain.setValueAtTime(value, this.audioContext.currentTime);
  }

  fadeBackgroundVolume(targetValue: number, duration: number): void {
    const now = this.audioContext.currentTime;
    this.backgroundGain.gain.cancelScheduledValues(now);
    this.backgroundGain.gain.setValueAtTime(this.backgroundGain.gain.value, now);
    this.backgroundGain.gain.linearRampToValueAtTime(targetValue, now + duration);
  }

  disconnect(): void {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    // Disconnect all explorer microphones
    this.explorerMicSources.forEach((source) => source.disconnect());
    this.explorerMicGains.forEach((gain) => gain.disconnect());
    this.explorerMicSources.clear();
    this.explorerMicGains.clear();

    if (this.backgroundSource) {
      this.backgroundSource.disconnect();
      this.backgroundSource = null;
    }
    this.backgroundAudioElement = null;

    void this.audioContext.close();
  }
}
