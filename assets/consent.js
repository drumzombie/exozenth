(function () {
  "use strict";
  // Adapted from DrumZombie's consent controller. Exo Zenth has separate storage.
  const KEY = "exozenth_consent_v1";
  const MAX_AGE = 183 * 24 * 60 * 60 * 1000;
  const production = ["exozenth.com", "www.exozenth.com"].includes(location.hostname.toLowerCase());
  const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  const gpc = () => navigator.globalPrivacyControl === true;
  let record = null;
  let loaded = false;
  let dialog;
  let returnFocus;
  try {
    record = JSON.parse(localStorage.getItem(KEY));
    if (!record || !["accepted", "rejected"].includes(record.choice) || !Number.isFinite(record.expiresAt)
      || record.expiresAt <= Date.now() || record.expiresAt > Date.now() + MAX_AGE) {
      record = null;
      localStorage.removeItem(KEY);
    }
  } catch (_) { record = null; }
  function save(choice) {
    record = { choice, expiresAt: Date.now() + MAX_AGE };
    try { localStorage.setItem(KEY, JSON.stringify(record)); } catch (_) {}
  }
  if (gpc()) save("rejected");
  function hasConsent() {
    return !gpc() && !!record && record.choice === "accepted" && record.expiresAt > Date.now();
  }
  window.dataLayer = window.dataLayer || [];
  function command() { window.dataLayer.push(arguments); }
  // Queue denied defaults locally before any Google library can load.
  command("consent", "default", denied);
  window["ga-disable-G-N4HV60F9CG"] = !hasConsent();
  window.gtag = function () { if (production && hasConsent()) command.apply(null, arguments); };
  const allowedScripts = new Set([
    "https://www.googletagmanager.com/gtag/js?id=G-N4HV60F9CG",
    "https://www.youtube.com/iframe_api"
  ]);
  const policy = window.trustedTypes ? window.trustedTypes.createPolicy("exozenth", {
    createScriptURL(value) {
      if (allowedScripts.has(value)) return value;
      throw new TypeError("Untrusted script URL");
    }
  }) : null;
  function loadScript(url) {
    if (!hasConsent() || !allowedScripts.has(url)) return;
    const node = document.createElement("script");
    node.async = true;
    node.src = policy ? policy.createScriptURL(url) : url;
    document.head.appendChild(node);
  }
  function loadTracking() {
    if (!production || !hasConsent() || loaded) return;
    loaded = true;
    window["ga-disable-G-N4HV60F9CG"] = false;
    // Advertising consent remains denied: this site installs only GA4.
    command("consent", "update", { ...denied, analytics_storage: "granted" });
    command("js", new Date());
    command("config", "G-N4HV60F9CG", { allow_google_signals: false, allow_ad_personalization_signals: false });
    loadScript("https://www.googletagmanager.com/gtag/js?id=G-N4HV60F9CG");
  }
  function clearTrackingStorage() {
    // No campaign/debug records are created. Also clean legacy/provider records.
    ["exozenth_attribution_v1", "lastExternalReferrer", "lastExternalReferrerTime", "multiFbc"].forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    try { sessionStorage.removeItem("exozenth_ga4_debug"); } catch (_) {}
    const domains = ["", location.hostname, "." + location.hostname, ".exozenth.com"];
    const parts = location.pathname.split("/").filter(Boolean);
    const paths = ["/"];
    while (parts.length) { paths.push("/" + parts.join("/"), "/" + parts.join("/") + "/"); parts.pop(); }
    document.cookie.split(";").forEach(cookie => {
      const name = cookie.split("=")[0].trim();
      if (!/^(_ga(?:_|$)|_gid$|_gat(?:_|$)|_gcl_|_fbp$|_fbc$)/.test(name)) return;
      domains.forEach(domain => paths.forEach(path => {
        document.cookie = name + "=; Max-Age=0; Path=" + path + (domain ? "; Domain=" + domain : "") + "; SameSite=Lax; Secure";
      }));
    });
  }
  function notify() {
    document.querySelectorAll("iframe[data-consent-src]").forEach(frame => {
      if (hasConsent()) {
        if (!frame.getAttribute("src")) frame.setAttribute("src", frame.dataset.consentSrc);
        frame.hidden = false;
      } else {
        frame.removeAttribute("src");
        frame.hidden = true;
      }
    });
    document.querySelectorAll(".consent-placeholder").forEach(node => { node.hidden = hasConsent(); });
    window.dispatchEvent(new CustomEvent("exozenth:consent", { detail: { accepted: hasConsent() } }));
  }
  function close() { if (dialog && dialog.open) dialog.close(); }
  function choose(choice) {
    save(gpc() ? "rejected" : choice);
    if (hasConsent()) {
      // UI and player state do not depend on a tracking request succeeding.
      notify();
      close();
      loadTracking();
    } else {
      window["ga-disable-G-N4HV60F9CG"] = true;
      command("consent", "update", denied);
      clearTrackingStorage();
      notify();
      close();
      location.reload();
    }
  }
  function refreshSettings() {
    if (!dialog) return;
    dialog.querySelector("[data-consent-status]").textContent = gpc()
      ? "Your browser is sending a Global Privacy Control signal, so optional cookies and players stay off and Accept is unavailable. This signal can come from a browser privacy setting, a private or incognito window, a browser set to always use private browsing, or a privacy extension. To allow optional cookies, turn the signal off in your browser or extension and reload this page. You can still use our streaming links without changing anything."
      : "Current choice: " + (hasConsent() ? "accepted." : record ? "rejected." : "not set; optional services are off.");
    dialog.querySelector("[data-consent-accept]").disabled = gpc();
  }
  function openSettings() {
    if (!dialog) return;
    returnFocus = document.activeElement;
    refreshSettings();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("[data-consent-reject]").focus();
  }
  window.exoZenthConsent = { hasConsent, isProduction: production, openSettings, loadScript };
  if (!hasConsent()) clearTrackingStorage();
  document.addEventListener("DOMContentLoaded", function () {
    dialog = document.createElement("dialog");
    dialog.className = "consent-banner";
    dialog.setAttribute("aria-labelledby", "consent-title");
    const title = document.createElement("h2");
    title.id = "consent-title";
    title.textContent = "Your cookie choices";
    const text = document.createElement("p");
    text.textContent = "With your permission, we use Google Analytics to measure visits and streaming link clicks, and load YouTube and Spotify players. Reject keeps these optional services off. Your choice is saved for six months.";
    const status = document.createElement("p");
    status.setAttribute("data-consent-status", "");
    status.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "consent-actions";
    [["Reject", "rejected", "data-consent-reject"], ["Accept", "accepted", "data-consent-accept"]].forEach(([label, choice, attr]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute(attr, "");
      button.addEventListener("click", () => choose(choice));
      actions.appendChild(button);
    });
    const privacy = document.createElement("a");
    privacy.href = "/privacy/";
    privacy.textContent = "Privacy policy";
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Close";
    done.addEventListener("click", close);
    actions.append(privacy, done);
    dialog.append(title, text, status, actions);
    dialog.addEventListener("close", () => { if (returnFocus && returnFocus.isConnected) returnFocus.focus(); });
    document.body.appendChild(dialog);
    document.addEventListener("click", event => {
      if (event.target.closest("[data-cookie-settings]")) { event.preventDefault(); openSettings(); }
    });
    document.addEventListener("click", event => {
      const link = event.target.closest("a[href]");
      if (!link || event.defaultPrevented || !hasConsent() || !production) return;
      try {
        const url = new URL(link.href, location.href);
        // Contact addresses and form contents are never sent as click events.
        if (!["http:", "https:"].includes(url.protocol) || url.origin === location.origin) return;
        window.gtag("event", "outbound_link_click", { link_url: url.href, page_path: location.pathname });
      } catch (_) {}
    });
    notify();
    loadTracking();
    if (!record && !gpc()) openSettings();
  }, { once: true });
  function recheck() {
    if ((gpc() && (!record || record.choice !== "rejected")) || (record && record.expiresAt <= Date.now())) choose("rejected");
    else refreshSettings();
  }
  window.addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) recheck(); });
  window.addEventListener("storage", event => {
    if (event.key === KEY || event.key === null) {
      window["ga-disable-G-N4HV60F9CG"] = true;
      location.reload();
    }
  });
})();
