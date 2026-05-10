export const TimerControl = ({ onSet }) => {
  return (
    <button type="button" onClick={() => onSet(5)}>
      Set 5m timer
    </button>
  );
};
