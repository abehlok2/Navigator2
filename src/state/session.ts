import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  ConnectionStatus,
  Participant,
  ParticipantRole,
} from '../types/session';

export interface SessionState {
  roomId: string | null;
  userId: string | null;
  participants: Participant[];
  isConnected: boolean;
  userRole: ParticipantRole | null;
  roomPassword: string | null;
  connectionStatus: ConnectionStatus;
  setRoom: (params: {
    roomId: string;
    role: ParticipantRole;
    userId: string;
    password: string | null;
    participants?: Participant[];
  }) => void;
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
    userId: null,
    participants: [],
    isConnected: false,
    userRole: null,
    roomPassword: null,
    connectionStatus: 'disconnected',
  };

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...initialState,
      setRoom({ roomId, role, userId, password, participants = [] }) {
        set(() => ({
          roomId,
          userRole: role,
          userId,
          roomPassword: password,
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
    }),
    {
      name: 'navigator.session',
      // Only persist essential session data needed for reconnection
      partialize: (state) => ({
        roomId: state.roomId,
        userId: state.userId,
        userRole: state.userRole,
        roomPassword: state.roomPassword,
        // Don't persist connection status or participants list
      }),
    },
  ),
);
