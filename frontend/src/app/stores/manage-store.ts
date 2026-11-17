import { create } from "zustand";

import { manageCredsSchema, type ManageCreds } from "@/features/agent/schemas";

// The owner's private manage link (store slug + edit key). Client-only state: the
// server never sends it back after the first time. Kept in localStorage under the key
// the first version of the app used, so existing owners stay signed in.
const STORAGE_KEY = "vl_manage";

function load(): ManageCreds | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (manageCredsSchema.safeParse(JSON.parse(raw)).data ?? null) : null;
  } catch {
    return null;
  }
}

function save(creds: ManageCreds | null) {
  try {
    if (creds) localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode or blocked storage: the link still works for this tab
  }
}

interface ManageState {
  creds: ManageCreds | null;
  setCreds: (creds: ManageCreds) => void;
  clear: () => void;
}

export const useManageStore = create<ManageState>()((set) => ({
  creds: load(),
  setCreds: (creds) => {
    save(creds);
    set({ creds });
  },
  clear: () => {
    save(null);
    set({ creds: null });
  },
}));

export const manageUrl = (c: ManageCreds) =>
  `${location.origin}/?manage=${encodeURIComponent(c.slug)}&key=${encodeURIComponent(c.key)}`;
