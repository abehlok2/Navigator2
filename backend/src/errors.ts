export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_IN_USE'
  | 'AUTH_TOKEN_INVALID'
  | 'REGISTRATION_DISABLED'
  | 'ROOM_CREATION_FAILED'
  | 'ROOM_JOIN_FAILED'
  | 'ROOM_LEAVE_FAILED'
  | 'SIGNALING_TARGET_OFFLINE'
  | 'SERVER_ERROR';

export interface ErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export const createError = (code: ErrorCode, message: string): ErrorPayload => ({
  error: { code, message },
});

export const sendJsonError = (
  res: import('http').ServerResponse,
  status: number,
  code: ErrorCode,
  message: string
) => {
  const payload = createError(code, message);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};
