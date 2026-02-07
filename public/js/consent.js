(function() {
  function getConsent() {
    try {
      return localStorage.getItem('site_consent_status');
    } catch (e) {
      return null;
    }
  }

  function setConsent(value) {
    try {
      localStorage.setItem('site_consent_status', value);
    } catch (e) {}

    try {
      // Placeholder for future analytics/consent integrations
    } catch (e) {}
  }

  function createBanner() {
    if (document.getElementById('cookie-consent-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('style', [
      'position: fixed',
      'left: 0',
      'right: 0',
      'bottom: 0',
      'z-index: 10000',
      'background: #1f2937',
      'color: #fff',
      'padding: 14px',
      'display: flex',
      'flex-wrap: wrap',
      'align-items: center',
      'gap: 10px',
      'box-shadow: 0 -2px 10px rgba(0,0,0,0.2)'
    ].join(';'));

    var text = document.createElement('div');
    text.innerHTML = 'We use cookies to run this site and measure usage. Ads may be personalized to support our free service. See our <a href="/privacy" style="color:#93c5fd; text-decoration: underline;">Privacy Policy</a>.';
    text.style.flex = '1';

    var actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    var declineBtn = document.createElement('button');
    declineBtn.textContent = 'Decline non-essential';
    declineBtn.setAttribute('style', 'background:#374151;color:#fff;border:none;padding:10px 14px;border-radius:6px;cursor:pointer');
    declineBtn.onclick = function() {
      setConsent('denied');
      hideBanner();
    };

    var acceptBtn = document.createElement('button');
    acceptBtn.textContent = 'Accept all';
    acceptBtn.setAttribute('style', 'background:#10b981;color:#fff;border:none;padding:10px 14px;border-radius:6px;cursor:pointer');
    acceptBtn.onclick = function() {
      setConsent('granted');
      hideBanner();
    };

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    banner.appendChild(text);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  function hideBanner() {
    var el = document.getElementById('cookie-consent-banner');
    if (el) el.remove();
  }

  function initCookieSettingsLink() {
    var link = document.getElementById('cookie-settings');
    if (link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        createBanner();
      });
    }
  }

  window.showConsentBanner = createBanner;

  document.addEventListener('DOMContentLoaded', function() {
    initCookieSettingsLink();
    if (!getConsent()) {
      setTimeout(createBanner, 300);
    }
  });
})();
