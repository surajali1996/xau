import React, { useEffect, useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000; // re-ask after 3 days

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

/**
 * Install prompt shown automatically when the web app is opened in a browser
 * (Chrome/Edge/Android via the native install dialog, iOS Safari via instructions).
 */
export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(recentlyDismissed);
  const [ready, setReady] = useState(false);

  // Small delay so the prompt doesn't flash before the app has painted
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  if (!ready || dismissed || isInstalled) return null;
  if (!isInstallable && !isIOS) return null;

  const handleInstall = async () => {
    const accepted = await install();
    if (!accepted) close();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-3 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-[#1E222D] border border-[#2B2F3A] p-5 shadow-2xl text-[#D1D4DC]">
        <div className="flex items-start gap-3">
          <img src="/pwa-192x192.png" alt="" className="w-14 h-14 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-base">Install Futures Pro</h3>
            <p className="mt-0.5 text-xs text-[#A0A4AE]">
              Add the app to your {isIOS ? 'Home Screen' : 'device'} for a full-screen trading terminal, faster
              launch and background price alerts.
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="p-1 -mt-1 -mr-1 rounded text-[#787B86] hover:text-white hover:bg-[#2A2E39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isInstallable ? (
          <div className="mt-4 flex gap-2">
            <button
              onClick={close}
              className="flex-1 rounded-lg border border-[#2B2F3A] py-2 text-xs font-semibold text-[#D1D4DC] hover:bg-[#2A2E39] transition-colors"
            >
              Not now
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#2962FF] py-2 text-xs font-semibold text-white hover:bg-[#1e53e5] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Install App
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 text-xs space-y-2.5 text-[#A0A4AE]">
              <p className="flex items-center gap-2">
                <span className="font-bold text-[#2962FF]">1.</span>
                <span>
                  Tap <strong className="text-white">Share</strong>
                  <Share2 className="w-3.5 h-3.5 inline mx-1 text-[#2962FF]" />
                  in the Safari toolbar.
                </span>
              </p>
              <p className="flex items-center gap-2">
                <span className="font-bold text-[#2962FF]">2.</span>
                <span>
                  Choose <strong className="text-white">Add to Home Screen</strong>
                  <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-[#2962FF]" />
                </span>
              </p>
            </div>
            <button
              onClick={close}
              className="mt-4 w-full rounded-lg bg-[#2962FF] py-2 text-xs font-semibold text-white hover:bg-[#1e53e5] transition-colors"
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
};
