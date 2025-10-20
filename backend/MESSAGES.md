# Navigator WebSocket Messages

This document outlines the message formats exchanged over the WebSocket connection between clients and the Navigator backend. Every payload is JSON encoded and contains a top-level `type` field that determines the structure of the `data` object.

Unless otherwise noted, the server acknowledges valid client messages with a message whose `type` is the original type appended with `.ack` and echoes back the relevant identifiers. Errors are reported with the `error` message type.

---

## Connection Lifecycle

### Client → Server: `connection.init`

Used immediately after establishing a WebSocket connection to authenticate the client.

```json
{
  "type": "connection.init",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "clientId": "a8f8ca9f-491f-4ec6-8396-07f4ec3b169d"
  }
}
```

#### Server Response

```json
{
  "type": "connection.init.ack",
  "data": {
    "clientId": "a8f8ca9f-491f-4ec6-8396-07f4ec3b169d",
    "user": {
      "id": "8f2f7b3a-3f1a-4a53-9e44-982403b7e9fc",
      "displayName": "Jane"
    }
  }
}
```

### Server → Client: `connection.error`

Sent when authentication fails.

```json
{
  "type": "connection.error",
  "data": {
    "code": "AUTH_TOKEN_INVALID",
    "message": "Authentication token expired"
  }
}
```

The server closes the socket immediately after sending this message.

---

## Room Operations

### Client → Server: `room.create`

Request the creation of a new room owned by the calling client.

```json
{
  "type": "room.create",
  "data": {
    "name": "Team Sync",
    "maxParticipants": 6
  }
}
```

#### Server Responses

Successful creation:

```json
{
  "type": "room.create.ack",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "name": "Team Sync",
    "maxParticipants": 6
  }
}
```

Failure (e.g., duplicate name or capacity limit):

```json
{
  "type": "error",
  "data": {
    "code": "ROOM_CREATION_FAILED",
    "message": "A room with that name already exists."
  }
}
```

### Client → Server: `room.join`

Join an existing room.

```json
{
  "type": "room.join",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d"
  }
}
```

#### Server Responses

Successful join (broadcast to all room participants):

```json
{
  "type": "room.participant_joined",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "participant": {
      "id": "c9d82b36-0b0e-4d95-8c16-4c72b0b43bf1",
      "displayName": "Carlos"
    }
  }
}
```

Failure (room full, not found, or unauthorized):

```json
{
  "type": "error",
  "data": {
    "code": "ROOM_JOIN_FAILED",
    "message": "The requested room is full."
  }
}
```

### Client → Server: `room.leave`

Leave the current room.

```json
{
  "type": "room.leave",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d"
  }
}
```

#### Server Responses

Acknowledgement to the leaving client:

```json
{
  "type": "room.leave.ack",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d"
  }
}
```

Broadcast to remaining participants:

```json
{
  "type": "room.participant_left",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "participantId": "c9d82b36-0b0e-4d95-8c16-4c72b0b43bf1"
  }
}
```

---

## WebRTC Signaling

All signaling messages share the shape `{ "type": string, "data": { roomId, targetId?, payload } }`. The `targetId` field identifies the peer the message is intended for.

### `webrtc.offer`

```json
{
  "type": "webrtc.offer",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "targetId": "c9d82b36-0b0e-4d95-8c16-4c72b0b43bf1",
    "payload": {
      "sdp": "v=0..."
    }
  }
}
```

### `webrtc.answer`

```json
{
  "type": "webrtc.answer",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "targetId": "c3fbf1f7-95e5-4e2c-83ac-7191f6a7c5f6",
    "payload": {
      "sdp": "v=0..."
    }
  }
}
```

### `webrtc.ice`

```json
{
  "type": "webrtc.ice",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "targetId": "c9d82b36-0b0e-4d95-8c16-4c72b0b43bf1",
    "payload": {
      "candidate": "candidate:842163049 1 udp 1677729535 192.168.0.10 56143 typ srflx raddr 0.0.0.0 rport 0"
    }
  }
}
```

The server forwards signaling messages to the designated `targetId`. Upon successful delivery it responds with a `.ack` message that contains the same `roomId` and `targetId`.

---

## Participant Updates

### Server → Client: `participant.list`

Sent after joining a room to provide the current participants.

```json
{
  "type": "participant.list",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "participants": [
      {
        "id": "8f2f7b3a-3f1a-4a53-9e44-982403b7e9fc",
        "displayName": "Jane",
        "isPublisher": true
      }
    ]
  }
}
```

### Server → Client: `participant.updated`

Broadcast when participant metadata changes (e.g., mute/unmute, role change).

```json
{
  "type": "participant.updated",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "participant": {
      "id": "c9d82b36-0b0e-4d95-8c16-4c72b0b43bf1",
      "displayName": "Carlos",
      "isPublisher": false,
      "muted": true
    }
  }
}
```

### Server → Client: `participant.kicked`

Sent to a participant who has been removed from a room by a moderator or due to policy enforcement.

```json
{
  "type": "participant.kicked",
  "data": {
    "roomId": "c5f4d84a-5669-4a36-b3b3-dc2c6b93a72d",
    "reason": "Inactivity timeout"
  }
}
```

---

## Error Message Format

Server-side errors for any message type are communicated using the following structure:

```json
{
  "type": "error",
  "data": {
    "code": "string",
    "message": "Human readable details",
    "correlationId": "optional-debugging-id"
  }
}
```

| Code | Meaning |
| --- | --- |
| `AUTH_TOKEN_INVALID` | Authentication token is missing, expired, or malformed. |
| `ROOM_CREATION_FAILED` | The server could not create the room (name conflict, capacity limit, etc.). |
| `ROOM_JOIN_FAILED` | Joining a room failed (room missing, full, or access denied). |
| `ROOM_LEAVE_FAILED` | Leaving a room failed due to missing membership state. |
| `SIGNALING_TARGET_OFFLINE` | The target participant is no longer connected. |
| `SERVER_ERROR` | Unhandled server-side failure. |

Unless otherwise noted, the server does not automatically close the WebSocket connection after sending an `error` message, allowing the client to recover when possible.
