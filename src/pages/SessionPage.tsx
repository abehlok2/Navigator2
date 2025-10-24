import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ExplorerPanel, FacilitatorPanel, ListenerPanel, ParticipantList } from '../components/session';
import { ErrorDisplay } from '../components/session/ErrorDisplay';
import { Button, Card } from '../components/ui';
import { useSessionStore } from '../state/session';
import { useSignalingClient, ControlChannel, PeerConnectionManager } from '../features/webrtc';
import { getStoredToken } from '../features/auth/client';
import type { ConnectionStatus, ParticipantRole } from '../types/session';
import type { SignalingClientEventMap } from '../types/signaling';
import type { SessionError } from '../features/webrtc/errors';
import { createSessionError, handleConnectionError } from '../features/webrtc/errors';
import { ExplorerAudioMixer, ListenerAudioMixer, FacilitatorAudioMixer } from '../features/audio';

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
  audioMixer: ExplorerAudioMixer | ListenerAudioMixer | FacilitatorAudioMixer | null,
) => {
  switch (role) {
    case 'facilitator':
      return <FacilitatorPanel controlChannel={controlChannel} peerManager={peerManager} />;
    case 'explorer':
      return <ExplorerPanel
        controlChannel={controlChannel}
        peerManager={peerManager}
        audioMixer={audioMixer instanceof ExplorerAudioMixer ? audioMixer : null}
      />;
    case 'listener':
      return <ListenerPanel audioMixer={audioMixer instanceof ListenerAudioMixer ? audioMixer : null} />;
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
  const userId = useSessionStore((state) => state.userId);
  const roomPassword = useSessionStore((state) => state.roomPassword);
  const clearSession = useSessionStore((state) => state.clearSession);
  const addParticipant = useSessionStore((state) => state.addParticipant);
  const removeParticipant = useSessionStore((state) => state.removeParticipant);
  const setParticipants = useSessionStore((state) => state.setParticipants);
  const setConnectionStatus = useSessionStore((state) => state.setConnectionStatus);
  const setRoom = useSessionStore((state) => state.setRoom);

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

  // Audio mixers for receiving/mixing audio
  const audioMixerRef = useRef<ExplorerAudioMixer | ListenerAudioMixer | FacilitatorAudioMixer | null>(null);
  const [audioMixer, setAudioMixer] = useState<
    ExplorerAudioMixer | ListenerAudioMixer | FacilitatorAudioMixer | null
  >(null);

  // Track metadata for identifying track types
  const trackMetadataRef = useRef<Map<string, 'facilitator-mic' | 'background' | 'explorer-mic'>>(new Map());

  // Track order counter for identifying tracks by order of receipt
  // Track #1 from facilitator = Facilitator mic, Track #2 = Background audio
  const participantTrackCountRef = useRef<Map<string, number>>(new Map());

  // Auto-rejoin logic: Attempt to rejoin room after refresh if session data is persisted
  const autoRejoinAttemptedRef = useRef(false);
  useEffect(() => {
    // Only attempt auto-rejoin once
    if (autoRejoinAttemptedRef.current) {
      return;
    }

    // Check if we're not connected and have a roomId in the URL
    if (connectionStatus === 'connected' || !roomId) {
      return;
    }

    // Get persisted session state
    const sessionState = useSessionStore.getState();
    const hasPersistedSession =
      sessionState.roomId &&
      sessionState.userRole &&
      sessionState.roomPassword !== undefined;

    // If we have persisted session data matching the URL roomId, auto-rejoin
    if (hasPersistedSession && sessionState.roomId === roomId) {
      console.log('[SessionPage] Detected page refresh with persisted session. Auto-rejoining room...');
      autoRejoinAttemptedRef.current = true;

      // Attempt to rejoin the room
      const attemptRejoin = async () => {
        try {
          setConnectionStatus('connecting');

          const passwordToUse = sessionState.roomPassword ?? '';
          const roleToUse = sessionState.userRole;

          // Connect to signaling server (will reuse existing connection if already connected)
          const token = getStoredToken();
          if (!token) {
            throw new Error('No authentication token found');
          }
          await signalingClient.connect(token);

          const { participantId, participants } = await signalingClient.joinRoom(
            roomId,
            passwordToUse ?? '',
            roleToUse && roleToUse !== 'facilitator' ? roleToUse : undefined,
          );

          const normalizedParticipants = participants.map((participant) => ({ ...participant }));

          if (!normalizedParticipants.some((participant) => participant.id === participantId)) {
            normalizedParticipants.push({
              id: participantId,
              username: 'You',
              role: roleToUse ?? 'listener',
              isOnline: true,
            });
          }

          setRoom({
            roomId,
            role: roleToUse ?? 'listener',
            userId: participantId,
            password: passwordToUse ? passwordToUse : null,
            participants: normalizedParticipants,
          });
          setParticipants(normalizedParticipants);
          setConnectionStatus('connected');
          setSessionError(null);

          console.log('[SessionPage] Successfully auto-rejoined room');
        } catch (error) {
          console.error('[SessionPage] Auto-rejoin failed:', error);
          setConnectionStatus('error');
          setSessionError(
            createSessionError(error, 'Failed to reconnect to the session after page refresh')
          );
        }
      };

      void attemptRejoin();
    }
  }, [connectionStatus, roomId, signalingClient, setRoom, setParticipants, setConnectionStatus]);

  // Initialize audio mixer for all roles
  useEffect(() => {
    if (!userRole) {
      return;
    }

    if (!audioMixerRef.current) {
      console.log(`[SessionPage] Initializing audio mixer for ${userRole}`);

      if (userRole === 'explorer') {
        const mixer = new ExplorerAudioMixer();
        audioMixerRef.current = mixer;
        setAudioMixer(mixer);
      } else if (userRole === 'listener') {
        const mixer = new ListenerAudioMixer();
        audioMixerRef.current = mixer;
        setAudioMixer(mixer);
      } else if (userRole === 'facilitator') {
        const mixer = new FacilitatorAudioMixer();
        audioMixerRef.current = mixer;
        setAudioMixer(mixer);
      }
    }

    return () => {
      // Cleanup mixer on unmount or role change
      if (audioMixerRef.current) {
        console.log('[SessionPage] Cleaning up audio mixer');
        audioMixerRef.current.disconnect();
        audioMixerRef.current = null;
        setAudioMixer(null);
      }
    };
  }, [userRole]);

  // Ensure the listener/explorer audio context is resumed on first user interaction
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (!userRole || userRole === 'facilitator') {
      return;
    }

    if (!audioMixer) {
      return;
    }

    const interactionEvents: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown'];

    let unlocked = false;

    const handleInteraction = () => {
      if (unlocked) {
        return;
      }

      unlocked = true;
      void audioMixer.resumeAudioContext();
      removeEventListeners();
    };

    const removeEventListeners = () => {
      interactionEvents.forEach((event) => {
        document.removeEventListener(event, handleInteraction);
      });
    };
    interactionEvents.forEach((event) => {
      document.addEventListener(event, handleInteraction, { passive: true });
    });

    return () => {
      removeEventListeners();
    };
  }, [userRole, audioMixer]);

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

        // Reset track count on connection state changes (closed, failed, disconnected)
        // This ensures proper track identification when reconnecting
        if (state === 'closed' || state === 'failed' || state === 'disconnected') {
          participantTrackCountRef.current.delete(participantId);
          console.log(`[SessionPage] Reset track count for ${participantId} due to connection state: ${state}`);
        }

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
      manager.on('track', async ({ participantId, track, streams }) => {
        console.log(`[SessionPage] ========== TRACK RECEIVED ==========`);
        console.log(`[SessionPage] Participant: ${participantId}`);
        console.log(`[SessionPage] Track kind: ${track.kind}`);
        console.log(`[SessionPage] Track ID: ${track.id}`);
        console.log(`[SessionPage] Track enabled: ${track.enabled}`);
        console.log(`[SessionPage] Track muted: ${track.muted}`);
        console.log(`[SessionPage] Track readyState: ${track.readyState}`);
        console.log(`[SessionPage] Streams count: ${streams.length}`);

        if (streams.length > 0) {
          const stream = streams[0];
          console.log(`[SessionPage] Stream ID: ${stream.id}`);
          console.log(`[SessionPage] Stream active: ${stream.active}`);
          console.log(`[SessionPage] Stream audio tracks: ${stream.getAudioTracks().length}`);
          console.log(`[SessionPage] Stream video tracks: ${stream.getVideoTracks().length}`);
        }

        console.log(`[SessionPage] Current user role: ${userRole}`);
        console.log(`[SessionPage] Mixer instance type: ${audioMixerRef.current?.constructor.name || 'null'}`);

        // Handle audio tracks
        if (track.kind === 'audio') {
          const trackLabel = track.label?.toLowerCase() ?? '';

          // Increment track count for this participant to determine track order
          const currentTrackCount = participantTrackCountRef.current.get(participantId) || 0;
          const trackNumber = currentTrackCount + 1;
          participantTrackCountRef.current.set(participantId, trackNumber);

          console.log(`[SessionPage] Track number for ${participantId}: ${trackNumber}`);

          // Identify track type using multiple methods (in order of reliability):
          // 1. Track order (most reliable) - Track #1 = Facilitator mic, Track #2 = Background
          // 2. Track metadata from control channel
          // 3. contentHint attribute
          // 4. Track label

          let isBackgroundTrack = false;
          let identificationMethod = 'unknown';

          // Method 1: Track order (primary method)
          if (userRole !== 'facilitator') {
            // For non-facilitators receiving from facilitator:
            // Track #1 = Facilitator mic, Track #2 = Background audio
            if (trackNumber === 1) {
              isBackgroundTrack = false;
              identificationMethod = 'track-order-1-facilitator';
            } else if (trackNumber === 2) {
              isBackgroundTrack = true;
              identificationMethod = 'track-order-2-background';
            }
          }

          // Method 2: Check track metadata (fallback/validation)
          const trackType = trackMetadataRef.current.get(track.id);
          if (trackType) {
            const metadataIsBackground = trackType === 'background';
            if (identificationMethod !== 'unknown' && isBackgroundTrack !== metadataIsBackground) {
              console.warn(`[SessionPage] Track identification mismatch! Order says ${isBackgroundTrack ? 'background' : 'facilitator'}, metadata says ${trackType}`);
            }
            // Trust metadata if track order identification failed
            if (identificationMethod === 'unknown') {
              isBackgroundTrack = metadataIsBackground;
              identificationMethod = 'metadata';
            }
          }

          // Method 3: Check contentHint (fallback)
          if (identificationMethod === 'unknown' && track.contentHint) {
            if (track.contentHint === 'music') {
              isBackgroundTrack = true;
              identificationMethod = 'contentHint';
            } else if (track.contentHint === 'speech') {
              isBackgroundTrack = false;
              identificationMethod = 'contentHint';
            }
          }

          // Method 4: Check track label (last resort)
          if (identificationMethod === 'unknown') {
            if (trackLabel.includes('background') || trackLabel.includes('music')) {
              isBackgroundTrack = true;
              identificationMethod = 'label';
            } else if (trackLabel.includes('facilitator') || trackLabel.includes('mic')) {
              isBackgroundTrack = false;
              identificationMethod = 'label';
            }
          }

          console.log(`[SessionPage] Track type from metadata: ${trackType || 'unknown'}`);
          console.log(`[SessionPage] Track contentHint: ${track.contentHint || 'none'}`);
          console.log(`[SessionPage] Track identification method: ${identificationMethod}`);
          console.log(`[SessionPage] Is background track: ${isBackgroundTrack}`);

          // Validation: Warn if track cannot be identified
          if (identificationMethod === 'unknown') {
            console.warn(`[SessionPage] ⚠️ Could not identify track type! Defaulting to facilitator mic. Track info:`, {
              trackId: track.id,
              trackLabel: trackLabel,
              contentHint: track.contentHint,
              trackNumber,
              participantId,
            });
          }

          const stream = streams[0] ?? new MediaStream([track]);
          console.log(`[SessionPage] Using stream from: ${streams[0] ? 'WebRTC streams array' : 'new MediaStream created from track'}`);
          console.log(`[SessionPage] Stream active: ${stream.active}, ID: ${stream.id}`);

          // ⚠️ CRITICAL: Wait for stream to be active
          if (!stream.active) {
            console.log('[SessionPage] Stream not active yet, waiting...');
            await new Promise<void>((resolve) => {
              if (stream.active) {
                resolve();
                return;
              }

              const checkActive = () => {
                if (stream.active) {
                  stream.removeEventListener('addtrack', checkActive);
                  resolve();
                }
              };

              stream.addEventListener('addtrack', checkActive);

              // Poll as backup
              const interval = setInterval(() => {
                if (stream.active) {
                  clearInterval(interval);
                  stream.removeEventListener('addtrack', checkActive);
                  resolve();
                }
              }, 100);

              setTimeout(() => {
                clearInterval(interval);
                stream.removeEventListener('addtrack', checkActive);
                console.log(`[SessionPage] Stream activation timeout, proceeding (active: ${stream.active})`);
                resolve();
              }, 3000);
            });
          }

          console.log(`[SessionPage] Stream state after validation - active: ${stream.active}`);

          const mixer = audioMixerRef.current;

          if (!mixer) {
            console.warn('[SessionPage] No audio mixer available to route track');
            return;
          }

          if (userRole === 'facilitator') {
            // Facilitator receiving audio from explorer
            console.log(`[SessionPage] Routing explorer audio from ${participantId} to facilitator mixer`);

            if (mixer instanceof FacilitatorAudioMixer) {
              mixer.connectExplorerMicrophone(participantId, stream);
            }
          } else {
            // Explorer or Listener receiving audio from facilitator
            console.log(
              `[SessionPage] Routing ${isBackgroundTrack ? 'background' : 'facilitator'} audio to ${userRole} mixer`,
            );

            if (mixer instanceof ExplorerAudioMixer) {
              // ⚠️ NOW PROPERLY AWAIT THE ASYNC METHODS
              if (isBackgroundTrack) {
                console.log('[SessionPage] Calling mixer.connectBackgroundStream()');
                await mixer.connectBackgroundStream(stream);
              } else {
                console.log('[SessionPage] Calling mixer.connectFacilitatorStream()');
                await mixer.connectFacilitatorStream(stream);
              }

              console.log('[SessionPage] Audio connection complete, verifying AudioContext state');
              console.log(`[SessionPage] AudioContext state: ${mixer['audioContext'].state}`);
            } else if (mixer instanceof ListenerAudioMixer) {
              // Listener mixer adds facilitator/background as audio sources
              console.log('[SessionPage] Calling mixer.addAudioSource()');
              await mixer.addAudioSource(
                participantId,
                stream,
                isBackgroundTrack ? 'Background' : 'Facilitator',
              );
              console.log('[SessionPage] Audio connection complete, verifying AudioContext state');
            }
          }

          console.log(`[SessionPage] ========== TRACK HANDLING COMPLETE ==========`);
        } else {
          console.log(`[SessionPage] Skipping track (kind: ${track.kind}, streams: ${streams.length})`);
        }
      });

      // Listen for data channels
      manager.on('dataChannel', ({ participantId, channel }) => {
        console.log(`[SessionPage] Received data channel from ${participantId}: ${channel.label}`);

        // If this is the control channel and we're not the facilitator, use it
        if (channel.label === 'control' && userRole !== 'facilitator') {
          if (!controlChannelRef.current) {
            const controlCh = new ControlChannel();
            controlCh.setDataChannel(channel, participantId);
            controlChannelRef.current = controlCh;
            setControlChannel(controlCh);
            console.log(`[SessionPage] Control channel initialized from facilitator ${participantId}`);
          } else {
            // Already have a control channel, just add this data channel
            controlChannelRef.current.setDataChannel(channel, participantId);
            console.log(`[SessionPage] Added control data channel from ${participantId}`);
          }
        }
      });

      // Listen for negotiation needed
      manager.on('negotiationNeeded', async ({ participantId, connection }) => {
        console.log(`[SessionPage] Negotiation needed for ${participantId}`);

        // Be polite: only offer when stable
        if (connection.signalingState !== 'stable') {
          console.log('[SessionPage] Skip offer; signalingState:', connection.signalingState);
          return;
        }
      
        // Coalesce: only offer if there’s actually something to negotiate:
        //  - at least one sender has a track, OR
        //  - any transceiver's desired direction differs from its currentDirection
        const hasAnyTrack = connection.getSenders().some(s => !!s.track);
        const hasDirChanges = connection.getTransceivers().some(t => {
          // If currentDirection is null (pre-answer), we still allow an offer
          return t.currentDirection == null || (t.direction && t.direction !== t.currentDirection);
  });

  if (!hasAnyTrack && !hasDirChanges) {
    console.log('[SessionPage] Skip offer; no tracks attached and no direction changes pending');
    return;
  }

  try {
    const offer = await manager.createOffer(participantId);
    signalingClient.sendOffer(participantId, offer);
    console.log('[SessionPage] Sent offer to', participantId);
  } catch (e) {
    console.error('[SessionPage] Failed to create/send offer:', e);
  }
});

    // Initialize control channel for facilitator role
    // This is outside the peer manager creation block so it can be created
    // even if the peer manager already exists (e.g., when userRole changes to facilitator)
    if (connectionStatus === 'connected' && userRole === 'facilitator' && !controlChannelRef.current) {
      console.log('[SessionPage] Initializing ControlChannel for facilitator');
      const controlCh = new ControlChannel();
      controlChannelRef.current = controlCh;
      setControlChannel(controlCh);
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
    // Note: controlChannel is intentionally omitted from dependencies to avoid
    // triggering cleanup/reinitialization when its state updates. The
    // ControlChannel instance is stored in a ref and does not need effect
    // re-execution on render updates.
  }, [connectionStatus, signalingClient, userRole]);

  useEffect(() => {
    const handleRoomJoined = (payload: SignalingClientEventMap['roomJoined']) => {
      setParticipants(payload.participants.map((participant) => ({ ...participant })));
      setConnectionStatus('connected');

      // Create peer connections for existing participants
      if (peerManagerRef.current) {
        payload.participants.forEach((participant) => {
          // Don't create connection to ourselves
          if (participant.id === userId) {
            return;
          }

          console.log(`[SessionPage] Creating peer connection for existing participant: ${participant.id}`);
          peerManagerRef.current!.createConnection(participant.id);

          // If we're the facilitator, create control data channel for this participant
          if (userRole === 'facilitator') {
            const pc = peerManagerRef.current!.getConnection(participant.id);
            if (pc) {
              console.log(`[SessionPage] Creating control data channel for existing participant ${participant.id}`);
              const dataChannel = pc.createDataChannel('control');

              // Add the data channel to the control channel
              if (controlChannelRef.current) {
                controlChannelRef.current.setDataChannel(dataChannel, participant.id);
                console.log(`[SessionPage] Added control data channel for ${participant.id}`);
              }
            }
          }
        });
      }
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

        // If we're the facilitator, create a control data channel for this participant
        if (userRole === 'facilitator') {
          const pc = peerManagerRef.current.getConnection(participantId);
          if (pc) {
            console.log(`[SessionPage] Creating control data channel for ${participantId}`);
            const dataChannel = pc.createDataChannel('control');

            // Add the data channel to the control channel
            if (controlChannelRef.current) {
              controlChannelRef.current.setDataChannel(dataChannel, participantId);
              console.log(`[SessionPage] Added control data channel for ${participantId}`);
            } else {
              console.warn('[SessionPage] Control channel not initialized for facilitator');
            }
          }
        }
      }
    };

    const handleParticipantLeft = ({ participantId }: SignalingClientEventMap['participantLeft']): void => {
      const participant = useSessionStore.getState().participants.find(p => p.id === participantId);
      removeParticipant(participantId);

      // If we're a facilitator and an explorer left, disconnect their mic from the mixer
      if (userRole === 'facilitator' && audioMixerRef.current instanceof FacilitatorAudioMixer) {
        console.log(`[SessionPage] Disconnecting explorer ${participantId} from facilitator mixer`);
        audioMixerRef.current.disconnectExplorerMicrophone(participantId);
      }

      // Reset track count for this participant
      participantTrackCountRef.current.delete(participantId);
      console.log(`[SessionPage] Reset track count for ${participantId}`);

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

        const pc = peerManagerRef.current.getConnection(from);
        if (!pc) {
          throw new Error(`Failed to get peer connection for ${from}`);
        }

        // Set remote description
        await peerManagerRef.current.setRemoteDescription(from, description);

        // ⚠️ CRITICAL: Set transceiver directions based on role
        const transceivers = pc.getTransceivers();
        console.log(`[SessionPage] Found ${transceivers.length} transceivers for ${from}`);

        transceivers.forEach((transceiver, index) => {
          console.log(`[SessionPage] Transceiver ${index} before answer:`, {
            mid: transceiver.mid,
            direction: transceiver.direction,
            currentDirection: transceiver.currentDirection,
            kind: transceiver.receiver?.track?.kind,
            hasSenderTrack: !!transceiver.sender?.track,
          });

          // Check if this transceiver is for outgoing audio (we're sending a track)
          const isOutgoingTrack = !!transceiver.sender?.track;

          if (isOutgoingTrack) {
            // This transceiver is for our outgoing track (e.g., explorer mic to facilitator)
            // Keep it as sendonly or sendrecv
            console.log(`[SessionPage] Transceiver ${index} is for outgoing track, leaving as ${transceiver.direction}`);
          } else {
            // This transceiver is for incoming track from remote peer
            // Set to recvonly to accept the remote track
            console.log(`[SessionPage] Setting transceiver ${index} to recvonly (incoming track)`);
            transceiver.direction = 'recvonly';
          }
        });

        // Create and send answer
        const answer = await peerManagerRef.current.createAnswer(from);

        // Log transceivers after answer creation to verify
        transceivers.forEach((transceiver, index) => {
          console.log(`[SessionPage] Transceiver ${index} after answer:`, {
            mid: transceiver.mid,
            direction: transceiver.direction,
            currentDirection: transceiver.currentDirection,
          });
        });

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
        const pc = peerManagerRef.current.getConnection(from);
        if (!pc) {
          throw new Error(`No peer connection found for ${from}`);
        }

        // Log transceivers before setting answer
        const transceivers = pc.getTransceivers();
        console.log(`[SessionPage] Found ${transceivers.length} transceivers before setting answer for ${from}`);
        transceivers.forEach((transceiver, index) => {
          console.log(`[SessionPage] Transceiver ${index} before setting answer:`, {
            mid: transceiver.mid,
            direction: transceiver.direction,
            currentDirection: transceiver.currentDirection,
            sender: transceiver.sender?.track?.kind,
            senderTrackId: transceiver.sender?.track?.id,
          });
        });

        await peerManagerRef.current.setRemoteDescription(from, description);
        console.log(`[SessionPage] Set remote description (answer) for ${from}`);

        // Log transceivers after setting answer to verify negotiation succeeded
        transceivers.forEach((transceiver, index) => {
          console.log(`[SessionPage] Transceiver ${index} after setting answer:`, {
            mid: transceiver.mid,
            direction: transceiver.direction,
            currentDirection: transceiver.currentDirection,
          });

          // Verify the transceiver is in the correct state
          if (transceiver.currentDirection === 'inactive') {
            console.error(`[SessionPage] ⚠️ Transceiver ${index} is INACTIVE after answer - audio will not flow!`);
          } else if (transceiver.currentDirection === 'sendonly' && transceiver.sender?.track) {
            console.log(`[SessionPage] ✓ Transceiver ${index} is sendonly - sending track ${transceiver.sender.track.id}`);
          } else if (transceiver.currentDirection === 'recvonly' && transceiver.receiver?.track) {
            console.log(`[SessionPage] ✓ Transceiver ${index} is recvonly - receiving track ${transceiver.receiver.track.id}`);
          }
        });
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
    userId,
  ]);

  // Listen for track metadata messages to identify track types
  useEffect(() => {
    const controlCh = controlChannelRef.current;
    if (!controlCh || userRole === 'facilitator') {
      return;
    }

    const handleTrackMetadata = (message: import('../types/control-messages').AudioTrackMetadataMessage) => {
      console.log(`[SessionPage] Received track metadata: trackId=${message.trackId}, type=${message.trackType}, streamId=${message.streamId}`);
      trackMetadataRef.current.set(message.trackId, message.trackType);
    };

    controlCh.on('audio:track-metadata', handleTrackMetadata);

    return () => {
      controlCh.off('audio:track-metadata', handleTrackMetadata);
    };
  }, [userRole]);

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
        const currentRoomId = roomId ?? useSessionStore.getState().roomId;
        if (!currentRoomId) {
          throw new Error('No room ID available for reconnection');
        }

        const passwordToUse =
          roomPassword ?? useSessionStore.getState().roomPassword ?? '';
        const roleToUse = userRole ?? useSessionStore.getState().userRole;

        const { participantId, participants } = await signalingClient.joinRoom(
          currentRoomId,
          passwordToUse ?? '',
          roleToUse && roleToUse !== 'facilitator' ? roleToUse : undefined,
        );

        const normalizedParticipants = participants.map((participant) => ({ ...participant }));
        const existingSelfDetails = useSessionStore
          .getState()
          .participants.find((participant) => participant.id === participantId);

        if (!normalizedParticipants.some((participant) => participant.id === participantId)) {
          normalizedParticipants.push(
            existingSelfDetails ?? {
              id: participantId,
              username: 'You',
              role: roleToUse ?? 'listener',
              isOnline: true,
            },
          );
        }

        setRoom({
          roomId: currentRoomId,
          role: roleToUse ?? 'listener',
          userId: participantId,
          password: passwordToUse ? passwordToUse : null,
          participants: normalizedParticipants,
        });
        setParticipants(normalizedParticipants);
        setConnectionStatus('connected');
        setSessionError(null);
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
    retryInProgressRef.current = false;
    setRetryCountdown(undefined);
  }, [
    sessionError,
    signalingClient,
    roomId,
    userRole,
    roomPassword,
    setConnectionStatus,
    setParticipants,
    setRoom,
    setSessionError,
  ]);

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
    () => getRolePanel(userRole, controlChannel, peerManagerRef.current, audioMixer),
    [userRole, controlChannel, audioMixer],
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
