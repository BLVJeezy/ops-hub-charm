/* Solyn Hub OS — cookieless page view counter. No cookies, no storage, no personal data kept.
   Usage: <script defer src="https://solyn22.lovable.app/t.js" data-site="TRACKING_ID"></script> */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var site = s.getAttribute("data-site");
  if (!site) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return;
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || /\.vercel\.app$|lovable\.app$|lovableproject\.com$/.test(host) && !s.hasAttribute("data-allow-preview")) return;
  var endpoint = new URL("/api/public/t", s.src).href;
  var last = "";
  function send() {
    var url = location.href.split("#")[0];
    if (url === last) return;
    last = url;
    var body = JSON.stringify({ s: site, u: url, r: document.referrer || "" });
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, body);
    else fetch(endpoint, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
  }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); setTimeout(send, 0); return r; };
  });
  window.addEventListener("popstate", send);
  if (document.readyState === "complete" || document.readyState === "interactive") send();
  else document.addEventListener("DOMContentLoaded", send);
})();
