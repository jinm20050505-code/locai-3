/** 配信先はブラウザ各社の既知のHTTPS Pushサービスだけ（任意URLへのサーバー接続を防ぐ）。 */
export function validPushEndpoint(endpoint: string) {
  try {
    if (endpoint.length > 2048) return false;
    const u = new URL(endpoint);
    const h = u.hostname;
    return u.protocol === "https:" && !u.port && !u.username && !u.password &&
      (h === "fcm.googleapis.com" || h === "updates.push.services.mozilla.com" || h.endsWith(".push.services.mozilla.com") || h === "web.push.apple.com" || h.endsWith(".push.apple.com") || h.endsWith(".notify.windows.com"));
  } catch { return false; }
}
