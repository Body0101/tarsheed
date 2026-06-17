import config from "../config/env";

class ApiService {
  constructor() {
    this.authToken = null;
  }

  async request(method, endpoint, body) {
    const url = `${config.apiBaseUrl || ""}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  }

  get(endpoint) { return this.request("GET", endpoint); }
  post(endpoint, data) { return this.request("POST", endpoint, data); }
  put(endpoint, data) { return this.request("PUT", endpoint, data); }
  delete(endpoint) { return this.request("DELETE", endpoint); }
  setAuthToken(token) { this.authToken = token; }
  clearAuthToken() { this.authToken = null; }
}

export const apiService = new ApiService();