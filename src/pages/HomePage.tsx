import type { CSSProperties } from 'react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Input } from '../components/ui';
import { SignalingClient } from '../features/webrtc';
import { useAuthStore } from '../state/auth';
import { useSessionStore } from '../state/session';

const layoutStyles: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  padding: '2rem',
  gap: '2rem',
  backgroundColor: 'var(--bg-primary, #1a1a1a)',
  color: 'var(--text-primary, #ffffff)',
};

const headerStyles: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem',
};

const cardsContainerStyles: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '1.5rem',
};

const cardContentStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const statusTextStyles: CSSProperties = {
  color: 'var(--accent, #4a9eff)',
  fontWeight: 600,
  wordBreak: 'break-word',
};

const errorTextStyles: CSSProperties = {
  color: 'var(--danger, #ff4a4a)',
  fontWeight: 500,
};

export const HomePage = () => {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const setRoom = useSessionStore((state) => state.setRoom);
  const clearSession = useSessionStore((state) => state.clearSession);

  const navigate = useNavigate();

  const signalingClientRef = useRef<SignalingClient>();

  if (!signalingClientRef.current) {
    signalingClientRef.current = new SignalingClient();
  }

  const signalingClient = signalingClientRef.current;

  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  useEffect(() => {
    if (!token) {
      return () => {
        signalingClient.disconnect();
      };
    }

    let isMounted = true;

    signalingClient
      .connect(token)
      .catch((error) => {
        if (isMounted) {
          setCreateError((current) => current ?? error.message);
          setJoinError((current) => current ?? error.message);
        }
      });

    return () => {
      isMounted = false;
      signalingClient.disconnect();
    };
  }, [signalingClient, token]);

  useEffect(() => {
    clearSession();
  }, [clearSession]);

  const ensureConnected = useCallback(async () => {
    if (!token) {
      throw new Error('Authentication token is missing. Please log in again.');
    }

    await signalingClient.connect(token);
  }, [signalingClient, token]);

  const handleCreateRoom = useCallback(async () => {
    setIsCreatingRoom(true);
    setCreateError(null);

    try {
      await ensureConnected();
      const { roomId } = await signalingClient.createRoom('');
      setCreatedRoomId(roomId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create a new room. Please try again.';
      setCreateError(message);
    } finally {
      setIsCreatingRoom(false);
    }
  }, [ensureConnected, signalingClient]);

  const handleJoinRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedRoomId = joinRoomId.trim();

      if (!trimmedRoomId) {
        setJoinError('Room ID is required.');
        return;
      }

      setIsJoiningRoom(true);
      setJoinError(null);

      try {
        await ensureConnected();
        await signalingClient.joinRoom(trimmedRoomId, joinPassword);

        if (user?.role) {
          setRoom(trimmedRoomId, user.role);
        }

        navigate(`/session/${encodeURIComponent(trimmedRoomId)}`);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to join the room. Please verify the details and try again.';
        setJoinError(message);
      } finally {
        setIsJoiningRoom(false);
      }
    },
    [ensureConnected, joinPassword, joinRoomId, navigate, setRoom, signalingClient, user?.role],
  );

  const handleLogout = useCallback(() => {
    signalingClient.disconnect();
    clearSession();
    logout();
    navigate('/', { replace: true });
  }, [clearSession, logout, navigate, signalingClient]);

  const roleLabel = useMemo(() => {
    return user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Unknown';
  }, [user?.role]);

  return (
    <main style={layoutStyles}>
      <header style={headerStyles}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>
            {`Welcome, ${user?.username ?? 'Guest'} (${roleLabel})`}
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #a0a0a0)' }}>
            Choose an option below to start or join a Navigator session.
          </p>
        </div>
        <Button variant="secondary" onClick={handleLogout} ariaLabel="Log out">
          Logout
        </Button>
      </header>

      <section style={cardsContainerStyles}>
        {user?.role === 'facilitator' ? (
          <Card title="Create New Room">
            <div style={cardContentStyles}>
              <p style={{ margin: 0, color: 'var(--text-secondary, #a0a0a0)' }}>
                Generate a new room for your session and share the ID with participants.
              </p>
              <Button onClick={handleCreateRoom} disabled={isCreatingRoom}>
                {isCreatingRoom ? 'Creating…' : 'Create Room'}
              </Button>
              {createdRoomId ? (
                <p aria-live="polite" style={statusTextStyles}>
                  Room created: <span style={{ fontSize: '1.1rem' }}>{createdRoomId}</span>
                </p>
              ) : null}
              {createError ? (
                <p role="alert" style={errorTextStyles}>
                  {createError}
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Card title="Join Existing Room">
          <form onSubmit={handleJoinRoom} style={cardContentStyles}>
            <Input
              label="Room ID"
              name="roomId"
              value={joinRoomId}
              onChange={(event) => {
                setJoinRoomId(event.target.value);
                if (joinError) {
                  setJoinError(null);
                }
              }}
              placeholder="Enter the room ID"
              disabled={isJoiningRoom}
            />
            <Input
              label="Password"
              name="password"
              type="password"
              value={joinPassword}
              onChange={(event) => {
                setJoinPassword(event.target.value);
                if (joinError) {
                  setJoinError(null);
                }
              }}
              placeholder="Enter the room password"
              disabled={isJoiningRoom}
            />
            {joinError ? (
              <p role="alert" style={errorTextStyles}>
                {joinError}
              </p>
            ) : null}
            <Button type="submit" disabled={isJoiningRoom}>
              {isJoiningRoom ? 'Joining…' : 'Join Room'}
            </Button>
          </form>
        </Card>
      </section>
    </main>
  );
};

HomePage.displayName = 'HomePage';

export default HomePage;
