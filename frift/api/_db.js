import { neon } from '@neondatabase/serverless';
import { HttpError } from './_http.js';

let client;

// Neon's Vercel integration sets DATABASE_URL. POSTGRES_URL is the older name.
export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new HttpError(500, 'No database connection string is set (DATABASE_URL).');
    client = neon(url);
  }
  return client;
}
