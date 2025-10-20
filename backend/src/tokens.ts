import crypto from 'crypto';

export interface TokenPayload {
  sub: string;
  exp: number;
}

export class TokenError extends Error {}

const header = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  'utf8'
).toString('base64url');

export const signToken = (payload: TokenPayload, secret: string): string => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
};

export const verifyToken = (token: string, secret: string): TokenPayload => {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new TokenError('Malformed token');
  }

  const [receivedHeader, body, signature] = segments;
  if (receivedHeader !== header) {
    throw new TokenError('Unsupported token header');
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${receivedHeader}.${body}`)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new TokenError('Invalid signature');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string') {
    throw new TokenError('Invalid payload');
  }

  if (Date.now() >= payload.exp) {
    throw new TokenError('Token expired');
  }

  return payload;
};
