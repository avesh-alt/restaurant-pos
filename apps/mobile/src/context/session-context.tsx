import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";

import { apiBaseUrl } from "../config/env";
import { ApiClient } from "../lib/api";
import { clearStoredSession, loadStoredSession, saveStoredSession, type StoredSession } from "../lib/storage";

interface SessionState {
  status: "booting" | "ready";
  session: StoredSession | null;
}

interface SessionContextValue {
  sessionState: SessionState;
  api: ApiClient;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setActiveBranchId: (branchId: string | null) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [sessionState, setSessionState] = useState<SessionState>({
    status: "booting",
    session: null,
  });
  const sessionRef = useRef<StoredSession | null>(null);
  const apiRef = useRef<ApiClient | null>(null);

  if (!apiRef.current) {
    apiRef.current = new ApiClient(apiBaseUrl, {
      getSession: () => sessionRef.current,
      onSessionChange: async (nextSession) => {
        sessionRef.current = nextSession;
        setSessionState({ status: "ready", session: nextSession });

        if (nextSession) {
          await saveStoredSession(nextSession);
        } else {
          await clearStoredSession();
        }
      },
    });
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const storedSession = await loadStoredSession();

      if (!active) {
        return;
      }

      sessionRef.current = storedSession;
      setSessionState({
        status: "ready",
        session: storedSession,
      });
    })();

    return () => {
      active = false;
    };
  }, []);

  const signIn = async (input: { email: string; password: string }): Promise<void> => {
    if (!apiRef.current) {
      throw new Error("API client is not ready.");
    }

    const session = await apiRef.current.login(input);
    sessionRef.current = session;
    setSessionState({ status: "ready", session });
    await saveStoredSession(session);
  };

  const signOut = async (): Promise<void> => {
    sessionRef.current = null;
    setSessionState({ status: "ready", session: null });
    await clearStoredSession();
  };

  const refreshSession = async (): Promise<void> => {
    if (!apiRef.current || !sessionRef.current) {
      return;
    }

    const refreshed = await apiRef.current.refresh(sessionRef.current.tokens.refreshToken);
    refreshed.activeBranchId = sessionRef.current.activeBranchId ?? null;
    sessionRef.current = refreshed;
    setSessionState({ status: "ready", session: refreshed });
    await saveStoredSession(refreshed);
  };

  const setActiveBranchId = async (branchId: string | null): Promise<void> => {
    if (!sessionRef.current) {
      return;
    }

    const nextSession: StoredSession = {
      ...sessionRef.current,
      activeBranchId: branchId,
    };

    sessionRef.current = nextSession;
    setSessionState({ status: "ready", session: nextSession });
    await saveStoredSession(nextSession);
  };

  const value: SessionContextValue = {
    sessionState,
    api: apiRef.current,
    signIn,
    signOut,
    refreshSession,
    setActiveBranchId,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within SessionProvider.");
  }

  return context;
}
