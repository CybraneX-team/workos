import React from 'react';

export const AUTH_KEYFRAMES = `
@keyframes blob-a {
  0%,100% { transform: translate(0px, 0px) scale(1); }
  33%      { transform: translate(40px, -35px) scale(1.06); }
  66%      { transform: translate(-25px, 20px) scale(0.96); }
}
@keyframes blob-b {
  0%,100% { transform: translate(0px, 0px) scale(1); }
  33%      { transform: translate(-30px, 25px) scale(1.04); }
  66%      { transform: translate(35px, -20px) scale(0.98); }
}
@keyframes blob-c {
  0%,100% { transform: translate(0px, 0px) scale(1); }
  50%      { transform: translate(20px, 30px) scale(1.08); }
}
@keyframes auth-scan {
  0%   { top: -2px; opacity: 0; }
  4%   { opacity: 0.25; }
  96%  { opacity: 0.25; }
  100% { top: 100%; opacity: 0; }
}
`;

interface Props {
  leftPanel: React.ReactNode;
  children: React.ReactNode;
}

export default function SpaceAuthLayout({ leftPanel, children }: Props) {
  return (
    <>
      <style>{AUTH_KEYFRAMES}</style>
      <div style={{
        minHeight: '100vh',
        background: '#07070f',
        display: 'flex',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      }}>
        {/* ── LEFT PANEL ── */}
        <div style={{
          flex: '0 0 54%',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {leftPanel}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 48px',
          background: 'rgba(8,8,18,0.96)',
          position: 'relative',
        }}>
          <div style={{ width: '100%', maxWidth: '380px' }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
