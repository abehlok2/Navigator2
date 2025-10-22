import crypto from 'crypto';

export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
}

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  email?: string;
  displayName?: string;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
}

const HASH_ITERATIONS = 310000;
const HASH_LENGTH = 32;
const HASH_DIGEST = 'sha256';

const hashPassword = (password: string, salt: string): string =>
  crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST).toString('hex');

export class UserStore {
  private usersByUsername = new Map<string, StoredUser>();
  private usersById = new Map<string, StoredUser>();

  createUser(input: CreateUserInput): StoredUser {
    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(input.password, salt);

    const user: StoredUser = {
      id,
      username: input.username.toLowerCase(),
      email: input.email?.toLowerCase(),
      displayName: input.displayName,
      passwordHash,
      salt,
      createdAt: Date.now(),
    };

    this.usersByUsername.set(user.username, user);
    this.usersById.set(user.id, user);
    return user;
  }

  upsertUser(input: CreateUserInput): StoredUser {
    const username = input.username.toLowerCase();
    const existing = this.usersByUsername.get(username);

    if (!existing) {
      return this.createUser(input);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(input.password, salt);

    const updated: StoredUser = {
      ...existing,
      username,
      email: input.email?.toLowerCase() ?? existing.email,
      displayName: input.displayName ?? existing.displayName,
      passwordHash,
      salt,
    };

    this.usersByUsername.set(username, updated);
    this.usersById.set(updated.id, updated);
    return updated;
  }

  hasUsername(username: string): boolean {
    return this.usersByUsername.has(username.toLowerCase());
  }

  getByUsername(username: string): StoredUser | undefined {
    return this.usersByUsername.get(username.toLowerCase());
  }

  getById(id: string): StoredUser | undefined {
    return this.usersById.get(id);
  }

  verifyPassword(user: StoredUser, password: string): boolean {
    const hash = hashPassword(password, user.salt);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
  }

  toPublicUser(user: StoredUser): PublicUser {
    const { id, username, email, displayName } = user;
    return { id, username, email, displayName };
  }
}
