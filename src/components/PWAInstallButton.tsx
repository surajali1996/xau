import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, X, Smartphone, Monitor, ExternalLink, Check } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  // If already running inside standalone PWA mode, suppress install button
  if (isInstalled) {
    return (
      <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-[#089981]/15 text-[#089981] border border-[#089981]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[#089981] animate-pulse" />
        <span>PWA Active</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (!outcome) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  const handleCopyUrl = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#2962FF] hover:bg-[#1e53e5] active:bg-[#1644c0] text-white shadow-md transition-all cursor-pointer touch-manipulation"
        title="Install Web Application in Chrome / Android / Desktop"
      >
        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
        <span className="inline font-medium">Install App</span>
      </button>

      {/* Installation Guide Modal (For Chrome Desktop, Android, and iOS) */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs select-none">
          <div className="w-full max-w-md rounded-2xl bg-[#1E222D] border border-[#2B2F3A] p-5 shadow-2xl text-[#D1D4DC] flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#2B2F3A]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#2962FF]/20 flex items-center justify-center text-[#2962FF]">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Install Binance Futures Pro
                  </h3>
                  <p className="text-[10px] text-[#787B86]">Progressive Web App (PWA)</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded text-[#787B86] hover:text-white hover:bg-[#2A2E39] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Direct Native Button if supported */}
            {isInstallable && (
              <button
                onClick={async () => {
                  await install();
                  setShowGuide(false);
                }}
                className="w-full py-2.5 px-3 rounded-lg bg-[#2962FF] hover:bg-[#1e53e5] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Launch Chrome Native Install Prompt</span>
              </button>
            )}

            {/* Chrome & Android instructions */}
            <div className="space-y-3 text-xs">
              {/* Google Chrome Desktop */}
              <div className="p-3 rounded-xl bg-[#131722] border border-[#2B2F3A] flex flex-col gap-1.5">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Monitor className="w-4 h-4 text-[#2962FF]" />
                  <span>Google Chrome on PC / Laptop / Mac</span>
                </div>
                <p className="text-[11px] text-[#A0A4AE] leading-relaxed">
                  1. Look at the right side of Chrome&apos;s address bar and click the <strong>Install</strong> icon <Download className="w-3 h-3 inline text-[#2962FF] mx-0.5" />.<br />
                  2. Or click the Chrome menu <strong>(⋮)</strong> &gt; <strong>Save and share</strong> &gt; <strong>Install Binance Futures TradingView Pro</strong>.
                </p>
              </div>

              {/* Android Chrome */}
              <div className="p-3 rounded-xl bg-[#131722] border border-[#2B2F3A] flex flex-col gap-1.5">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Smartphone className="w-4 h-4 text-[#089981]" />
                  <span>Google Chrome on Android Phone</span>
                </div>
                <p className="text-[11px] text-[#A0A4AE] leading-relaxed">
                  1. Tap the 3-dots menu <strong>(⋮)</strong> in Chrome at top-right.<br />
                  2. Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.<br />
                  3. The app will install onto your phone like a native application with full standalone screen and background price alerts!
                </p>
              </div>

              {/* iOS Safari */}
              {isIOS && (
                <div className="p-3 rounded-xl bg-[#131722] border border-[#2B2F3A] flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Smartphone className="w-4 h-4 text-[#E040FB]" />
                    <span>Safari on iPhone / iPad</span>
                  </div>
                  <p className="text-[11px] text-[#A0A4AE] leading-relaxed">
                    1. Tap the <strong>Share</strong> button <Share2 className="w-3 h-3 inline text-[#2962FF] mx-0.5" /> in Safari toolbar.<br />
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              )}
            </div>

            {/* If viewed in iframe/preview: Direct URL opener */}
            <div className="pt-2 border-t border-[#2B2F3A] flex items-center justify-between gap-2">
              <button
                onClick={handleCopyUrl}
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#2A2E39] hover:bg-[#363B48] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#089981]" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copied ? 'URL Copied!' : 'Copy Direct Web App URL'}</span>
              </button>
              <button
                onClick={() => setShowGuide(false)}
                className="py-1.5 px-4 rounded-lg bg-[#181B24] border border-[#2B2F3A] hover:bg-[#2A2E39] text-[#D1D4DC] text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

