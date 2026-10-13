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

// How a group code is looked up. The real lookup reads the groups table (api/_groups.js,
// loaded only when needed); tests swap in their own with setGroupFinder.
let findGroup = async (code) => (await import('./_groups.js')).findGroupByCode(code);
export function setGroupFinder(fn) {
  findGroup = fn;
}

// Each group has a code that everyone in it shares (sent as x-frift-passcode). It keeps
// strangers out and decides whose data you see; it is not per-person security. Returns the
// group ({ id, code }) or throws 401.
export async function requireGroup(req) {
  const group = await findGroup(req.headers['x-frift-passcode']);
  if (!group) throw new HttpError(401, 'Wrong group code.');
  return group;
}

// Wraps { GET, POST, DELETE } handlers with group code checking, method routing and
// consistent JSON errors. The caller's group is passed on as req.group. With
// { allowCron: true }, Vercel's scheduled calls are let in by CRON_SECRET instead (and
// req.group is null).
export function route(handlers, { allowCron = false } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      req.group = allowCron && isCron(req) ? null : await requireGroup(req);
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
