import { create } from 'zustand';

import type {
  ConnectionStatus,
  Participant,
  ParticipantRole,
} from '../types/session';

export interface SessionState {
  roomId: string | null;
  participants: Participant[];
  isConnected: boolean;
  userRole: ParticipantRole | null;
  connectionStatus: ConnectionStatus;
  setRoom: (roomId: string, role: ParticipantRole, participants?: Participant[]) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearSession: () => void;
}

const initialState: Omit<
  SessionState,
  'setRoom' | 'setParticipants' | 'addParticipant' | 'removeParticipant' | 'setConnectionStatus' | 'clearSession'
>
  = {
    roomId: null,
    participants: [],
    isConnected: false,
    userRole: null,
    connectionStatus: 'disconnected',
  };

export const useSessionStore = create<SessionState>()((set) => ({
  ...initialState,
  setRoom(roomId, role, participants = []) {
    set(() => ({
      roomId,
      userRole: role,
      participants,
      isConnected: false,
      connectionStatus: 'connecting',
    }));
  },
  setParticipants(participants) {
    set(() => ({ participants } satisfies Partial<SessionState>));
  },
  addParticipant(participant) {
    set((state) => {
      const existingIndex = state.participants.findIndex(({ id }) => id === participant.id);

      if (existingIndex !== -1) {
        const updatedParticipants = state.participants.slice();
        updatedParticipants[existingIndex] = participant;

        return {
          participants: updatedParticipants,
        } satisfies Partial<SessionState>;
      }

      return {
        participants: [...state.participants, participant],
      } satisfies Partial<SessionState>;
    });
  },
  removeParticipant(participantId) {
    set((state) => ({
      participants: state.participants.filter(({ id }) => id !== participantId),
    }));
  },
  setConnectionStatus(status) {
    set(() => ({
      connectionStatus: status,
      isConnected: status === 'connected',
    }));
  },
  clearSession() {
    set(() => ({
      ...initialState,
    }));
  },
}));
