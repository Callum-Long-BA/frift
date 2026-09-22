import { timingSafeEqual } from 'node:crypto';

// Files starting with "_" in /api are helpers, not public endpoints.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sameSecret(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
export function isCron(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && sameSecret(req.headers.authorization, `Bearer ${secret}`);
}

// Everyone in the group shares one passcode. It keeps strangers out of the
// database; it is not per-person security.
export function requirePasscode(req) {
  const expected = process.env.FRIFT_PASSCODE;
  if (!expected) throw new HttpError(500, 'FRIFT_PASSCODE is not set on the server.');
  if (!sameSecret(req.headers['x-frift-passcode'], expected)) {
    throw new HttpError(401, 'Wrong passcode.');
  }
}

// Wraps { GET, POST, DELETE } handlers with passcode checking, method routing
// and consistent JSON errors. With { allowCron: true }, Vercel's scheduled calls
// are let in by CRON_SECRET instead of the passcode.
export function route(handlers, { allowCron = false } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!(allowCron && isCron(req))) requirePasscode(req);
      const run = handlers[req.method];
      if (!run) {
        res.setHeader('Allow', Object.keys(handlers).join(', '));
        throw new HttpError(405, 'Method not allowed.');
      }
      const body = await run(req);
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: 'Something went wrong on the server. Check the Vercel function logs.' });
    }
  };
}
