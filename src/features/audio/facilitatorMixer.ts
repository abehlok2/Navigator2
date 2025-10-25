type DebugContext = 'internal' | 'dispatch';

interface DebugMonitorState {
  analyser: AnalyserNode;
  buffer: Float32Array<ArrayBuffer>;
  silentCount: number;
  label: string;
  threshold: number;
  lastLoggedState: 'active' | 'silent' | null;
  observations: number;
  context: DebugContext;
  dispatchTarget?: 'facilitator' | 'background';
}

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
  private silentOscillator: OscillatorNode | null = null;
  private silentGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode;
  private micAnalyser: AnalyserNode;
  private backgroundAnalyser: AnalyserNode;
  private facilitatorDestinationAnalyser: AnalyserNode;
  private backgroundDestinationAnalyser: AnalyserNode;
  private backgroundFlowSourceBuffer: Float32Array;
  private backgroundFlowDispatchBuffer: Float32Array;
  private backgroundFlowSnapshotTimeout: number | null = null;
  private backgroundFlowInterval: number | null = null;
  private debugStates!: Record<'master' | 'mic' | 'background' | 'facilitatorDest' | 'backgroundDest', DebugMonitorState>;
  private debugMonitorInterval: number | null = null;
  private trackDiagnostics: Array<{
    track: MediaStreamTrack;
    handlers: {
      mute: () => void;
      unmute: () => void;
      ended: () => void;
    };
  }> = [];
  private readonly runDebugMonitor = () => {
    const states = Object.values(this.debugStates) as DebugMonitorState[];
    states.forEach((state) => this.updateDebugState(state));
  };

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 48000 });

    this.micGain = this.audioContext.createGain();
    this.backgroundGain = this.audioContext.createGain();
    this.nextBackgroundGain = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.facilitatorDestination = this.audioContext.createMediaStreamDestination();
    this.backgroundDestination = this.audioContext.createMediaStreamDestination();

    this.masterAnalyser = this.audioContext.createAnalyser();
    this.micAnalyser = this.audioContext.createAnalyser();
    this.backgroundAnalyser = this.audioContext.createAnalyser();
    this.facilitatorDestinationAnalyser = this.audioContext.createAnalyser();
    this.backgroundDestinationAnalyser = this.audioContext.createAnalyser();

    this.backgroundFlowSourceBuffer = new Float32Array(this.backgroundAnalyser.fftSize);
    this.backgroundFlowDispatchBuffer = new Float32Array(this.backgroundDestinationAnalyser.fftSize);

    this.masterAnalyser.fftSize = 1024;
    this.micAnalyser.fftSize = 1024;
    this.backgroundAnalyser.fftSize = 1024;
    this.facilitatorDestinationAnalyser.fftSize = 1024;
    this.backgroundDestinationAnalyser.fftSize = 1024;

    this.micGain.gain.value = 1.0;
    this.backgroundGain.gain.value = 0.7;
    this.nextBackgroundGain.gain.value = 0.0; // Start at 0 for next track
    this.masterGain.gain.value = 1.0;

    // Connect mic and background to their individual destinations
    //
    const preDestinationAnalyzer = this.audioContext.createAnalyser();
    preDestinationAnalyzer.fftSize = 256;
    this.micGain.connect(this.facilitatorDestination);
    this.backgroundGain.connect(this.backgroundDestination);
    this.nextBackgroundGain.connect(this.backgroundDestination);
    this.backgroundGain.connect(preDestinationAnalyzer)
    this.micGain.connect(preDestinationAnalyzer)

    // Also connect to master for local playback
    this.micGain.connect(this.masterGain);
    this.backgroundGain.connect(this.masterGain);
    this.nextBackgroundGain.connect(this.masterGain);

    this.micGain.connect(this.micAnalyser);
    this.backgroundGain.connect(this.backgroundAnalyser);
    this.masterGain.connect(this.masterAnalyser);

    // Connect analysers to monitor destination inputs
    this.micGain.connect(this.facilitatorDestinationAnalyser);
    this.backgroundGain.connect(this.backgroundDestinationAnalyser);

    // Connect to both broadcast destination (for peers) and local speakers (for facilitator to hear)
    this.masterGain.connect(this.destination);
    this.masterGain.connect(this.audioContext.destination);

    // ⚠️ CRITICAL: Create constant audio source to ensure MediaStreamDestination nodes process samples
    // MediaStreamDestination nodes need continuous sample flow to properly capture audio
    // Using ConstantSourceNode instead of OscillatorNode ensures proper sample generation
    const constantSource = this.audioContext.createConstantSource();
    this.silentGain = this.audioContext.createGain();

    // Configure constant source (offset=0 produces DC signal, gain=0.0001 makes it effectively inaudible)
    constantSource.offset.value = 0;
    this.silentGain.gain.value = 0.0001; // Very low but non-zero to ensure sample flow

    // Connect to all three destinations to keep them actively processing samples
    constantSource.connect(this.silentGain);
    this.silentGain.connect(this.facilitatorDestination);
    this.silentGain.connect(this.backgroundDestination);
    this.silentGain.connect(this.destination);

    // Start the constant source immediately
    constantSource.start();
    this.silentOscillator = constantSource as unknown as OscillatorNode; // Store reference for cleanup
    console.log('[FacilitatorAudioMixer] Constant source started to ensure MediaStreamDestination sample flow');

    this.attachDestinationTrackDiagnostics(this.facilitatorDestination, 'facilitator');
    this.attachDestinationTrackDiagnostics(this.backgroundDestination, 'background');

    this.debugStates = {
      master: this.createDebugState('Master mix', this.masterAnalyser, 0.0005),
      mic: this.createDebugState('Facilitator microphone', this.micAnalyser, 0.0005),
      background: this.createDebugState('Background audio', this.backgroundAnalyser, 0.0003),
      facilitatorDest: this.createDebugState(
        'Facilitator destination INPUT',
        this.facilitatorDestinationAnalyser,
        0.0005,
        'dispatch',
        'facilitator',
      ),
      backgroundDest: this.createDebugState(
        'Background destination INPUT',
        this.backgroundDestinationAnalyser,
        0.0003,
        'dispatch',
        'background',
      ),
    };

    this.startDebugMonitoring();
  }

  connectMicrophone(micStream: MediaStream): void {
    console.log('[FacilitatorAudioMixer] ========== CONNECTING MICROPHONE ==========');
    console.log('[FacilitatorAudioMixer] AudioContext state:', this.audioContext.state);
    console.log('[FacilitatorAudioMixer] Microphone stream active:', micStream.active);
    console.log('[FacilitatorAudioMixer] Microphone stream id:', micStream.id);

    const tracks = micStream.getAudioTracks();
    console.log('[FacilitatorAudioMixer] Audio tracks count:', tracks.length);
    tracks.forEach((track, index) => {
      console.log(`[FacilitatorAudioMixer] Track ${index}:`, {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        contentHint: track.contentHint,
      });
    });

    if (this.micSource) {
      console.log('[FacilitatorAudioMixer] Disconnecting previous mic source');
      this.micSource.disconnect();
    }

    console.log('[FacilitatorAudioMixer] Creating MediaStreamSource from microphone');
    this.micSource = this.audioContext.createMediaStreamSource(micStream);

    // ⚠️ DIAGNOSTIC: Verify the MediaStreamSource is actually receiving samples
    const diagnosticAnalyser = this.audioContext.createAnalyser();
    diagnosticAnalyser.fftSize = 1024;
    this.micSource.connect(diagnosticAnalyser);

    // Check for audio samples after a short delay
    setTimeout(() => {
      const buffer = new Float32Array(diagnosticAnalyser.fftSize);
      diagnosticAnalyser.getFloatTimeDomainData(buffer);

      let sumSquares = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < buffer.length; i += 1) {
        const sample = buffer[i];
        sumSquares += sample * sample;
        if (sample < min) {
          min = sample;
        }
        if (sample > max) {
          max = sample;
        }
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      console.log('[FacilitatorAudioMixer] 🔍 MICROPHONE SOURCE DIAGNOSTIC:');
      console.log('[FacilitatorAudioMixer]   RMS level:', rms.toFixed(6));
      console.log('[FacilitatorAudioMixer]   Sample range:', { min, max });

      if (rms < 0.00001) {
        console.error('❌ MICROPHONE SOURCE IS SILENT!');
        console.error('[FacilitatorAudioMixer] ❌ This means the microphone MediaStream is not producing audio data.');
        console.error('[FacilitatorAudioMixer] ❌ Possible causes:');
        console.error('[FacilitatorAudioMixer]    - Microphone is muted at OS level');
        console.error('[FacilitatorAudioMixer]    - Microphone permission not properly granted');
        console.error('[FacilitatorAudioMixer]    - Wrong audio input device selected');
        console.error('[FacilitatorAudioMixer]    - AudioContext suspended or not running');
      } else {
        console.log('✅ Microphone source is producing audio samples!');
      }

      diagnosticAnalyser.disconnect();
    }, 500);

    console.log('[FacilitatorAudioMixer] Connecting: micSource → micGain → facilitatorDestination');
    this.micSource.connect(this.micGain);

    console.log('[FacilitatorAudioMixer] Current gain values:');
    console.log('[FacilitatorAudioMixer]   micGain:', this.micGain.gain.value);
    console.log('[FacilitatorAudioMixer]   masterGain:', this.masterGain.gain.value);
    console.log('[FacilitatorAudioMixer] ========== MICROPHONE CONNECTION COMPLETE ==========');
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

    this.startBackgroundFlowDiagnostics();
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
    console.log('[FacilitatorAudioMixer] ========== GETTING FACILITATOR STREAM ==========');
    console.log('[FacilitatorAudioMixer] AudioContext state:', this.audioContext.state);
    console.log('[FacilitatorAudioMixer] Microphone source connected:', !!this.micSource);
    console.log('[FacilitatorAudioMixer] MicGain value:', this.micGain.gain.value);

    const stream = this.facilitatorDestination.stream;
    console.log('[FacilitatorAudioMixer] Destination stream id:', stream.id);
    console.log('[FacilitatorAudioMixer] Destination stream active:', stream.active);
    console.log('[FacilitatorAudioMixer] Destination stream tracks:', stream.getTracks().length);

    const track = stream.getAudioTracks()[0];
    if (track) {
      console.log('[FacilitatorAudioMixer] Output track details:', {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        contentHint: track.contentHint,
      });

      track.contentHint = 'speech';
      // ⚠️ CRITICAL: Ensure track is enabled (defensive measure)
      track.enabled = true;

      console.log('[FacilitatorAudioMixer] Track contentHint set to: speech');
      console.log('[FacilitatorAudioMixer] Track enabled set to: true');
    } else {
      console.error('[FacilitatorAudioMixer] ❌ NO AUDIO TRACK IN FACILITATOR DESTINATION STREAM!');
    }

    // Ensure all tracks are enabled
    stream.getTracks().forEach((track, index) => {
      if (!track.enabled) {
        console.log(`[FacilitatorAudioMixer] Enabling facilitator track ${index}`);
        track.enabled = true;
      }
      console.log(`[FacilitatorAudioMixer] Facilitator Track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    console.log('[FacilitatorAudioMixer] ========== FACILITATOR STREAM READY ==========');
    return stream;
  }

  /**
   * Get a stream containing only the background audio
   * (for broadcasting separately from microphone)
   */
  getBackgroundStream(): MediaStream | null {
    console.log('[FacilitatorAudioMixer] ========== GETTING BACKGROUND STREAM ==========');

    if (!this.backgroundSource) {
      console.log('[FacilitatorAudioMixer] No background source available');
      return null;
    }

    console.log('[FacilitatorAudioMixer] AudioContext state:', this.audioContext.state);
    console.log('[FacilitatorAudioMixer] Background source connected:', !!this.backgroundSource);
    console.log('[FacilitatorAudioMixer] BackgroundGain value:', this.backgroundGain.gain.value);
    console.log('[FacilitatorAudioMixer] Background audio element:', {
      paused: this.backgroundAudioElement?.paused,
      currentTime: this.backgroundAudioElement?.currentTime,
      duration: this.backgroundAudioElement?.duration,
      volume: this.backgroundAudioElement?.volume,
      muted: this.backgroundAudioElement?.muted,
    });

    const stream = this.backgroundDestination.stream;
    console.log('[FacilitatorAudioMixer] Destination stream id:', stream.id);
    console.log('[FacilitatorAudioMixer] Destination stream active:', stream.active);
    console.log('[FacilitatorAudioMixer] Destination stream tracks:', stream.getTracks().length);

    const track = stream.getAudioTracks()[0];
    if (track) {
      console.log('[FacilitatorAudioMixer] Output track details:', {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        contentHint: track.contentHint,
      });

      track.contentHint = 'music';
      // ⚠️ CRITICAL: Ensure track is enabled (defensive measure)
      track.enabled = true;

      console.log('[FacilitatorAudioMixer] Track contentHint set to: music');
      console.log('[FacilitatorAudioMixer] Track enabled set to: true');
    } else {
      console.error('[FacilitatorAudioMixer] ❌ NO AUDIO TRACK IN BACKGROUND DESTINATION STREAM!');
    }

    // Ensure all tracks are enabled
    stream.getTracks().forEach((track, index) => {
      if (!track.enabled) {
        console.log(`[FacilitatorAudioMixer] Enabling background track ${index}`);
        track.enabled = true;
      }
      console.log(`[FacilitatorAudioMixer] Background Track ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });

    console.log('[FacilitatorAudioMixer] ========== BACKGROUND STREAM READY ==========');
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

    this.startBackgroundFlowDiagnostics();
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

  private createDebugState(
    label: string,
    analyser: AnalyserNode,
    threshold: number,
    context: DebugContext = 'internal',
    dispatchTarget?: 'facilitator' | 'background',
  ): DebugMonitorState {
    const buffer = new Float32Array<ArrayBuffer>(
      new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
    );

    return {
      analyser,
      buffer,
      silentCount: 0,
      label,
      threshold,
      lastLoggedState: null,
      observations: 0,
      context,
      dispatchTarget,
    };
  }

  private startDebugMonitoring(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.debugMonitorInterval !== null) {
      return;
    }

    // Run an immediate sample so logs appear quickly when audio becomes active
    this.runDebugMonitor();

    this.debugMonitorInterval = window.setInterval(() => {
      try {
        this.runDebugMonitor();
      } catch (error) {
        console.error('[FacilitatorAudioMixer] Debug monitor failed', error);
      }
    }, 2000);
  }

  private updateDebugState(state: DebugMonitorState): void {
    state.analyser.getFloatTimeDomainData(state.buffer);
    state.observations += 1;

    let sumSquares = 0;
    for (let i = 0; i < state.buffer.length; i += 1) {
      const sample = state.buffer[i];
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / state.buffer.length);
    const isSilent = rms < state.threshold;

    const prefix = state.context === 'dispatch' ? '[FacilitatorAudioMixer][Dispatch]' : '[FacilitatorAudioMixer][Debug]';
    const dispatchLabel =
      state.dispatchTarget === 'facilitator'
        ? 'Facilitator microphone dispatch'
        : state.dispatchTarget === 'background'
        ? 'Background audio dispatch'
        : state.label;
    const label = state.context === 'dispatch' ? dispatchLabel : state.label;

    if (isSilent) {
      state.silentCount += 1;

      const hasEnoughSamples = state.observations > 3;
      const shouldLogSilence =
        hasEnoughSamples && state.silentCount >= 3 && state.lastLoggedState !== 'silent';

      if (shouldLogSilence) {
        state.lastLoggedState = 'silent';
        if (state.context === 'dispatch') {
          console.warn(
            `${prefix} ${label} dispatch path is SILENT before WebRTC encoding (RMS=${rms.toFixed(6)}). Remote participants may not receive audio.`,
          );
        } else {
          console.warn(`${prefix} ${label} appears SILENT (RMS=${rms.toFixed(6)})`);
        }
      }
    } else {
      if (state.lastLoggedState !== 'active') {
        if (state.context === 'dispatch') {
          console.log(
            `${prefix} ${label} audio ACTIVE and ready for transmission (RMS=${rms.toFixed(6)})`,
          );
        } else {
          console.log(`${prefix} ${label} audio ACTIVE (RMS=${rms.toFixed(6)})`);
        }
      }

      state.silentCount = 0;
      state.lastLoggedState = 'active';
    }
  }

  private attachDestinationTrackDiagnostics(
    destination: MediaStreamAudioDestinationNode,
    type: 'facilitator' | 'background',
  ): void {
    const stream = destination.stream;
    const track = stream.getAudioTracks()[0] ?? null;
    const prefix =
      type === 'facilitator'
        ? '[FacilitatorAudioMixer][Dispatch][Facilitator]'
        : '[FacilitatorAudioMixer][Dispatch][Background]';

    if (!track) {
      console.warn(`${prefix} No audio track available on destination stream to monitor dispatch state.`);
      return;
    }

    const alreadyTracked = this.trackDiagnostics.some((entry) => entry.track === track);
    if (alreadyTracked) {
      return;
    }

    const logTrackSnapshot = (reason: string) => {
      console.log(`${prefix} ${reason}`, {
        id: track.id,
        muted: track.muted,
        enabled: track.enabled,
        readyState: track.readyState,
      });
    };

    const handleMute = () => {
      console.warn(
        `${prefix} MediaStreamTrack reported "mute" – facilitator audio samples are not currently being delivered to WebRTC for encoding.`,
      );
      logTrackSnapshot('Track state after mute event');
    };

    const handleUnmute = () => {
      console.log(
        `${prefix} MediaStreamTrack reported "unmute" – facilitator audio samples are flowing to WebRTC for encoding.`,
      );
      logTrackSnapshot('Track state after unmute event');
    };

    const handleEnded = () => {
      console.error(
        `${prefix} MediaStreamTrack ended – no further audio will be dispatched to remote participants until a new track is provided.`,
      );
      logTrackSnapshot('Track state when ended');
      this.detachTrackDiagnostics(track);
    };

    track.addEventListener('mute', handleMute);
    track.addEventListener('unmute', handleUnmute);
    track.addEventListener('ended', handleEnded);

    if (typeof track.getSettings === 'function') {
      try {
        const settings = track.getSettings();
        console.log(`${prefix} Initial track settings`, settings);
      } catch (error) {
        console.warn(`${prefix} Unable to read track settings for diagnostics`, error);
      }
    }

    logTrackSnapshot('Monitoring outbound track state');

    this.trackDiagnostics.push({
      track,
      handlers: {
        mute: handleMute,
        unmute: handleUnmute,
        ended: handleEnded,
      },
    });
  }

  private detachTrackDiagnostics(track: MediaStreamTrack): void {
    const index = this.trackDiagnostics.findIndex((entry) => entry.track === track);
    if (index === -1) {
      return;
    }

    const entry = this.trackDiagnostics[index];
    track.removeEventListener('mute', entry.handlers.mute);
    track.removeEventListener('unmute', entry.handlers.unmute);
    track.removeEventListener('ended', entry.handlers.ended);
    this.trackDiagnostics.splice(index, 1);
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

    // Stop and disconnect silent oscillator
    if (this.silentOscillator) {
      try {
        this.silentOscillator.stop();
      } catch (error) {
        // Oscillator might already be stopped
        console.log('[FacilitatorAudioMixer] Silent oscillator already stopped');
      }
      this.silentOscillator.disconnect();
      this.silentOscillator = null;
    }

    if (this.silentGain) {
      this.silentGain.disconnect();
      this.silentGain = null;
    }

    this.trackDiagnostics.forEach((entry) => {
      this.detachTrackDiagnostics(entry.track);
    });
    this.trackDiagnostics = [];

    if (typeof window !== 'undefined' && this.debugMonitorInterval !== null) {
      window.clearInterval(this.debugMonitorInterval);
      this.debugMonitorInterval = null;
    }

    if (typeof window !== 'undefined') {
      if (this.backgroundFlowSnapshotTimeout !== null) {
        window.clearTimeout(this.backgroundFlowSnapshotTimeout);
        this.backgroundFlowSnapshotTimeout = null;
      }
      if (this.backgroundFlowInterval !== null) {
        window.clearInterval(this.backgroundFlowInterval);
        this.backgroundFlowInterval = null;
      }
    }

    void this.audioContext.close();
  }

  private startBackgroundFlowDiagnostics(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.backgroundFlowSnapshotTimeout !== null) {
      window.clearTimeout(this.backgroundFlowSnapshotTimeout);
      this.backgroundFlowSnapshotTimeout = null;
    }

    if (this.backgroundFlowInterval !== null) {
      window.clearInterval(this.backgroundFlowInterval);
      this.backgroundFlowInterval = null;
    }

    const logSnapshot = (context: 'initial' | 'periodic') => {
      const sourceRms = this.measureRms(this.backgroundAnalyser, this.backgroundFlowSourceBuffer);
      const dispatchRms = this.measureRms(
        this.backgroundDestinationAnalyser,
        this.backgroundFlowDispatchBuffer,
      );

      const status =
        sourceRms < 0.00025
          ? 'SOURCE_SILENT'
          : dispatchRms < 0.00025
          ? 'DISPATCH_SILENT'
          : 'FLOWING';

      const prefix =
        context === 'initial'
          ? '[FacilitatorAudioMixer][BackgroundFlow] Initial sample after connection'
          : '[FacilitatorAudioMixer][BackgroundFlow] Periodic sample';

      const message =
        status === 'FLOWING'
          ? 'Background audio samples are flowing toward WebRTC dispatch.'
          : status === 'DISPATCH_SILENT'
          ? 'Background source active but dispatch input appears silent – check MediaStreamDestination wiring.'
          : 'Background audio source appears silent – verify the loaded file is playing.';

      const logFn = status === 'FLOWING' ? console.log : console.warn;

      logFn(`${prefix}: ${message}`, {
        sourceRms: Number(sourceRms.toFixed(6)),
        dispatchRms: Number(dispatchRms.toFixed(6)),
        status,
      });
    };

    this.backgroundFlowSnapshotTimeout = window.setTimeout(() => logSnapshot('initial'), 1200);

    this.backgroundFlowInterval = window.setInterval(() => {
      logSnapshot('periodic');
    }, 8000);
  }

  private measureRms(analyser: AnalyserNode, buffer: Float32Array): number {
    analyser.getFloatTimeDomainData(buffer);

    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const sample = buffer[i];
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / buffer.length);
  }
}
