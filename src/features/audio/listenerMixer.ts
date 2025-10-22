export class ListenerAudioMixer {
  private audioContext: AudioContext;
  private sources: Map<string, MediaStreamAudioSourceNode>;
  private gains: Map<string, GainNode>;
  private masterGain: GainNode;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.sources = new Map();
    this.gains = new Map();

    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.audioContext.destination);
  }

  addAudioSource(participantId: string, stream: MediaStream, label: string): void {
    // Remove existing if present
    this.removeAudioSource(participantId);

    // Create new source and gain
    const source = this.audioContext.createMediaStreamSource(stream);
    const gain = this.audioContext.createGain();
    gain.gain.value = 1.0;

    // Connect: Source → Gain → Master
    source.connect(gain);
    gain.connect(this.masterGain);

    // Store references
    this.sources.set(participantId, source);
    this.gains.set(participantId, gain);
  }

  removeAudioSource(participantId: string): void {
    const source = this.sources.get(participantId);
    const gain = this.gains.get(participantId);

    if (source) {
      source.disconnect();
      this.sources.delete(participantId);
    }

    if (gain) {
      gain.disconnect();
      this.gains.delete(participantId);
    }
  }

  setSourceVolume(participantId: string, value: number): void {
    const gain = this.gains.get(participantId);
    if (gain) {
      gain.gain.setValueAtTime(value, this.audioContext.currentTime);
    }
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
        console.log('[ListenerAudioMixer] AudioContext resumed');
      } catch (error) {
        console.error('[ListenerAudioMixer] Failed to resume AudioContext:', error);
      }
    }
  }

  muteSource(participantId: string, muted: boolean): void {
    this.setSourceVolume(participantId, muted ? 0 : 1.0);
  }

  disconnect(): void {
    this.sources.forEach(source => source.disconnect());
    this.gains.forEach(gain => gain.disconnect());
    this.sources.clear();
    this.gains.clear();
    void this.audioContext.close();
  }
}
