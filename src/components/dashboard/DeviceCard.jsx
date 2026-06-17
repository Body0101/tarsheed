import { RelayControl } from "./RelayControl";
import { TimerControl } from "./TimerControl";

export const DeviceCard = ({ device, onToggle, onSetTimer }) => {
  return (
    <article style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
      <h3>{device.name}</h3>
      <p>Relay: {device.relay}</p>
      <p>Timer: {device.timerSeconds}s</p>
      <RelayControl state={device.relay} onToggle={(state) => onToggle(device.id, state)} />
      <TimerControl onSet={(minutes) => onSetTimer(device.id, minutes)} />
    </article>
  );
};
