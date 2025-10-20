import { create } from 'zustand';

export type TODOState = {
  // TODO: Define state shape
};

export const useTODOStore = create<TODOState>(() => ({} as TODOState));
