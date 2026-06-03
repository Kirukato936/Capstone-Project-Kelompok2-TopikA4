/**
 * API Client for Inspectra Dashboard
 * Communicates with the Express backend.
 */

const API_BASE = '/api';

const apiClient = {
  async fetchInspections() {
    const res = await fetch(`${API_BASE}/inspections`);
    return await res.json();
  },

  async fetchStats() {
    const res = await fetch(`${API_BASE}/stats`);
    return await res.json();
  },

  async fetchTrend() {
    const res = await fetch(`${API_BASE}/stats/trend`);
    return await res.json();
  },

  async fetchDefectTrend() {
    const res = await fetch(`${API_BASE}/stats/defect-trend`);
    return await res.json();
  },

  async fetchDefectCategories() {
    const res = await fetch(`${API_BASE}/stats/defect-categories`);
    return await res.json();
  },

  async fetchRPP() {
    const res = await fetch(`${API_BASE}/rpp`);
    return await res.json();
  },

  async fetchVendors() {
    const res = await fetch(`${API_BASE}/vendors`);
    return await res.json();
  },

  async fetchTopParts() {
    const res = await fetch(`${API_BASE}/parts/top`);
    return await res.json();
  },

  async fetchLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/logs${query ? '?' + query : ''}`);
    return await res.json();
  },

  async login(role, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, password })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Login failed');
    }
    return await res.json();
  },

  async submitRPP(data) {
    const res = await fetch(`${API_BASE}/rpp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async fetchStatus() {
    const res = await fetch(`${API_BASE}/status`);
    return await res.json();
  },

  async fetchCameraFrame() {
    const res = await fetch(`${API_BASE}/camera/frame`);
    if (res.status === 204) return null; // no frame yet
    return await res.json();
  },

  async fetchWeightData() {
    const res = await fetch(`${API_BASE}/sensor/weight`);
    if (res.status === 204) return null; // no data yet
    return await res.json();
  }
};

window.apiClient = apiClient;
