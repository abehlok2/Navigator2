import { createPeerConnection, ManagedPeerConnection } from './connection';

/**
 * Represents the connection state of a peer
 */
export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/**
 * Events emitted by the PeerConnectionManager
 */
export interface PeerManagerEvents {
  connectionStateChanged: {
    participantId: string;
    state: PeerConnectionState;
    connection: RTCPeerConnection;
  };
  iceCandidate: {
    participantId: string;
    candidate: RTCIceCandidate;
  };
  track: {
    participantId: string;
    track: MediaStreamTrack;
    streams: readonly MediaStream[];
  };
  dataChannel: {
    participantId: string;
    channel: RTCDataChannel;
  };
  negotiationNeeded: {
    participantId: string;
    connection: RTCPeerConnection;
  };
}

/**
 * Type for event handler functions
 */
type EventHandler<T> = (data: T) => void;

/**
 * Manages multiple peer connections for a WebRTC session
 */
export class PeerConnectionManager {
  private peers = new Map<string, ManagedPeerConnection>();
  private pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  private eventHandlers = new Map<keyof PeerManagerEvents, Set<EventHandler<any>>>();
  private config?: RTCConfiguration;

  constructor(config?: RTCConfiguration | undefined) {
    this.config = config;
  }

  /**
   * Creates a new peer connection for the specified participant
   */
  public createConnection(participantId: string): RTCPeerConnection {
    if (this.peers.has(participantId)) {
      console.warn(`[PeerManager] Connection already exists for participant ${participantId}`);
      return this.peers.get(participantId)!.pc;
    }

    console.log(`[PeerManager] Creating connection for participant ${participantId}`);
    const managed = createPeerConnection(this.config);
    const { pc } = managed;

    this.peers.set(participantId, managed);

    // Set up event listeners
    this.setupPeerConnectionListeners(participantId, pc);

    // Log ICE gathering completion
    managed.iceGathering.then((summary) => {
      console.log(`[PeerManager] ICE gathering complete for ${participantId}:`, summary);
    }).catch((error) => {
      console.error(`[PeerManager] ICE gathering failed for ${participantId}:`, error);
    });

    // Log connection type detection
    managed.connectionType.then((type) => {
      console.log(`[PeerManager] Connection type for ${participantId}:`, type);
    }).catch((error) => {
      console.error(`[PeerManager] Connection type detection failed for ${participantId}:`, error);
    });

    return pc;
  }

