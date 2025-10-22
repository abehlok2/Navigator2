import type {
  ControlMessage,
  ControlMessageEventMap,
  ControlMessageHandler,
  ControlMessageType,
} from '../../types/control-messages';
import { isControlMessage } from '../../types/control-messages';

/**
 * ControlChannel manages bidirectional control message communication
 * between session participants using WebRTC data channels.
 * Supports multiple data channels for broadcasting (facilitator role).
 */
export class ControlChannel {
  private dataChannels = new Map<string, RTCDataChannel>();
  private readonly eventHandlers = new Map<
    ControlMessageType,
    Set<ControlMessageHandler<any>>
  >();
  private openChannels = new Set<string>();
  private messageBuffer: ControlMessage[] = [];
  private readonly MAX_BUFFER_SIZE = 50;

  /**
   * Creates a new ControlChannel instance.
   * The channel must be initialized with a data channel before use.
   */
  constructor() {
    // Channels will be added via setDataChannel
  }

  /**
   * Sets the underlying RTCDataChannel for this control channel.
   * Automatically sets up event listeners and connection state tracking.
   * For facilitators, this can be called multiple times to add channels for each peer.
   * For explorers/listeners, this is called once for the facilitator's channel.
   *
   * @param channel - The data channel to add
   * @param channelId - Optional identifier for the channel (defaults to channel label + timestamp)
   */
  public setDataChannel(channel: RTCDataChannel, channelId?: string): void {
    const id = channelId || `${channel.label}-${Date.now()}`;

    // Remove existing channel with same ID if present
    if (this.dataChannels.has(id)) {
      this.removeDataChannel(id);
    }

    this.dataChannels.set(id, channel);
    this.setupDataChannelListeners(id, channel);

    // If channel is already open, mark as ready
    if (channel.readyState === 'open') {
      this.openChannels.add(id);
      this.emit('channel:open', { type: 'channel:open', timestamp: Date.now() });
    }
  }

  /**
   * Removes a data channel from this control channel.
   */
  private removeDataChannel(channelId: string): void {
    const channel = this.dataChannels.get(channelId);
    if (!channel) {
      return;
    }

    this.cleanupChannel(channelId, channel);
    this.dataChannels.delete(channelId);
    this.openChannels.delete(channelId);
  }

