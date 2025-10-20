import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ExplorerPanel, FacilitatorPanel, ListenerPanel, ParticipantList } from '../components/session';
import { Button, Card } from '../components/ui';
import { useSessionStore } from '../state/session';
import { useSignalingClient } from '../features/webrtc';
import type { ConnectionStatus, ParticipantRole } from '../types/session';
import type { SignalingClientEventMap } from '../types/signaling';

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

const getRolePanel = (role: ParticipantRole | null) => {
  switch (role) {
    case 'facilitator':
      return <FacilitatorPanel />;
    case 'explorer':
      return <ExplorerPanel />;
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
    };

    const handleParticipantLeft = ({ participantId }: SignalingClientEventMap['participantLeft']): void => {
      removeParticipant(participantId);
    };

    const handleConnected = (): void => {
      setConnectionStatus('connected');
    };

    const handleReconnecting = (_payload: SignalingClientEventMap['reconnecting']): void => {
      setConnectionStatus('connecting');
    };

    const handleDisconnected = (_payload: SignalingClientEventMap['disconnected']): void => {
      setConnectionStatus('disconnected');
    };

    const handleError = (_payload: SignalingClientEventMap['error']): void => {
      setConnectionStatus('error');
    };

    signalingClient.on('roomJoined', handleRoomJoined);
    signalingClient.on('participantJoined', handleParticipantJoined);
    signalingClient.on('participantLeft', handleParticipantLeft);
    signalingClient.on('connected', handleConnected);
    signalingClient.on('reconnected', handleConnected);
    signalingClient.on('reconnecting', handleReconnecting);
    signalingClient.on('disconnected', handleDisconnected);
    signalingClient.on('error', handleError);

    return () => {
      signalingClient.off('roomJoined', handleRoomJoined);
      signalingClient.off('participantJoined', handleParticipantJoined);
      signalingClient.off('participantLeft', handleParticipantLeft);
      signalingClient.off('connected', handleConnected);
      signalingClient.off('reconnected', handleConnected);
      signalingClient.off('reconnecting', handleReconnecting);
      signalingClient.off('disconnected', handleDisconnected);
      signalingClient.off('error', handleError);
    };
  }, [
    addParticipant,
    removeParticipant,
    setConnectionStatus,
    setParticipants,
    signalingClient,
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

  const statusBadgeStyles = useMemo(() => {
    return {
      ...statusBadgeBaseStyles,
      backgroundColor: connectionStatusColors[connectionStatus],
      color: connectionStatusTextColors[connectionStatus],
    } satisfies CSSProperties;
  }, [connectionStatus]);

  const rolePanel = useMemo(() => getRolePanel(userRole), [userRole]);

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

      <section style={contentStyles}>
        <div>{rolePanel}</div>
        <ParticipantList />
      </section>
    </main>
  );
};

SessionPage.displayName = 'SessionPage';

export default SessionPage;
