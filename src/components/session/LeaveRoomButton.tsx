import type { FC, MouseEventHandler } from 'react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../ui';
import { useSignalingClient } from '../../features/webrtc';
import { useSessionStore } from '../../state/session';
import type { LeaveRoomCallback } from '../../types/session';

export interface LeaveRoomButtonProps {
  onLeave?: LeaveRoomCallback;
}

export const LeaveRoomButton: FC<LeaveRoomButtonProps> = ({ onLeave }) => {
  const navigate = useNavigate();
  const signalingClient = useSignalingClient();
  const clearSession = useSessionStore((state) => state.clearSession);

  const handleLeave = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      event.preventDefault();

      const confirmed = window.confirm('Are you sure you want to leave?');

      if (!confirmed) {
        return;
      }

      signalingClient.leaveRoom();
      clearSession();
      onLeave?.();
      navigate('/home');
    },
    [clearSession, navigate, onLeave, signalingClient],
  );

  return (
    <Button variant="danger" onClick={handleLeave} ariaLabel="Leave the room">
      Leave Room
    </Button>
  );
};

LeaveRoomButton.displayName = 'LeaveRoomButton';

export default LeaveRoomButton;
