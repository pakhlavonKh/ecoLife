import axios from 'axios';

/**
 * In dev, leave baseURL empty so requests hit Vite proxy (`/api` → Nest :3000).
 * In prod, set VITE_API_URL to the public API origin (e.g. https://api.example.com).
 */
const baseURL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export function getErrorMessage(error, fallback = 'Request failed') {
  const data = error?.response?.data;
  if (!data) {
    return error?.message || fallback;
  }
  if (typeof data.message === 'string') {
    return data.message;
  }
  if (Array.isArray(data.message)) {
    return data.message.join(', ');
  }
  if (typeof data.error === 'string') {
    return data.error;
  }
  return fallback;
}

export function isConflictError(error) {
  return error?.response?.status === 409;
}
