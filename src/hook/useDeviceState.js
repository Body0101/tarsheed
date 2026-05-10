import { useEffect, useState } from "react";
import { deviceService } from "../services/deviceService";

export const useDeviceState = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setDevices(await deviceService.getDeviceStatus());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
    const unsubscribe = deviceService.subscribeToDeviceUpdates(() => load());
    return unsubscribe;
  }, []);

  const controlRelay = async (relayId, state) => {
    try {
      await deviceService.setRelayState(relayId, state);
    } catch (err) {
      setError(err.message);
    }
  };

  return { devices, loading, error, isConnected, controlRelay, refreshDevices: deviceService.getDeviceStatus };
};