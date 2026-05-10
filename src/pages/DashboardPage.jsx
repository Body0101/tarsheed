import { DeviceCard } from "../components/dashboard/DeviceCard";
import { SystemStatus } from "../components/dashboard/SystemStatus";
import { useDeviceState } from "../hook/useDeviceState";
import { deviceService } from "../services/deviceService";

export const DashboardPage = () => {
  const { devices, loading, error, controlRelay } = useDeviceState();

  if (loading) return <p>Loading dashboard...</p>;
  if (error) return <p>Failed to load devices: {error}</p>;

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <h1>Dashboard</h1>
      <SystemStatus />
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={device}
          onToggle={controlRelay}
          onSetTimer={(relayId, minutes) => deviceService.setTimer(relayId, minutes, "off")}
        />
      ))}
    </section>
  );
};
