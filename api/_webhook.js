import { HttpError } from './_http.js';
import { discordLink, isWebhookUrl } from './_discord.js';

// Sending to the Discord webhook in DISCORD_WEBHOOK_URL. Shared by the 8pm post
// (daily-discord.js) and the 6pm sheet sync's warnings (sheet-sync.js).

export const PAUSE_MS = 500; // Discord allows about 5 webhook messages every 2 seconds

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks Discord about the webhook itself: which server and channel it posts to, and its
// name. Fails clearly if the URL is not a webhook or Discord no longer knows it.
export async function webhookInfo(url) {
  if (!isWebhookUrl(url)) {
    throw new HttpError(
      500,
      'DISCORD_WEBHOOK_URL is not a Discord webhook. It should look like https://discord.com/api/webhooks/1234/abcd (from Edit Channel > Integrations > Webhooks > Copy Webhook URL).',
    );
  }
  let res;
  try {
    res = await fetch(url.trim(), { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new HttpError(502, 'Could not reach Discord.');
  }
  if (!res.ok) throw new HttpError(502, `Discord does not recognise this webhook (${res.status}). It may have been deleted.`);
  const hook = await res.json();
  return {
    name: hook.name,
    guildId: hook.guild_id,
    channelId: hook.channel_id,
    channelLink: discordLink(hook.guild_id, hook.channel_id),
  };
}

// Posts one message and waits for Discord to confirm it, returning the message's id and
// channel, so the result can link to exactly what was posted.
export async function postToDiscord(url, payload) {
  const target = new URL(url.trim());
  target.searchParams.set('wait', 'true');
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(502, 'Could not reach Discord.');
    }
    if (res.ok) {
      const message = await res.json();
      return { id: message.id, channelId: message.channel_id };
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(Math.ceil((body.retry_after ?? 1) * 1000));
      continue;
    }
    throw new HttpError(502, `Discord refused the message (${res.status}). Check DISCORD_WEBHOOK_URL.`);
  }
  throw new HttpError(502, 'Discord kept asking FRIFT to slow down. Try again in a minute.');
}
