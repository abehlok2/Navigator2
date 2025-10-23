export class FacilitatorAudioMixer {
  private audioContext: AudioContext;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private explorerMicSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private explorerMicGains: Map<string, GainNode> = new Map();
  private backgroundSource: MediaElementAudioSourceNode | null = null;
  private backgroundAudioElement: HTMLAudioElement | null = null;
  private nextBackgroundSource: MediaElementAudioSourceNode | null = null;
  private nextBackgroundAudioElement: HTMLAudioElement | null = null;
  private micGain: GainNode;
  private backgroundGain: GainNode;
  private nextBackgroundGain: GainNode;
  private masterGain: GainNode;
  private destination: MediaStreamAudioDestinationNode;
  private facilitatorDestination: MediaStreamAudioDestinationNode;
  private backgroundDestination: MediaStreamAudioDestinationNode;
  private isCrossfading: boolean = false;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 48000 });

    this.micGain = this.audioContext.createGain();
    this.backgroundGain = this.audioContext.createGain();
    this.nextBackgroundGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.facilitatorDestination = this.audioContext.createMediaStreamDestination();
    this.backgroundDestination = this.audioContext.createMediaStreamDestination();

    this.micGain.gain.value = 1.0;
    this.backgroundGain.gain.value = 0.7;
    this.nextBackgroundGain.gain.value = 0.0; // Start at 0 for next track
    this.masterGain.gain.value = 1.0;

    // Connect mic and background to their individual destinations
    this.micGain.connect(this.facilitatorDestination);
    this.backgroundGain.connect(this.backgroundDestination);
    this.nextBackgroundGain.connect(this.backgroundDestination);

    // Also connect to master for local playback
    this.micGain.connect(this.masterGain);
    this.backgroundGain.connect(this.masterGain);
    this.nextBackgroundGain.connect(this.masterGain);

    // Connect to both broadcast destination (for peers) and local speakers (for facilitator to hear)
    this.masterGain.connect(this.destination);
    this.masterGain.connect(this.audioContext.destination);
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
    console.log('[FacilitatorAudioMixer] ========== CONNECTING BACKGROUND AUDIO ==========');
    console.log('[FacilitatorAudioMixer] Audio element provided:', !!audioElement);
    console.log('[FacilitatorAudioMixer] Audio element ready state:', audioElement?.readyState);
    console.log('[FacilitatorAudioMixer] Audio element duration:', audioElement?.duration);
    console.log('[FacilitatorAudioMixer] Audio element paused:', audioElement?.paused);
    console.log('[FacilitatorAudioMixer] Same audio element as before:', this.backgroundAudioElement === audioElement);
    console.log('[FacilitatorAudioMixer] Existing background source:', !!this.backgroundSource);

    // If the audio element hasn't changed and we already have a source, just ensure it's connected
    if (this.backgroundAudioElement === audioElement && this.backgroundSource) {
      // Already connected to this audio element, no need to recreate the source
      // Just ensure it's connected to the background gain
      console.log('[FacilitatorAudioMixer] Reusing existing audio source');
      try {
        this.backgroundSource.connect(this.backgroundGain);
        console.log('[FacilitatorAudioMixer] Reconnected existing source (or already connected)');
      } catch (error) {
        // Already connected, ignore the error
        console.log('[FacilitatorAudioMixer] Source already connected');
      }
      return;
    }

    // Disconnect previous source if it exists
    if (this.backgroundSource) {
      console.log('[FacilitatorAudioMixer] Disconnecting previous background source');
      this.backgroundSource.disconnect();
      this.backgroundSource = null;
    }

    // Create new source for the new audio element
    // Note: createMediaElementSource can only be called once per HTMLAudioElement
    console.log('[FacilitatorAudioMixer] Creating new MediaElementSource');
    console.log('[FacilitatorAudioMixer] AudioContext state:', this.audioContext.state);

    this.backgroundSource = this.audioContext.createMediaElementSource(audioElement);
    this.backgroundSource.connect(this.backgroundGain);
    this.backgroundAudioElement = audioElement;

    console.log('[FacilitatorAudioMixer] Background audio connected successfully');
    console.log('[FacilitatorAudioMixer] Background gain value:', this.backgroundGain.gain.value);
    console.log('[FacilitatorAudioMixer] Master gain value:', this.masterGain.gain.value);
    console.log('[FacilitatorAudioMixer] ========== BACKGROUND AUDIO CONNECTION COMPLETE ==========');
  }

  /**
   * Resume the audio context if it's suspended (required for browser autoplay policies)
   * Should be called on user interaction (e.g., clicking play button)
   */
  async resumeAudioContext(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[FacilitatorAudioMixer] AudioContext resumed');
      } catch (error) {
        console.error('[FacilitatorAudioMixer] Failed to resume AudioContext:', error);
      }
    }
  }

  getMixedStream(): MediaStream {
    const stream = this.destination.stream;
    console.log('[FacilitatorAudioMixer] Getting mixed stream');
    console.log('[FacilitatorAudioMixer] Stream active:', stream.active);
    console.log('[FacilitatorAudioMixer] Stream tracks:', stream.getTracks().length);

    // Ensure all tracks are enabled
    stream.getTracks().forEach((track, index) => {
      if (!track.enabled) {
        console.log(`[FacilitatorAudioMixer] Enabling track ${index}`);
        track.enabled = true;
      }
      console.log(`[FacilitatorAudioMixer] Track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    return stream;
  }

  /**
   * Get a stream containing only the facilitator's microphone
   * (for broadcasting separately from background audio)
   */
  getFacilitatorStream(): MediaStream {
    const stream = this.facilitatorDestination.stream;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.contentHint = 'speech';
    }

    console.log('[FacilitatorAudioMixer] Getting facilitator stream');
    console.log('[FacilitatorAudioMixer] Stream active:', stream.active);
    console.log('[FacilitatorAudioMixer] Stream tracks:', stream.getTracks().length);

    // Ensure all tracks are enabled
    stream.getTracks().forEach((track, index) => {
      if (!track.enabled) {
        console.log(`[FacilitatorAudioMixer] Enabling facilitator track ${index}`);
        track.enabled = true;
      }
      console.log(`[FacilitatorAudioMixer] Facilitator Track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    return stream;
  }

  /**
   * Get a stream containing only the background audio
   * (for broadcasting separately from microphone)
   */
  getBackgroundStream(): MediaStream | null {
    if (!this.backgroundSource) {
      console.log('[FacilitatorAudioMixer] No background source available');
      return null;
    }

    const stream = this.backgroundDestination.stream;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.contentHint = 'music';
    }

    console.log('[FacilitatorAudioMixer] Getting background stream');
    console.log('[FacilitatorAudioMixer] Stream active:', stream.active);
    console.log('[FacilitatorAudioMixer] Stream tracks:', stream.getTracks().length);

    // Ensure all tracks are enabled
    stream.getTracks().forEach((track, index) => {
      if (!track.enabled) {
        console.log(`[FacilitatorAudioMixer] Enabling background track ${index}`);
        track.enabled = true;
      }
      console.log(`[FacilitatorAudioMixer] Background Track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    return stream;
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

  /**
   * Connect the next audio track for crossfading
   */
  connectNextBackgroundAudio(audioElement: HTMLAudioElement): void {
    console.log('[FacilitatorAudioMixer] ========== CONNECTING NEXT BACKGROUND AUDIO ==========');
    console.log('[FacilitatorAudioMixer] Next audio element provided:', !!audioElement);

    // Disconnect previous next source if it exists
    if (this.nextBackgroundSource) {
      console.log('[FacilitatorAudioMixer] Disconnecting previous next background source');
      this.nextBackgroundSource.disconnect();
      this.nextBackgroundSource = null;
    }

    // Create new source for the next audio element
    console.log('[FacilitatorAudioMixer] Creating new MediaElementSource for next track');
    this.nextBackgroundSource = this.audioContext.createMediaElementSource(audioElement);
    this.nextBackgroundSource.connect(this.nextBackgroundGain);
    this.nextBackgroundAudioElement = audioElement;

    // Set gain to 0 initially (will be faded in during crossfade)
    this.nextBackgroundGain.gain.setValueAtTime(0, this.audioContext.currentTime);

    console.log('[FacilitatorAudioMixer] Next background audio connected successfully');
    console.log('[FacilitatorAudioMixer] ========== NEXT BACKGROUND AUDIO CONNECTION COMPLETE ==========');
  }

  /**
   * Perform a crossfade from the current track to the next track
   * @param targetVolume The target volume for the next track (0-1)
   * @param duration The duration of the crossfade in seconds
   * @returns Promise that resolves when crossfade is complete
   */
  async performCrossfade(targetVolume: number, duration: number): Promise<void> {
    if (!this.nextBackgroundSource || !this.nextBackgroundAudioElement) {
      throw new Error('No next track loaded for crossfade');
    }

    if (this.isCrossfading) {
      console.warn('[FacilitatorAudioMixer] Crossfade already in progress');
      return;
    }

    this.isCrossfading = true;
    console.log('[FacilitatorAudioMixer] ========== STARTING CROSSFADE ==========');
    console.log('[FacilitatorAudioMixer] Duration:', duration, 'seconds');
    console.log('[FacilitatorAudioMixer] Target volume:', targetVolume);

    const now = this.audioContext.currentTime;

    // Start playing the next track
    try {
      await this.nextBackgroundAudioElement.play();
      console.log('[FacilitatorAudioMixer] Next track playback started');
    } catch (error) {
      console.error('[FacilitatorAudioMixer] Failed to start next track playback:', error);
      this.isCrossfading = false;
      throw error;
    }

    // Fade out current track
    this.backgroundGain.gain.cancelScheduledValues(now);
    this.backgroundGain.gain.setValueAtTime(this.backgroundGain.gain.value, now);
    this.backgroundGain.gain.linearRampToValueAtTime(0, now + duration);

    // Fade in next track
    this.nextBackgroundGain.gain.cancelScheduledValues(now);
    this.nextBackgroundGain.gain.setValueAtTime(0, now);
    this.nextBackgroundGain.gain.linearRampToValueAtTime(targetVolume, now + duration);

    // Wait for crossfade to complete
    await new Promise(resolve => setTimeout(resolve, duration * 1000));

    // Stop the old track
    if (this.backgroundAudioElement) {
      this.backgroundAudioElement.pause();
      this.backgroundAudioElement.currentTime = 0;
    }

    // Swap: next becomes current
    if (this.backgroundSource) {
      this.backgroundSource.disconnect();
    }
    this.backgroundSource = this.nextBackgroundSource;
    this.backgroundAudioElement = this.nextBackgroundAudioElement;

    // Transfer gain value
    this.backgroundGain.gain.setValueAtTime(targetVolume, this.audioContext.currentTime);

    // Clear next track references
    this.nextBackgroundSource = null;
    this.nextBackgroundAudioElement = null;
    this.nextBackgroundGain.gain.setValueAtTime(0, this.audioContext.currentTime);

    this.isCrossfading = false;
    console.log('[FacilitatorAudioMixer] ========== CROSSFADE COMPLETE ==========');
  }

  /**
   * Check if a crossfade is currently in progress
   */
  getIsCrossfading(): boolean {
    return this.isCrossfading;
  }

  /**
   * Get the next background audio element (for UI display purposes)
   */
  getNextBackgroundAudioElement(): HTMLAudioElement | null {
    return this.nextBackgroundAudioElement;
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

    if (this.nextBackgroundSource) {
      this.nextBackgroundSource.disconnect();
      this.nextBackgroundSource = null;
    }
    this.nextBackgroundAudioElement = null;

    void this.audioContext.close();
  }
}
