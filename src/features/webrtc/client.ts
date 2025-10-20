import { useMemo } from 'react';

import { SignalingClient } from './signaling';

let sharedClient: SignalingClient | null = null;

/**
 * Returns a shared {@link SignalingClient} instance. The same instance is
 * reused across the application to preserve WebSocket state between route
 * transitions.
 */
export const getSignalingClient = (): SignalingClient => {
  if (!sharedClient) {
    sharedClient = new SignalingClient();
  }

  return sharedClient;
};

/**
 * Convenience React hook that exposes the shared signaling client while
 * guaranteeing referential stability for hooks dependencies.
 */
export const useSignalingClient = (): SignalingClient => {
  return useMemo(() => getSignalingClient(), []);
};

/**
 * Utility intended for test environments to reset the cached client. It is
 * kept out of the public barrel export so production code does not rely on it.
 */
export const __resetSignalingClientForTests = (): void => {
  sharedClient = null;
};
