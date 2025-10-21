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
 */
export class ControlChannel {
  private dataChannel: RTCDataChannel | null = null;
  private readonly eventHandlers = new Map<
    ControlMessageType,
    Set<ControlMessageHandler<any>>
  >();
  private isOpen = false;

  /**
   * Creates a new ControlChannel instance.
   * The channel must be initialized with a data channel before use.
   */
  constructor() {
    // Channel will be set via setDataChannel
  }

  /**
   * Sets the underlying RTCDataChannel for this control channel.
   * Automatically sets up event listeners and connection state tracking.
   */
  public setDataChannel(channel: RTCDataChannel): void {
    // Clean up existing channel if present
    if (this.dataChannel) {
      this.cleanup();
    }

    this.dataChannel = channel;
    this.setupDataChannelListeners();

    // If channel is already open, mark as ready
    if (channel.readyState === 'open') {
      this.isOpen = true;
      this.emit('channel:open', { type: 'channel:open', timestamp: Date.now() });
    }
  }

  /**
   * Sends a control message through the data channel.
   * @throws Error if the data channel is not open or not set
   */
  public send<T extends ControlMessageType>(
    type: T,
    data?: Omit<ControlMessageEventMap[T], 'type' | 'timestamp'>,
  ): void {
    if (!this.dataChannel) {
      throw new Error('Control channel not initialized. Call setDataChannel first.');
    }

    if (!this.isOpen) {
      throw new Error('Control channel is not open. Cannot send message.');
    }

    const message: ControlMessage = {
      type,
      timestamp: Date.now(),
      ...data,
    } as ControlMessage;

    try {
      this.dataChannel.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Failed to send control message of type "${type}":`, error);
      throw new Error(`Failed to send control message: ${error instanceof Error ? error.message : 'unknown error'}`);
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
   */
  public isReady(): boolean {
    return this.isOpen && this.dataChannel !== null;
  }

  /**
   * Gets the current state of the data channel.
   */
  public getState(): RTCDataChannelState | 'not-initialized' {
    return this.dataChannel?.readyState ?? 'not-initialized';
  }

  /**
   * Closes the control channel and cleans up resources.
   */
  public close(): void {
    this.cleanup();
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
  }

  /**
   * Sets up event listeners on the data channel.
   */
  private setupDataChannelListeners(): void {
    if (!this.dataChannel) {
      return;
    }

    this.dataChannel.addEventListener('open', this.handleChannelOpen);
    this.dataChannel.addEventListener('close', this.handleChannelClose);
    this.dataChannel.addEventListener('error', this.handleChannelError);
    this.dataChannel.addEventListener('message', this.handleChannelMessage);
  }

  /**
   * Removes event listeners from the data channel.
   */
  private cleanup(): void {
    if (!this.dataChannel) {
      return;
    }

    this.dataChannel.removeEventListener('open', this.handleChannelOpen);
    this.dataChannel.removeEventListener('close', this.handleChannelClose);
    this.dataChannel.removeEventListener('error', this.handleChannelError);
    this.dataChannel.removeEventListener('message', this.handleChannelMessage);

    this.isOpen = false;
  }

  /**
   * Handles data channel open event.
   */
  private readonly handleChannelOpen = (): void => {
    this.isOpen = true;
    console.log('Control channel opened');
    this.emit('channel:open', { type: 'channel:open', timestamp: Date.now() });
  };

  /**
   * Handles data channel close event.
   */
  private readonly handleChannelClose = (): void => {
    this.isOpen = false;
    console.log('Control channel closed');
    this.emit('channel:close', { type: 'channel:close', timestamp: Date.now() });
  };

  /**
   * Handles data channel error event.
   */
  private readonly handleChannelError = (event: Event): void => {
    console.error('Control channel error:', event);
    this.emit('channel:error', { type: 'channel:error', timestamp: Date.now() });
  };

  /**
   * Handles incoming messages on the data channel.
   */
  private readonly handleChannelMessage = (event: MessageEvent): void => {
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
  };

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
