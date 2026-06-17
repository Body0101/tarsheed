export const RelayControl = ({ state, onToggle }) => {
  const next = state === "on" ? "off" : "on";
  return <button onClick={() => onToggle(next)}>Turn {next.toUpperCase()}</button>;
};
