import type { CSSProperties } from 'react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Input } from '../components/ui';
import { useSignalingClient } from '../features/webrtc';
import { useAuthStore } from '../state/auth';
import { useSessionStore } from '../state/session';
import type { ParticipantRole } from '../types/session';

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
  const setParticipants = useSessionStore((state) => state.setParticipants);
  const setConnectionStatus = useSessionStore((state) => state.setConnectionStatus);
  const clearSession = useSessionStore((state) => state.clearSession);

  const navigate = useNavigate();

  const signalingClient = useSignalingClient();

  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPassword, setCreatePassword] = useState('');

  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  const userDisplayName = useMemo(() => {
    if (!user) {
      return 'Guest';
    }

    if (user.displayName && user.displayName.trim()) {
      return user.displayName.trim();
    }

    if (user.email.includes('@')) {
      const [namePart] = user.email.split('@');
      return namePart ?? user.email;
    }

    return user.email;
  }, [user]);

  const effectiveRole = useMemo<ParticipantRole>(() => user?.role ?? 'explorer', [user?.role]);

  useEffect(() => {
    if (!token) {
      return undefined;
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
      const trimmedPassword = createPassword.trim();
      const { roomId } = await signalingClient.createRoom(trimmedPassword);
      setCreatedRoomId(roomId);
      if (roomId) {
        setJoinRoomId(roomId);
      }
      if (createPassword) {
        setJoinPassword(trimmedPassword);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create a new room. Please try again.';
      setCreateError(message);
    } finally {
      setIsCreatingRoom(false);
    }
  }, [createPassword, ensureConnected, signalingClient]);

  const handleJoinRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedRoomId = joinRoomId.trim();
      const trimmedPassword = joinPassword.trim();

      if (!trimmedRoomId) {
        setJoinError('Room ID is required.');
        return;
      }

      if (!user) {
        setJoinError('You must be logged in to join a room.');
        return;
      }

      setIsJoiningRoom(true);
      setJoinError(null);

      try {
        await ensureConnected();
        const { participants } = await signalingClient.joinRoom(trimmedRoomId, trimmedPassword);

        const normalizedParticipants =
          participants.length > 0
            ? participants.map((participant) => ({ ...participant }))
            : [
                {
                  id: user.id,
                  username: userDisplayName,
                  role: effectiveRole,
                  isOnline: true,
                },
              ];

        setRoom(trimmedRoomId, effectiveRole, normalizedParticipants);
        setParticipants(normalizedParticipants);
        setConnectionStatus('connected');

        setJoinPassword(trimmedPassword);

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
    [
      ensureConnected,
      joinPassword,
      joinRoomId,
      navigate,
      setConnectionStatus,
      setParticipants,
      setRoom,
      signalingClient,
      user,
      userDisplayName,
      effectiveRole,
    ],
  );

  const handleLogout = useCallback(() => {
    signalingClient.disconnect();
    clearSession();
    logout();
    navigate('/', { replace: true });
  }, [clearSession, logout, navigate, signalingClient]);

  const roleLabel = useMemo(() => {
    return effectiveRole.charAt(0).toUpperCase() + effectiveRole.slice(1);
  }, [effectiveRole]);

  return (
    <main style={layoutStyles}>
      <header style={headerStyles}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>
            {`Welcome, ${userDisplayName} (${roleLabel})`}
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
        {effectiveRole === 'facilitator' ? (
          <Card title="Create New Room">
            <div style={cardContentStyles}>
              <p style={{ margin: 0, color: 'var(--text-secondary, #a0a0a0)' }}>
                Generate a new room for your session and share the ID with participants.
              </p>
              <Input
                label="Password"
                name="create-password"
                type="password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="Set an optional room password"
                disabled={isCreatingRoom}
              />
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
