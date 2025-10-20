import crypto from 'crypto';
import type { WebSocket } from 'ws';
import type { PublicUser } from './users.js';

export interface ParticipantMetadata {
  id: string;
  displayName?: string;
  isPublisher?: boolean;
  muted?: boolean;
}

export interface ParticipantState {
  clientId: string;
  user: PublicUser;
  socket: WebSocket;
  roomId?: string;
  metadata: ParticipantMetadata;
}

export interface Room {
  id: string;
  name: string;
  maxParticipants: number;
  ownerUserId: string;
  participants: Map<string, ParticipantState>;
}

export class RoomStore {
  private roomsById = new Map<string, Room>();
  private roomsByName = new Map<string, Room>();

  createRoom({ name, maxParticipants, ownerUserId }: { name: string; maxParticipants: number; ownerUserId: string }): Room {
    const existing = this.roomsByName.get(name.toLowerCase());
    if (existing) {
      throw new Error('Room with that name already exists');
    }

    const room: Room = {
      id: crypto.randomUUID(),
      name,
      maxParticipants,
      ownerUserId,
      participants: new Map(),
    };

    this.roomsById.set(room.id, room);
    this.roomsByName.set(name.toLowerCase(), room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.roomsById.get(roomId);
  }

  listParticipants(room: Room): ParticipantMetadata[] {
    return Array.from(room.participants.values()).map((participant) => participant.metadata);
  }

  deleteParticipant(room: Room, clientId: string) {
    room.participants.delete(clientId);
    if (room.participants.size === 0) {
      this.roomsById.delete(room.id);
      this.roomsByName.delete(room.name.toLowerCase());
    }
  }

  getActiveCount(): number {
    return Array.from(this.roomsById.values()).filter((room) => room.participants.size > 0).length;
  }

  addParticipant(room: Room, participant: ParticipantState) {
    if (room.participants.size >= room.maxParticipants) {
      throw new Error('Room at capacity');
    }
    if (room.participants.has(participant.clientId)) {
      throw new Error('Participant already joined.');
    }
    room.participants.set(participant.clientId, participant);
  }
}
