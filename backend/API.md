# Navigator Backend API

This document describes the HTTP endpoints exposed by the Navigator backend service. All routes are prefixed with `/` and expect and return JSON unless stated otherwise. Authentication tokens, when provided, must be supplied in the `Authorization: Bearer <token>` header.

---

## Error Handling

The backend uses structured error responses with the following shape:

```json
{
  "error": {
    "code": "string",
    "message": "Human readable description"
  }
}
```

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | One or more request fields failed validation. |
| `AUTH_INVALID_CREDENTIALS` | Login failed because the credentials are incorrect. |
| `AUTH_EMAIL_IN_USE` | Registration failed because the email address is already registered. |
| `AUTH_TOKEN_INVALID` | The provided authentication token is missing, expired, or malformed. |
| `SERVER_ERROR` | An unexpected error occurred on the server. |

Unless explicitly stated, error responses use an HTTP status code that matches the semantics of the error (`400` for validation issues, `401` for authentication problems, and `500` for unexpected errors).

---

## `POST /auth/register`

Create a new user account.

### Request Body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | Must be a valid email address. |
| `password` | string | Yes | Minimum length of 8 characters. |
| `displayName` | string | No | Optional name shown to other participants. |

### Example Request

```http
POST /auth/register HTTP/1.1
Content-Type: application/json

{
  "email": "jane.doe@example.com",
  "password": "p@ssw0rd!",
  "displayName": "Jane"
}
```

### Successful Response

Status: `201 Created`

```json
{
  "user": {
    "id": "8f2f7b3a-3f1a-4a53-9e44-982403b7e9fc",
    "email": "jane.doe@example.com",
    "displayName": "Jane"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Error Responses

- `400 Bad Request` with `VALIDATION_ERROR` when required fields are missing or invalid.
- `409 Conflict` with `AUTH_EMAIL_IN_USE` when an account already exists for the provided email.
- `500 Internal Server Error` with `SERVER_ERROR` for unexpected failures.

---

## `POST /auth/login`

Authenticate an existing user and return an access token.

### Request Body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | Registered email address. |
| `password` | string | Yes | Account password. |

### Example Request

```http
POST /auth/login HTTP/1.1
Content-Type: application/json

{
  "email": "jane.doe@example.com",
  "password": "p@ssw0rd!"
}
```

### Successful Response

Status: `200 OK`

```json
{
  "user": {
    "id": "8f2f7b3a-3f1a-4a53-9e44-982403b7e9fc",
    "email": "jane.doe@example.com",
    "displayName": "Jane"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Error Responses

- `400 Bad Request` with `VALIDATION_ERROR` when fields are missing or improperly formatted.
- `401 Unauthorized` with `AUTH_INVALID_CREDENTIALS` when the email/password combination is incorrect.
- `500 Internal Server Error` with `SERVER_ERROR` for unexpected failures.

---

## `GET /auth/verify`

Validate an access token and return the associated user profile.

### Request Headers

- `Authorization: Bearer <token>` (required)

### Example Request

```http
GET /auth/verify HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Successful Response

Status: `200 OK`

```json
{
  "user": {
    "id": "8f2f7b3a-3f1a-4a53-9e44-982403b7e9fc",
    "email": "jane.doe@example.com",
    "displayName": "Jane"
  },
  "token": {
    "expiresAt": "2024-06-25T14:00:00.000Z"
  }
}
```

### Error Responses

- `401 Unauthorized` with `AUTH_TOKEN_INVALID` when the token is missing, expired, or malformed.
- `500 Internal Server Error` with `SERVER_ERROR` for unexpected failures.

---

## `GET /health`

Retrieve a snapshot of the server's current health metrics.

### Example Response

Status: `200 OK`

```json
{
  "status": "ok",
  "uptime": 5320.501,
  "timestamp": "2024-06-25T12:45:30.123Z",
  "connections": 12,
  "activeRooms": 4
}
```

If the server reports an `"error"` status the HTTP response code SHOULD be `503 Service Unavailable` and the payload remains in the same format with `"status": "error"`.

---

## Pre-registering Accounts with `.env`

For local development or deployments where you want known credentials available immediately, the backend can preload accounts
from environment variables. Create a `.env` file next to `backend/package.json` (or otherwise ensure the variables are present in
the server process) with a `NAVIGATOR_PRESET_USERS` variable that contains a JSON array of account definitions:

```env
NAVIGATOR_SECRET="choose-a-secret"
NAVIGATOR_PRESET_USERS='[
  { "email": "facilitator@example.com", "password": "supersecure", "displayName": "Facilitator" },
  { "email": "participant@example.com", "password": "anotherpass" }
]'
```

Each entry must include an `email` and `password` (minimum 8 characters). An optional `displayName` may also be supplied. If an
account with the same email already exists, its password and display name will be updated with the values from the preset.
