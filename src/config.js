// API Configuration
const isDevelopment = import.meta.env.DEV;
const isNetlify = window.location.hostname.includes('netlify.app');

// You can easily change the API endpoint here
// Backend is running on 0.0.0.0:8000, but we need to use localhost for browser requests
// export const API_BASE_URL = 'http://localhost:80';

export const API_BASE_URL = isDevelopment 
  ? 'http://139.59.27.253:80' 
  : '/api';

export const API_ENDPOINTS = {
  SEARCH: `${API_BASE_URL}/prospect/search`,
  STATUS: (id) => `${API_BASE_URL}/prospect/status/${id}`,
};
