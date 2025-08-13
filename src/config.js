// API Configuration
const isDevelopment = import.meta.env.DEV;
const isNetlify = window.location.hostname.includes('netlify.app');

export const API_BASE_URL = isDevelopment 
  ? 'http://139.59.27.253:8000' 
  : '/api';

export const API_ENDPOINTS = {
  SEARCH: `${API_BASE_URL}/prospect/search`,
  STATUS: (id) => `${API_BASE_URL}/prospect/status/${id}`,
};
