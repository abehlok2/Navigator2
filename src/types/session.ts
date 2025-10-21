export type ParticipantRole = 'facilitator' | 'explorer' | 'listener';

export interface Participant {
  id: string;
  username: string;
  role: ParticipantRole;
  isOnline: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SessionOverview {
  roomId: string;
  participantCount: number;
  connectionStatus: ConnectionStatus;
}

export type LeaveRoomCallback = () => void;
