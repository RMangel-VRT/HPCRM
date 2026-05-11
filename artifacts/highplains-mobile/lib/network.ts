import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { flushNow } from "./upload-queue";

// Mobile v1 Slice 7: NetInfo bridge.
//
//  * Mirrors device connectivity into React Query's `onlineManager` so paused
//    queries auto-resume on reconnect.
//  * Kicks the upload queue's flusher whenever we transition from offline →
//    online so queued mutations don't have to wait for the 5s timer.
//  * Exposes `useOnline()` for UI affordances (the offline chip in the tab
//    header).

let installed = false;
let lastOnline: boolean | null = null;

function deriveOnline(state: NetInfoState): boolean {
  // Treat "unknown reachability" as online — we'd rather attempt the request
  // and let it fail than show a false offline indicator.
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function installNetworkBridge(): void {
  if (installed) return;
  installed = true;
  onlineManager.setEventListener((setOnline) => {
    const sub = NetInfo.addEventListener((state) => {
      const online = deriveOnline(state);
      setOnline(online);
      if (lastOnline === false && online) {
        // Reconnect: drain the upload queue immediately.
        void flushNow();
      }
      lastOnline = online;
    });
    return () => sub();
  });
}

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(true);
  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((s) => {
      if (mounted) setOnline(deriveOnline(s));
    });
    const sub = NetInfo.addEventListener((s) => {
      if (mounted) setOnline(deriveOnline(s));
    });
    return () => {
      mounted = false;
      sub();
    };
  }, []);
  return online;
}
