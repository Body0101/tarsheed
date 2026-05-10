class DeviceService {
  constructor() {
    this.listeners = new Set();
    this.state = [
      { id: "relay-1", name: "Relay 1", relay: "off", timerSeconds: 0 },
      { id: "relay-2", name: "Relay 2", relay: "off", timerSeconds: 0 },
    ];
  }

  async getDeviceStatus() {
    return [...this.state];
  }

  notify(update) {
    this.listeners.forEach((cb) => cb(update));
  }

  async setRelayState(relayId, state) {
    this.state = this.state.map((d) => (d.id === relayId ? { ...d, relay: state } : d));
    this.notify({ relayId, state });
  }

  async setTimer(relayId, duration) {
    this.state = this.state.map((d) => (d.id === relayId ? { ...d, timerSeconds: duration * 60 } : d));
    this.notify({ relayId, timerSeconds: duration * 60 });
  }

  async cancelTimer(relayId) {
    this.state = this.state.map((d) => (d.id === relayId ? { ...d, timerSeconds: 0 } : d));
    this.notify({ relayId, timerSeconds: 0 });
  }

  subscribeToDeviceUpdates(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

export const deviceService = new DeviceService();