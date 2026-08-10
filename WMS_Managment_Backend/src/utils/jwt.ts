import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from './env';

export interface TokenPayload {
  userId: number;
  id: number;
  username: string;
  role: string;
  department_id?: number | null;
  token_version?: number;
}

function toTokenPayload(data: {
  userId: number;
  username: string;
  role: string;
  department_id?: number | null;
  token_version?: number;
}): TokenPayload {
  return { ...data, id: data.userId };
}

export function generateAccessToken(data: Omit<TokenPayload, 'id'>): string {
  const payload = toTokenPayload(data);
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function generateRefreshToken(data: Omit<TokenPayload, 'id'>): string {
  const payload = toTokenPayload(data);
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    if (decoded.type === 'refresh') return null;
    return toTokenPayload(decoded);
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as any;
    if (decoded.type !== 'refresh') return null;
    return toTokenPayload(decoded);
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Backward compatibility
export const generateToken = generateAccessToken;
export const verifyToken = verifyAccessToken;
