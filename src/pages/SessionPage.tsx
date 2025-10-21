import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ExplorerPanel, FacilitatorPanel, ListenerPanel, ParticipantList } from '../components/session';
import { ErrorDisplay } from '../components/session/ErrorDisplay';
import { Button, Card } from '../components/ui';
import { useSessionStore } from '../state/session';
import { useSignalingClient, ControlChannel, PeerConnectionManager } from '../features/webrtc';
import type { ConnectionStatus, ParticipantRole } from '../types/session';
import type { SignalingClientEventMap } from '../types/signaling';
import type { SessionError } from '../features/webrtc/errors';
import { createSessionError, handleConnectionError } from '../features/webrtc/errors';
import { ExplorerAudioMixer, ListenerAudioMixer } from '../features/audio';

const pageStyles: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  padding: '2rem',
  backgroundColor: 'var(--bg-primary, #1a1a1a)',
  color: 'var(--text-primary, #ffffff)',
};

const headerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const headerRowStyles: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
};

const statusContainerStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const contentStyles: CSSProperties = {
  display: 'grid',
  gap: '1.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  alignItems: 'start',
};

const statusBadgeBaseStyles: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.25rem 0.75rem',
  borderRadius: '9999px',
  fontSize: '0.85rem',
  fontWeight: 600,
  textTransform: 'capitalize',
};

