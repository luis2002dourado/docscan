/* Cole seu ID do Google Analytics (G-XXXXXXXX) para ativar. Vazio = nenhum rastreamento. */
window.DOCSCAN_GA = "";

(function () {
  const id = window.DOCSCAN_GA;
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });
})();
