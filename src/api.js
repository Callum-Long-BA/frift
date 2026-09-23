import { readStored, writeStored, removeStored } from './lib/storage.js';

const PASSCODE_KEY = 'frift.passcode';

export class AuthError extends Error {}

export const getPasscode = () => readStored(PASSCODE_KEY);
export const setPasscode = (value) => writeStored(PASSCODE_KEY, value);
export const clearPasscode = () => removeStored(PASSCODE_KEY);

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-frift-passcode': getPasscode() ?? '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }

  if (res.status === 401) throw new AuthError(data?.error ?? 'Wrong passcode.');
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
  return data;
}

export const api = {
  people: () => request('people'),
  addPerson: (name) => request('people', { method: 'POST', body: { name } }),
  exercises: () => request('exercises'),
  addExercise: (name, personId, kind, equipmentChoice) =>
    request('exercises', { method: 'POST', body: { name, personId, kind, equipmentChoice } }),
  entries: () => request('entries'),
  addEntry: (payload) => request('entries', { method: 'POST', body: payload }),
  deleteEntry: (id, personId) => request(`entries?id=${id}&personId=${personId}`, { method: 'DELETE' }),
  bodyWeights: () => request('bodyweights'),
  logBodyWeight: (personId, date, weightKg) =>
    request('bodyweights', { method: 'POST', body: { personId, date, weightKg } }),
};
