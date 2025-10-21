import crypto from 'crypto';

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  displayName?: string;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName?: string;
}

const HASH_ITERATIONS = 310000;
const HASH_LENGTH = 32;
const HASH_DIGEST = 'sha256';

const hashPassword = (password: string, salt: string): string =>
  crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST).toString('hex');

export class UserStore {
  private usersByEmail = new Map<string, StoredUser>();
  private usersById = new Map<string, StoredUser>();

  createUser(input: CreateUserInput): StoredUser {
    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(input.password, salt);

    const user: StoredUser = {
      id,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash,
      salt,
      createdAt: Date.now(),
    };

    this.usersByEmail.set(user.email, user);
    this.usersById.set(user.id, user);
    return user;
  }

  upsertUser(input: CreateUserInput): StoredUser {
    const email = input.email.toLowerCase();
    const existing = this.usersByEmail.get(email);

    if (!existing) {
      return this.createUser({ ...input, email });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(input.password, salt);

    const updated: StoredUser = {
      ...existing,
      email,
      displayName: input.displayName ?? existing.displayName,
      passwordHash,
      salt,
    };

    this.usersByEmail.set(email, updated);
    this.usersById.set(updated.id, updated);
    return updated;
  }

  hasEmail(email: string): boolean {
    return this.usersByEmail.has(email.toLowerCase());
  }

  getByEmail(email: string): StoredUser | undefined {
    return this.usersByEmail.get(email.toLowerCase());
  }

  getById(id: string): StoredUser | undefined {
    return this.usersById.get(id);
  }

  verifyPassword(user: StoredUser, password: string): boolean {
    const hash = hashPassword(password, user.salt);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
  }

  toPublicUser(user: StoredUser): PublicUser {
    const { id, email, displayName } = user;
    return { id, email, displayName };
  }
}
