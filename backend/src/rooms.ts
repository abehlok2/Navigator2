import crypto from 'crypto';
import type { WebSocket } from 'ws';

export type ParticipantRole = 'facilitator' | 'explorer' | 'listener';

export interface ParticipantMetadata {
  id: string;
  username: string;
  role: ParticipantRole;
  isOnline: boolean;
}

export interface ParticipantState {
  id: string;
  userId: string;
  username: string;
  role: ParticipantRole;
  socket: WebSocket;
}

export interface Room {
  id: string;
  password: string;
  ownerUserId: string;
  participants: Map<string, ParticipantState>;
}

export class RoomStore {
  private roomsById = new Map<string, Room>();

  createRoom({ ownerUserId, password }: { ownerUserId: string; password: string }): Room {
    const room: Room = {
      id: crypto.randomUUID(),
      password,
      ownerUserId,
      participants: new Map(),
    };

    this.roomsById.set(room.id, room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.roomsById.get(roomId);
  }

  deleteRoom(roomId: string): void {
    this.roomsById.delete(roomId);
  }

  listParticipants(room: Room): ParticipantMetadata[] {
    return Array.from(room.participants.values()).map((participant) => ({
      id: participant.id,
      username: participant.username,
      role: participant.role,
      isOnline: true,
    }));
  }

  removeParticipant(room: Room, participantId: string): void {
    room.participants.delete(participantId);

    if (room.participants.size === 0) {
      this.deleteRoom(room.id);
    }
  }

  getActiveCount(): number {
    return Array.from(this.roomsById.values()).filter((room) => room.participants.size > 0).length;
  }

  addParticipant(room: Room, participant: ParticipantState): void {
    if (room.participants.has(participant.id)) {
      throw new Error('Participant already joined.');
    }

    room.participants.set(participant.id, participant);
  }

  verifyPassword(room: Room, password: string): boolean {
    return room.password === password;
  }
}
