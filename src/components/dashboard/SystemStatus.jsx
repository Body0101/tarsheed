import { useOnlineStatus } from "../../context/OnlineStatusContext";

export const SystemStatus = () => {
  const { isOnline } = useOnlineStatus();
  return <p>Network: {isOnline ? "Online" : "Offline"}</p>;
};