const roleLabelStyles: CSSProperties = {
  fontSize: '1rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

const connectionStatusColors: Record<ConnectionStatus, string> = {
  connected: 'var(--success, #4aff4a)',
  connecting: 'var(--accent, #4a9eff)',
  disconnected: 'var(--border, #3a3a3a)',
  error: 'var(--danger, #ff4a4a)',
};

const connectionStatusTextColors: Record<ConnectionStatus, string> = {
  connected: '#0b0b0b',
  connecting: '#0b0b0b',
  disconnected: 'var(--text-primary, #ffffff)',
  error: 'var(--text-primary, #ffffff)',
};

const getRolePanel = (
  role: ParticipantRole | null,
  controlChannel: ControlChannel | null,
  peerManager: PeerConnectionManager | null,
) => {
  switch (role) {
    case 'facilitator':
      return <FacilitatorPanel controlChannel={controlChannel} peerManager={peerManager} />;
    case 'explorer':
      return <ExplorerPanel controlChannel={controlChannel} />;
    case 'listener':
      return <ListenerPanel />;
    default:
      return (
        <Card title="Session Controls">
          <p style={{ margin: 0, color: 'var(--text-secondary, #a0a0a0)' }}>
            Role not assigned yet. Session controls will appear once your role is confirmed.
          </p>
        </Card>
      );
  }
};

const formatRoleLabel = (role: ParticipantRole | null) => {
  if (!role) {
    return 'Unknown';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
};

const formatConnectionStatus = (status: ConnectionStatus) => {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'error':
      return 'Connection error';
    default:
      return 'Disconnected';
  }
};

export const SessionPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const userRole = useSessionStore((state) => state.userRole);
  const clearSession = useSessionStore((state) => state.clearSession);
  const addParticipant = useSessionStore((state) => state.addParticipant);
  const removeParticipant = useSessionStore((state) => state.removeParticipant);
  const setParticipants = useSessionStore((state) => state.setParticipants);
  const setConnectionStatus = useSessionStore((state) => state.setConnectionStatus);

  const signalingClient = useSignalingClient();

  // Error handling state
  const [sessionError, setSessionError] = useState<SessionError | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | undefined>(undefined);
  const retryInProgressRef = useRef(false);

  // Control channel state
  const [controlChannel, setControlChannel] = useState<ControlChannel | null>(null);
  const controlChannelRef = useRef<ControlChannel | null>(null);

  // Peer connection manager
  const peerManagerRef = useRef<PeerConnectionManager | null>(null);

  // Audio mixers for receiving facilitator audio (explorer/listener roles)
  const audioMixerRef = useRef<ExplorerAudioMixer | ListenerAudioMixer | null>(null);

  // Initialize audio mixer for explorer/listener roles
  useEffect(() => {
    if (!userRole || userRole === 'facilitator') {
      return;
    }

    if (!audioMixerRef.current) {
      console.log(`[SessionPage] Initializing audio mixer for ${userRole}`);

      if (userRole === 'explorer') {
        audioMixerRef.current = new ExplorerAudioMixer();
      } else if (userRole === 'listener') {
        audioMixerRef.current = new ListenerAudioMixer();
      }
    }

    return () => {
      // Cleanup mixer on unmount or role change
      if (audioMixerRef.current) {
        console.log('[SessionPage] Cleaning up audio mixer');
        audioMixerRef.current.disconnect();
        audioMixerRef.current = null;
      }
    };
  }, [userRole]);

  // Initialize peer connection manager after signaling connects
  useEffect(() => {
    if (connectionStatus === 'connected' && !peerManagerRef.current) {
      console.log('[SessionPage] Initializing PeerConnectionManager');
      const manager = new PeerConnectionManager();
      peerManagerRef.current = manager;

      // Listen for ICE candidates from peer connections
      manager.on('iceCandidate', ({ participantId, candidate }) => {
        console.log(`[SessionPage] Sending ICE candidate to ${participantId}`);
        signalingClient.sendIceCandidate(participantId, candidate);
      });

      // Listen for connection state changes
      manager.on('connectionStateChanged', ({ participantId, state, connection }) => {
        console.log(`[SessionPage] Peer connection state changed for ${participantId}: ${state}`);

        // Handle connection failures
        if (state === 'failed') {
          console.error(`[SessionPage] Connection failed for ${participantId}`);
          setSessionError({
            type: 'webrtc-failed',
            participantId,
            message: `Failed to establish WebRTC connection with participant ${participantId}`,
          });
        }
      });

      // Listen for remote tracks
      manager.on('track', ({ participantId, track, streams }) => {
        console.log(`[SessionPage] Received ${track.kind} track from ${participantId}`, streams);

        // Handle audio tracks from facilitator
        if (track.kind === 'audio' && streams.length > 0) {
          const stream = streams[0];
          const mixer = audioMixerRef.current;

          if (mixer && userRole !== 'facilitator') {
            console.log(`[SessionPage] Routing facilitator audio to ${userRole} mixer`);

            if (mixer instanceof ExplorerAudioMixer) {
              // Explorer mixer connects facilitator stream
              mixer.connectFacilitatorStream(stream);
            } else if (mixer instanceof ListenerAudioMixer) {
              // Listener mixer adds facilitator as an audio source
              mixer.addAudioSource(participantId, stream, 'Facilitator');
            }
          }
        }
      });

      // Listen for data channels
      manager.on('dataChannel', ({ participantId, channel }) => {
        console.log(`[SessionPage] Received data channel from ${participantId}: ${channel.label}`);

        // If this is the control channel and we're not the facilitator, use it
        if (channel.label === 'control' && userRole !== 'facilitator') {
          if (!controlChannel) {
            const controlCh = new ControlChannel();
            controlCh.setDataChannel(channel);
            controlChannelRef.current = controlCh;
            setControlChannel(controlCh);
            console.log('[SessionPage] Control channel initialized from data channel');
          }
        }
      });

      // Listen for negotiation needed
      manager.on('negotiationNeeded', async ({ participantId, connection }) => {
        console.log(`[SessionPage] Negotiation needed for ${participantId}`);

        // Only facilitator creates offers (to avoid glare)
        if (userRole === 'facilitator') {
          try {
            const offer = await manager.createOffer(participantId);
            signalingClient.sendOffer(participantId, offer);
            console.log(`[SessionPage] Sent offer to ${participantId}`);
          } catch (error) {
            console.error(`[SessionPage] Failed to create offer for ${participantId}:`, error);
          }
        }
      });
    }

    return () => {
      // Cleanup peer connections on unmount
      if (peerManagerRef.current) {
        console.log('[SessionPage] Cleaning up PeerConnectionManager');
        peerManagerRef.current.cleanup();
        peerManagerRef.current = null;
      }

      // Cleanup control channel on unmount
      if (controlChannelRef.current) {
        controlChannelRef.current.close();
        controlChannelRef.current = null;
      }
    };
  }, [connectionStatus, signalingClient, userRole, controlChannel]);

  useEffect(() => {
    const handleRoomJoined = (payload: SignalingClientEventMap['roomJoined']) => {
      setParticipants(payload.participants.map((participant) => ({ ...participant })));
      setConnectionStatus('connected');
    };

    const handleParticipantJoined = ({
      participantId,
      username,
      role,
    }: SignalingClientEventMap['participantJoined']): void => {
      addParticipant({ id: participantId, username, role, isOnline: true });

      // Create peer connection for new participant
      if (peerManagerRef.current) {
        console.log(`[SessionPage] Creating peer connection for new participant: ${participantId}`);
        peerManagerRef.current.createConnection(participantId);

        // If we're the facilitator, create a control data channel
        if (userRole === 'facilitator') {
          const pc = peerManagerRef.current.getConnection(participantId);
          if (pc && !controlChannel) {
            const dataChannel = pc.createDataChannel('control');
            const controlCh = new ControlChannel();
            controlCh.setDataChannel(dataChannel);
            controlChannelRef.current = controlCh;
            setControlChannel(controlCh);
            console.log('[SessionPage] Control channel initialized for facilitator');
          }
        }
      }
    };

    const handleParticipantLeft = ({ participantId }: SignalingClientEventMap['participantLeft']): void => {
      const participant = useSessionStore.getState().participants.find(p => p.id === participantId);
      removeParticipant(participantId);

      // Remove peer connection
      if (peerManagerRef.current) {
        console.log(`[SessionPage] Removing peer connection for ${participantId}`);
        peerManagerRef.current.removeConnection(participantId);
      }

      // Show notification for peer disconnection
      if (participant) {
        setSessionError({
          type: 'peer-disconnected',
          participantName: participant.username,
        });
      }
    };

    const handleConnected = (): void => {
      setConnectionStatus('connected');
      // Clear any connection errors on successful connection
      setSessionError(null);
      setRetryCountdown(undefined);
      retryInProgressRef.current = false;
    };

    const handleReconnecting = (_payload: SignalingClientEventMap['reconnecting']): void => {
      setConnectionStatus('connecting');
    };

    const handleDisconnected = (_payload: SignalingClientEventMap['disconnected']): void => {
      setConnectionStatus('disconnected');

      // Show connection lost error
      const error = createSessionError(new Error('Connection to server lost'));
      setSessionError(error);
    };

    const handleError = (payload: SignalingClientEventMap['error']): void => {
      setConnectionStatus('error');

      // Create user-friendly error from signaling error
      const error = createSessionError(
        new Error(payload.message || 'Connection error occurred')
      );
      setSessionError(error);
    };

    // WebRTC signaling handlers
    const handleOffer = async ({ from, description }: SignalingClientEventMap['offer']): Promise<void> => {
      console.log(`[SessionPage] Received offer from ${from}`);

      if (!peerManagerRef.current) {
        console.warn('[SessionPage] No peer manager available to handle offer');
        return;
      }

      try {
        // Create connection if it doesn't exist
        if (!peerManagerRef.current.hasConnection(from)) {
          peerManagerRef.current.createConnection(from);
        }

        // Set remote description
        await peerManagerRef.current.setRemoteDescription(from, description);

        // Create and send answer
        const answer = await peerManagerRef.current.createAnswer(from);
        signalingClient.sendAnswer(from, answer);
        console.log(`[SessionPage] Sent answer to ${from}`);
      } catch (error) {
        console.error(`[SessionPage] Failed to handle offer from ${from}:`, error);
        setSessionError({
          type: 'webrtc-failed',
          participantId: from,
          message: `Failed to process offer from participant ${from}`,
        });
      }
    };

    const handleAnswer = async ({ from, description }: SignalingClientEventMap['answer']): Promise<void> => {
      console.log(`[SessionPage] Received answer from ${from}`);

      if (!peerManagerRef.current) {
        console.warn('[SessionPage] No peer manager available to handle answer');
        return;
      }

      try {
        await peerManagerRef.current.setRemoteDescription(from, description);
        console.log(`[SessionPage] Set remote description (answer) for ${from}`);
      } catch (error) {
        console.error(`[SessionPage] Failed to handle answer from ${from}:`, error);
        setSessionError({
          type: 'webrtc-failed',
          participantId: from,
          message: `Failed to process answer from participant ${from}`,
        });
      }
    };

    const handleIceCandidate = async ({
      from,
      candidate,
    }: SignalingClientEventMap['iceCandidate']): Promise<void> => {
      console.log(`[SessionPage] Received ICE candidate from ${from}`);

      if (!peerManagerRef.current) {
        console.warn('[SessionPage] No peer manager available to handle ICE candidate');
        return;
      }

      try {
        await peerManagerRef.current.addIceCandidate(from, candidate);
      } catch (error) {
        console.error(`[SessionPage] Failed to add ICE candidate from ${from}:`, error);
      }
    };

    signalingClient.on('roomJoined', handleRoomJoined);
    signalingClient.on('participantJoined', handleParticipantJoined);
    signalingClient.on('participantLeft', handleParticipantLeft);
    signalingClient.on('connected', handleConnected);
    signalingClient.on('reconnected', handleConnected);
    signalingClient.on('reconnecting', handleReconnecting);
    signalingClient.on('disconnected', handleDisconnected);
    signalingClient.on('error', handleError);
    signalingClient.on('offer', handleOffer);
    signalingClient.on('answer', handleAnswer);
    signalingClient.on('iceCandidate', handleIceCandidate);

    return () => {
      signalingClient.off('roomJoined', handleRoomJoined);
      signalingClient.off('participantJoined', handleParticipantJoined);
      signalingClient.off('participantLeft', handleParticipantLeft);
      signalingClient.off('connected', handleConnected);
      signalingClient.off('reconnected', handleConnected);
      signalingClient.off('reconnecting', handleReconnecting);
      signalingClient.off('disconnected', handleDisconnected);
      signalingClient.off('error', handleError);
      signalingClient.off('offer', handleOffer);
      signalingClient.off('answer', handleAnswer);
      signalingClient.off('iceCandidate', handleIceCandidate);
    };
  }, [
    addParticipant,
    removeParticipant,
    setConnectionStatus,
    setParticipants,
    signalingClient,
    userRole,
    controlChannel,
  ]);

  const handleLeaveRoom = useCallback(() => {
    try {
      signalingClient.leaveRoom();
    } catch (error) {
      console.warn('Unable to notify signaling server about leaving the room', error);
    }
    clearSession();
    navigate('/home');
  }, [clearSession, navigate, signalingClient]);

  const handleRetryConnection = useCallback(async () => {
    if (retryInProgressRef.current || !sessionError || sessionError.type !== 'connection-failed') {
      return;
    }

    retryInProgressRef.current = true;

    await handleConnectionError(
      sessionError,
      async () => {
        // The signaling client has auto-reconnect logic
        // Just try to rejoin the room if we have a roomId
        if (roomId) {
          await signalingClient.joinRoom(roomId, userRole || 'listener');
        } else {
          throw new Error('No room ID available for reconnection');
        }
      },
      (attempt, delay) => {
        // Show countdown during retry
        setRetryCountdown(Math.ceil(delay / 1000));
      },
      () => {
        // Failed all retry attempts
        retryInProgressRef.current = false;
        setRetryCountdown(undefined);
        setSessionError({
          type: 'connection-failed',
          message: 'Unable to reconnect to the session. Please refresh the page or leave the room.',
          canRetry: false,
        });
      }
    );
  }, [sessionError, signalingClient, roomId, userRole]);

  const handleDismissError = useCallback(() => {
    setSessionError(null);
    setRetryCountdown(undefined);
  }, []);

  const statusBadgeStyles = useMemo(() => {
    return {
      ...statusBadgeBaseStyles,
      backgroundColor: connectionStatusColors[connectionStatus],
      color: connectionStatusTextColors[connectionStatus],
    } satisfies CSSProperties;
  }, [connectionStatus]);

  const rolePanel = useMemo(
    () => getRolePanel(userRole, controlChannel, peerManagerRef.current),
    [userRole, controlChannel],
  );

  return (
    <main style={pageStyles}>
      <header style={headerStyles}>
        <div style={headerRowStyles}>
          <div>
            <h1 style={{ margin: 0 }}>Session {roomId ? `#${roomId}` : ''}</h1>
            <p style={roleLabelStyles}>Role: {formatRoleLabel(userRole)}</p>
          </div>
          <Button variant="danger" onClick={handleLeaveRoom} ariaLabel="Leave the room">
            Leave Room
          </Button>
        </div>
        <div style={statusContainerStyles}>
          <span style={statusBadgeStyles}>{formatConnectionStatus(connectionStatus)}</span>
          <span style={{ color: 'var(--text-secondary, #a0a0a0)', fontSize: '0.9rem' }}>
            Status updates automatically as your connection changes.
          </span>
        </div>
      </header>

      {/* Error Display */}
      {sessionError && (
        <ErrorDisplay
          error={sessionError}
          onRetry={sessionError.type === 'connection-failed' ? handleRetryConnection : undefined}
          onDismiss={handleDismissError}
          retryCountdown={retryCountdown}
        />
      )}

      <section style={contentStyles}>
        <div>{rolePanel}</div>
        <ParticipantList />
      </section>
    </main>
  );
};

SessionPage.displayName = 'SessionPage';

export default SessionPage;