  /**
   * Sets up event listeners for a peer connection
   */
  private setupPeerConnectionListeners(participantId: string, pc: RTCPeerConnection): void {
    // Connection state changes
    pc.addEventListener('connectionstatechange', () => {
      const state = pc.connectionState as PeerConnectionState;
      console.log(`[PeerManager] Connection state changed for ${participantId}: ${state}`);
      this.emit('connectionStateChanged', { participantId, state, connection: pc });

      // Handle failed/closed states
      if (state === 'failed' || state === 'closed') {
        console.warn(`[PeerManager] Connection ${state} for ${participantId}`);
      }
    });

    // ICE connection state changes
    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`[PeerManager] ICE connection state for ${participantId}: ${pc.iceConnectionState}`);
    });

    // ICE gathering state changes
    pc.addEventListener('icegatheringstatechange', () => {
      console.log(`[PeerManager] ICE gathering state for ${participantId}: ${pc.iceGatheringState}`);
    });

    // ICE candidates
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.log(`[PeerManager] New ICE candidate for ${participantId}:`, event.candidate.candidate);
        this.emit('iceCandidate', { participantId, candidate: event.candidate });
      } else {
        console.log(`[PeerManager] ICE gathering complete for ${participantId} (null candidate)`);
      }
    });

    // Remote tracks
    pc.addEventListener('track', (event) => {
      console.log(`[PeerManager] Received track from ${participantId}:`, event.track.kind);
      this.emit('track', {
        participantId,
        track: event.track,
        streams: event.streams,
      });
    });

    // Data channels (for receiving channels from remote peer)
    pc.addEventListener('datachannel', (event) => {
      console.log(`[PeerManager] Received data channel from ${participantId}:`, event.channel.label);
      this.emit('dataChannel', { participantId, channel: event.channel });
    });

    // Negotiation needed
    pc.addEventListener('negotiationneeded', () => {
      console.log(`[PeerManager] Negotiation needed for ${participantId}`);
      this.emit('negotiationNeeded', { participantId, connection: pc });
    });
  }

  /**
   * Gets an existing peer connection
   */
  public getConnection(participantId: string): RTCPeerConnection | undefined {
    return this.peers.get(participantId)?.pc;
  }

  /**
   * Gets the managed peer connection wrapper
   */
  public getManagedConnection(participantId: string): ManagedPeerConnection | undefined {
    return this.peers.get(participantId);
  }

  /**
   * Checks if a connection exists for a participant
   */
  public hasConnection(participantId: string): boolean {
    return this.peers.has(participantId);
  }

  /**
   * Gets all participant IDs with active connections
   */
  public getParticipantIds(): string[] {
    return Array.from(this.peers.keys());
  }

  /**
   * Adds a remote ICE candidate to a peer connection
   * Buffers candidates if the remote description hasn't been set yet
   */
  public async addIceCandidate(participantId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peers.get(participantId)?.pc;

    if (!pc) {
      console.warn(`[PeerManager] No connection found for participant ${participantId}, ignoring ICE candidate`);
      return;
    }

    // Buffer candidates if remote description hasn't been set
    if (!pc.remoteDescription) {
      console.log(`[PeerManager] Buffering ICE candidate for ${participantId} (no remote description yet)`);
      if (!this.pendingIceCandidates.has(participantId)) {
        this.pendingIceCandidates.set(participantId, []);
      }
      this.pendingIceCandidates.get(participantId)!.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(candidate);
      console.log(`[PeerManager] Added ICE candidate for ${participantId}`);
    } catch (error) {
      console.error(`[PeerManager] Failed to add ICE candidate for ${participantId}:`, error);
    }
  }

  /**
   * Processes any buffered ICE candidates after remote description is set
   */
  private async processPendingIceCandidates(participantId: string): Promise<void> {
    const candidates = this.pendingIceCandidates.get(participantId);
    if (!candidates || candidates.length === 0) {
      return;
    }

    console.log(`[PeerManager] Processing ${candidates.length} buffered ICE candidates for ${participantId}`);
    const pc = this.peers.get(participantId)?.pc;

    if (!pc) {
      console.warn(`[PeerManager] No connection found for participant ${participantId}`);
      return;
    }

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(candidate);
        console.log(`[PeerManager] Added buffered ICE candidate for ${participantId}`);
      } catch (error) {
        console.error(`[PeerManager] Failed to add buffered ICE candidate for ${participantId}:`, error);
      }
    }

    // Clear the buffer
    this.pendingIceCandidates.delete(participantId);
  }

  /**
   * Sets the remote description and processes buffered ICE candidates
   */
  public async setRemoteDescription(
    participantId: string,
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    const pc = this.peers.get(participantId)?.pc;

    if (!pc) {
      throw new Error(`No connection found for participant ${participantId}`);
    }

    console.log(`[PeerManager] Setting remote description for ${participantId}: ${description.type}`);

    try {
      await pc.setRemoteDescription(description);
      console.log(`[PeerManager] Remote description set for ${participantId}`);

      // Process any buffered ICE candidates
      await this.processPendingIceCandidates(participantId);
    } catch (error) {
      console.error(`[PeerManager] Failed to set remote description for ${participantId}:`, error);
      throw error;
    }
  }

  /**
   * Creates an offer for a peer connection
   */
  public async createOffer(participantId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.peers.get(participantId)?.pc;

    if (!pc) {
      throw new Error(`No connection found for participant ${participantId}`);
    }

    console.log(`[PeerManager] Creating offer for ${participantId}`);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log(`[PeerManager] Offer created and set as local description for ${participantId}`);
      return offer;
    } catch (error) {
      console.error(`[PeerManager] Failed to create offer for ${participantId}:`, error);
      throw error;
    }
  }

  /**
   * Creates an answer for a peer connection
   */
  public async createAnswer(participantId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.peers.get(participantId)?.pc;

    if (!pc) {
      throw new Error(`No connection found for participant ${participantId}`);
    }

    console.log(`[PeerManager] Creating answer for ${participantId}`);

    try {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log(`[PeerManager] Answer created and set as local description for ${participantId}`);
      return answer;
    } catch (error) {
      console.error(`[PeerManager] Failed to create answer for ${participantId}:`, error);
      throw error;
    }
  }

  /**
   * Removes a peer connection and cleans up resources
   */
  public removeConnection(participantId: string): void {
    const managed = this.peers.get(participantId);

    if (!managed) {
      console.warn(`[PeerManager] No connection found for participant ${participantId}`);
      return;
    }

    console.log(`[PeerManager] Removing connection for participant ${participantId}`);

    const { pc } = managed;

    // Close the connection
    pc.close();

    // Remove from maps
    this.peers.delete(participantId);
    this.pendingIceCandidates.delete(participantId);

    console.log(`[PeerManager] Connection removed for participant ${participantId}`);
  }

  /**
   * Removes all peer connections and cleans up resources
   */
  public cleanup(): void {
    console.log(`[PeerManager] Cleaning up all connections (${this.peers.size} peers)`);

    for (const participantId of this.peers.keys()) {
      this.removeConnection(participantId);
    }

    // Clear all event handlers
    this.eventHandlers.clear();

    console.log('[PeerManager] Cleanup complete');
  }

  /**
   * Registers an event handler
   */
  public on<K extends keyof PeerManagerEvents>(
    event: K,
    handler: EventHandler<PeerManagerEvents[K]>,
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unregisters an event handler
   */
  public off<K extends keyof PeerManagerEvents>(
    event: K,
    handler: EventHandler<PeerManagerEvents[K]>,
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emits an event to all registered handlers
   */
  private emit<K extends keyof PeerManagerEvents>(event: K, data: PeerManagerEvents[K]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  /**
   * Gets statistics for all peer connections
   */
  public getStats(): Map<string, RTCPeerConnection> {
    const stats = new Map<string, RTCPeerConnection>();
    this.peers.forEach((managed, participantId) => {
      stats.set(participantId, managed.pc);
    });
    return stats;
  }
}