  /**
   * Sends a control message through all open data channels (broadcasts).
   * If no channels are open, buffers the message for later delivery.
   * @param bufferIfClosed - If true, buffers message when no channels are open instead of throwing
   * @throws Error if no data channels are initialized or if sending fails and bufferIfClosed is false
   */
  public send<T extends ControlMessageType>(
    type: T,
    data?: Omit<ControlMessageEventMap[T], 'type' | 'timestamp'>,
    bufferIfClosed = true,
  ): void {
    if (this.dataChannels.size === 0) {
      throw new Error('Control channel not initialized. Call setDataChannel first.');
    }

    const message: ControlMessage = {
      type,
      timestamp: Date.now(),
      ...data,
    } as ControlMessage;

    if (this.openChannels.size === 0) {
      if (bufferIfClosed) {
        this.bufferMessage(message);
        console.log(`Buffered message of type "${type}" (${this.messageBuffer.length} in buffer)`);
        return;
      } else {
        throw new Error('No open control channels. Cannot send message.');
      }
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    let lastError: Error | null = null;

    // Broadcast to all open channels
    for (const channelId of this.openChannels) {
      const channel = this.dataChannels.get(channelId);
      if (!channel || channel.readyState !== 'open') {
        continue;
      }

      try {
        channel.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error(`Failed to send control message of type "${type}" on channel ${channelId}:`, error);
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }

    if (sentCount === 0 && lastError) {
      if (bufferIfClosed) {
        this.bufferMessage(message);
        console.log(`Failed to send, buffered message of type "${type}"`);
      } else {
        throw new Error(`Failed to send control message to any channel: ${lastError.message}`);
      }
    }
  }

  /**
   * Buffers a message for later delivery when channels become available.
   */
  private bufferMessage(message: ControlMessage): void {
    this.messageBuffer.push(message);

    // Prevent unbounded buffer growth
    if (this.messageBuffer.length > this.MAX_BUFFER_SIZE) {
      const removed = this.messageBuffer.shift();
      console.warn(`Message buffer full, dropped oldest message of type "${removed?.type}"`);
    }
  }

  /**
   * Flushes buffered messages through open channels.
   */
  private flushMessageBuffer(): void {
    if (this.messageBuffer.length === 0 || this.openChannels.size === 0) {
      return;
    }

    console.log(`Flushing ${this.messageBuffer.length} buffered messages`);
    const messages = [...this.messageBuffer];
    this.messageBuffer = [];

    for (const message of messages) {
      const messageStr = JSON.stringify(message);

      for (const channelId of this.openChannels) {
        const channel = this.dataChannels.get(channelId);
        if (!channel || channel.readyState !== 'open') {
          continue;
        }

        try {
          channel.send(messageStr);
        } catch (error) {
          console.error(`Failed to flush message of type "${message.type}":`, error);
          // Re-buffer failed messages
          this.bufferMessage(message);
          break;
        }
      }
    }
  }

  /**
   * Registers an event handler for a specific control message type.
   */
  public on<T extends ControlMessageType>(
    messageType: T,
    handler: ControlMessageHandler<T>,
  ): void {
    if (!this.eventHandlers.has(messageType)) {
      this.eventHandlers.set(messageType, new Set());
    }

    const handlers = this.eventHandlers.get(messageType);
    handlers?.add(handler as ControlMessageHandler<any>);
  }

  /**
   * Removes an event handler for a specific control message type.
   */
  public off<T extends ControlMessageType>(
    messageType: T,
    handler: ControlMessageHandler<T>,
  ): void {
    const handlers = this.eventHandlers.get(messageType);
    handlers?.delete(handler as ControlMessageHandler<any>);

    if (handlers && handlers.size === 0) {
      this.eventHandlers.delete(messageType);
    }
  }

  /**
   * Checks if the control channel is ready to send messages.
   * Returns true if at least one data channel is open.
   */
  public isReady(): boolean {
    return this.openChannels.size > 0;
  }

  /**
   * Gets the current state of the data channels.
   * Returns 'open' if any channel is open, otherwise returns the most common state.
   */
  public getState(): RTCDataChannelState | 'not-initialized' {
    if (this.dataChannels.size === 0) {
      return 'not-initialized';
    }

    // If any channel is open, return 'open'
    if (this.openChannels.size > 0) {
      return 'open';
    }

    // Otherwise, return the first channel's state
    const firstChannel = this.dataChannels.values().next().value;
    return firstChannel?.readyState ?? 'not-initialized';
  }

  /**
   * Closes all data channels and cleans up resources.
   */
  public close(): void {
    for (const [channelId, channel] of this.dataChannels.entries()) {
      this.cleanupChannel(channelId, channel);
      channel.close();
    }
    this.dataChannels.clear();
    this.openChannels.clear();
    this.messageBuffer = [];
  }

  /**
   * Gets the number of messages currently in the buffer.
   */
  public getBufferSize(): number {
    return this.messageBuffer.length;
  }

  /**
   * Clears all buffered messages.
   */
  public clearBuffer(): void {
    this.messageBuffer = [];
  }

  /**
   * Sets up event listeners on a data channel.
   */
  private setupDataChannelListeners(channelId: string, channel: RTCDataChannel): void {
    const handleOpen = () => this.handleChannelOpen(channelId);
    const handleClose = () => this.handleChannelClose(channelId);
    const handleError = (event: Event) => this.handleChannelError(channelId, event);
    const handleMessage = (event: MessageEvent) => this.handleChannelMessage(event);

    channel.addEventListener('open', handleOpen);
    channel.addEventListener('close', handleClose);
    channel.addEventListener('error', handleError);
    channel.addEventListener('message', handleMessage);

    // Store the handlers for cleanup
    (channel as any)._controlChannelHandlers = {
      open: handleOpen,
      close: handleClose,
      error: handleError,
      message: handleMessage,
    };
  }

  /**
   * Removes event listeners from a data channel.
   */
  private cleanupChannel(channelId: string, channel: RTCDataChannel): void {
    const handlers = (channel as any)._controlChannelHandlers;
    if (!handlers) {
      return;
    }

    channel.removeEventListener('open', handlers.open);
    channel.removeEventListener('close', handlers.close);
    channel.removeEventListener('error', handlers.error);
    channel.removeEventListener('message', handlers.message);

    delete (channel as any)._controlChannelHandlers;
  }

  /**
   * Handles data channel open event.
   */
  private handleChannelOpen(channelId: string): void {
    this.openChannels.add(channelId);
    console.log(`Control channel opened: ${channelId} (${this.openChannels.size} total)`);

    // Flush buffered messages when a channel opens
    this.flushMessageBuffer();

    this.emit('channel:open', { type: 'channel:open', timestamp: Date.now() });
  }

  /**
   * Handles data channel close event.
   */
  private handleChannelClose(channelId: string): void {
    this.openChannels.delete(channelId);
    console.log(`Control channel closed: ${channelId} (${this.openChannels.size} remaining)`);
    this.emit('channel:close', { type: 'channel:close', timestamp: Date.now() });
  }

  /**
   * Handles data channel error event.
   */
  private handleChannelError(channelId: string, event: Event): void {
    console.error(`Control channel error on ${channelId}:`, event);
    this.emit('channel:error', { type: 'channel:error', timestamp: Date.now() });
  }

  /**
   * Handles incoming messages on the data channel.
   */
  private handleChannelMessage(event: MessageEvent): void {
    let message: unknown;

    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.error('Failed to parse control message:', error);
      return;
    }

    if (!isControlMessage(message)) {
      console.warn('Received invalid control message:', message);
      return;
    }

    this.emit(message.type, message);
  }

  /**
   * Emits an event to all registered handlers.
   */
  private emit<T extends ControlMessageType>(
    messageType: T,
    message: ControlMessageEventMap[T],
  ): void {
    const handlers = this.eventHandlers.get(messageType);

    if (!handlers || handlers.size === 0) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error(
          `Error executing handler for control message type "${messageType}":`,
          error,
        );
      }
    });
  }
}

/**
 * Creates a new control channel from an RTCPeerConnection.
 * This creates a data channel labeled "control" for sending control messages.
 */
export function createControlChannelFromPeer(
  peerConnection: RTCPeerConnection,
  label = 'control',
): ControlChannel {
  const dataChannel = peerConnection.createDataChannel(label, {
    ordered: true,
    maxRetransmits: 3,
  });

  const controlChannel = new ControlChannel();
  controlChannel.setDataChannel(dataChannel);

  return controlChannel;
}

/**
 * Creates a control channel from an existing RTCDataChannel.
 * This is used when receiving a data channel from a remote peer.
 */
export function createControlChannelFromDataChannel(
  dataChannel: RTCDataChannel,
): ControlChannel {
  const controlChannel = new ControlChannel();
  controlChannel.setDataChannel(dataChannel);

  return controlChannel;
}

export default ControlChannel;
