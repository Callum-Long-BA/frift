// localStorage can throw (private mode, blocked storage), so never let it break the app.
export function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
