import { createContext, useContext, useEffect, useMemo, useState } from "react";

const OnlineStatusContext = createContext(null);

export const OnlineStatusProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const value = useMemo(() => ({ isOnline }), [isOnline]);
  return <OnlineStatusContext.Provider value={value}>{children}</OnlineStatusContext.Provider>;
};

export const useOnlineStatus = () => {
  const ctx = useContext(OnlineStatusContext);
  if (!ctx) throw new Error("useOnlineStatus must be used within OnlineStatusProvider");
  return ctx;
};
