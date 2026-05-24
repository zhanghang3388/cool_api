// Build and trigger CC Switch import deeplinks.
//
// CC Switch (a desktop app for managing Claude / Codex / Gemini API
// credentials) registers a custom URL protocol on the host: `ccswitch://`.
// We construct a deeplink, hand it to the browser via `window.open(_, '_self')`
// and the OS routes it to the installed app.
//
// If the protocol isn't registered (CC Switch not installed) the browser
// stays focused. We detect that with `document.hasFocus()` after a short
// delay and surface an error so the user knows nothing happened.

import type { GroupProvider } from '@/hooks/useGroups';

/** Which CC Switch app slot the credential should land in. */
export type CcsApp = 'claude' | 'codex';

/** Map our group provider → the CC Switch app it should import into. */
export function appForProvider(provider: GroupProvider): CcsApp {
  return provider === 'anthropic' ? 'claude' : 'codex';
}

export interface BuildDeeplinkOptions {
  /** Display name shown inside CC Switch (e.g. "CoolGuy"). */
  name: string;
  /** Site root used as the homepage link inside CC Switch. */
  homepage: string;
  /** Provider slot in CC Switch. */
  app: CcsApp;
  /** API endpoint CC Switch should send requests to. */
  endpoint: string;
  /** The plaintext token. */
  apiKey: string;
  /**
   * Base URL of *our* backend, used by the embedded usage script CC Switch
   * runs every ~30s to refresh the balance display. Should be the same root
   * the SPA itself talks to (i.e. `VITE_API_BASE` at build time).
   */
  apiBase: string;
}

const USAGE_INTERVAL_SECONDS = 30;

/**
 * The script CC Switch evaluates to refresh the balance shown next to the
 * provider. Returns `{ isValid, remaining, unit }` per the CCS contract.
 *
 * Stored as a string so we can base64 it into the deeplink intact.
 */
function buildUsageScript(apiBase: string, apiKey: string): string {
  // Embed the apiBase + key directly so CC Switch doesn't have to know
  // about template substitution. JSON.stringify gives us safe quoting.
  const url = JSON.stringify(`${apiBase.replace(/\/$/, '')}/v1/usage`);
  const auth = JSON.stringify(`Bearer ${apiKey}`);
  return `({
  request: {
    url: ${url},
    method: "GET",
    headers: { "Authorization": ${auth} }
  },
  extractor: function(response) {
    var remaining = response && (response.remaining ?? response.balance);
    var unit = (response && response.unit) || "CNY";
    return {
      isValid: response ? (response.is_valid ?? response.is_active ?? true) : false,
      remaining: remaining,
      unit: unit
    };
  }
})`;
}

export function buildDeeplink(opts: BuildDeeplinkOptions): string {
  const usageScript = buildUsageScript(opts.apiBase, opts.apiKey);
  // btoa requires latin-1; the script is plain ASCII so this is fine.
  const usageScriptB64 = btoa(usageScript);
  const params = new URLSearchParams({
    resource: 'provider',
    app: opts.app,
    name: opts.name,
    homepage: opts.homepage,
    endpoint: opts.endpoint,
    apiKey: opts.apiKey,
    configFormat: 'json',
    usageEnabled: 'true',
    usageScript: usageScriptB64,
    usageAutoInterval: String(USAGE_INTERVAL_SECONDS),
  });
  return `ccswitch://v1/import?${params.toString()}`;
}

/**
 * Trigger the deeplink and surface a UI-friendly result. We can't directly
 * detect whether the OS protocol handler succeeded, but if focus is still
 * in the browser ~150ms after the navigate, the OS didn't hand the URL off
 * to anything — that's the closest we can get to "CC Switch isn't installed".
 */
export async function triggerImport(deeplink: string): Promise<{ ok: boolean }> {
  // Use an iframe instead of window.open / location so a missing handler
  // doesn't navigate the SPA to a broken about:blank.
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = deeplink;
  document.body.appendChild(frame);

  // Browsers blur the window when the OS picks up the protocol; wait a bit
  // and check whether focus left.
  const lostFocus = await new Promise<boolean>((resolve) => {
    let answered = false;
    const onBlur = () => {
      if (answered) return;
      answered = true;
      resolve(true);
    };
    window.addEventListener('blur', onBlur, { once: true });
    setTimeout(() => {
      if (answered) return;
      answered = true;
      window.removeEventListener('blur', onBlur);
      resolve(!document.hasFocus());
    }, 400);
  });

  // Always clean up the iframe; whether the handler fired or not.
  setTimeout(() => {
    frame.remove();
  }, 1000);

  return { ok: lostFocus };
}
