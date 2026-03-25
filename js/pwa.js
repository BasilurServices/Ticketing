/**
 * Progressive Web App (PWA) Registration and Install Prompt Logic
 */

let deferredPrompt;

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('[PWA] ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('[PWA] ServiceWorker registration failed: ', err);
      });
  });
}

// Listen for the beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Only show the custom UI banner on desktop screens (width > 700px)
  if (window.innerWidth > 700) {
    showInstallPromotion();
  }
});

// Hide promotion when app is installed
window.addEventListener('appinstalled', (evt) => {
  console.log('[PWA] App was installed.', evt);
  hideInstallPromotion();
  deferredPrompt = null;
});

function showInstallPromotion() {
  // Check if banner already exists
  if (document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--navy);
    color: var(--white);
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 9999;
    font-family: 'IBM Plex Sans', sans-serif;
  `;

  const text = document.createElement('div');
  text.innerHTML = `
    <div style="font-weight: 600; font-size: 14px;">Install App</div>
    <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Add to your home screen for quick access.</div>
  `;

  const btnGrp = document.createElement('div');
  btnGrp.style.display = 'flex';
  btnGrp.style.gap = '8px';

  const installBtn = document.createElement('button');
  installBtn.innerText = 'Install';
  installBtn.style.cssText = `
    background: var(--blue);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
  `;
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
    hideInstallPromotion();
  });

  const closeBtn = document.createElement('button');
  closeBtn.innerText = '✕';
  closeBtn.style.cssText = `
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.addEventListener('click', () => {
    hideInstallPromotion();
  });

  btnGrp.appendChild(installBtn);
  btnGrp.appendChild(closeBtn);

  banner.appendChild(text);
  banner.appendChild(btnGrp);

  document.body.appendChild(banner);

  // Auto-hide the banner after 30 seconds
  setTimeout(() => {
    hideInstallPromotion();
  }, 30000);
}

function hideInstallPromotion() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.remove();
  }
}
