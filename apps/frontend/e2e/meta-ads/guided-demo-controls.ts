import type { Page } from '@playwright/test';

const OVERLAY_ID = 'meta-campaign-demo-scene';
const PAUSE_KEY = 'meta-campaign-demo-paused';

export function createGuidedDemoControls(defaultHoldMs: number) {
  let sceneNumber = 0;

  async function clear(page: Page) {
    await page.evaluate(({ overlayId }) => document.getElementById(overlayId)?.remove(), { overlayId: OVERLAY_ID });
  }

  async function reset(page: Page) {
    await page.evaluate(({ overlayId, pauseKey }) => {
      document.getElementById(overlayId)?.remove();
      window.localStorage.removeItem(pauseKey);
    }, { overlayId: OVERLAY_ID, pauseKey: PAUSE_KEY });
    sceneNumber = 0;
  }

  async function showStatus(page: Page, title: string, detail: string) {
    await page.evaluate(({ overlayId, statusTitle, statusDetail }) => {
      document.getElementById(overlayId)?.remove();
      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.cssText = [
        'position:fixed', 'left:32px', 'bottom:30px', 'z-index:2147483647',
        'max-width:620px', 'padding:18px 22px', 'border-radius:18px',
        'border:1px solid rgba(103,232,249,.32)',
        'background:linear-gradient(135deg,rgba(8,47,73,.97),rgba(15,23,42,.96))',
        'box-shadow:0 24px 70px rgba(0,0,0,.55)', 'backdrop-filter:blur(18px)',
        'color:white', 'font-family:Inter,ui-sans-serif,system-ui,sans-serif',
      ].join(';');
      const eyebrow = document.createElement('div');
      eyebrow.textContent = 'Campaign Studio guided test · setup';
      eyebrow.style.cssText = 'font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9';
      const heading = document.createElement('div');
      heading.textContent = statusTitle;
      heading.style.cssText = 'margin-top:6px;font-size:22px;font-weight:750;line-height:1.15';
      const copy = document.createElement('div');
      copy.textContent = statusDetail;
      copy.style.cssText = 'margin-top:7px;font-size:13px;line-height:1.5;color:rgba(255,255,255,.68)';
      const progress = document.createElement('div');
      progress.textContent = 'Preparing…';
      progress.style.cssText = 'margin-top:14px;font-size:11px;font-weight:700;color:#a5f3fc';
      overlay.append(eyebrow, heading, copy, progress);
      document.body.appendChild(overlay);
    }, { overlayId: OVERLAY_ID, statusTitle: title, statusDetail: detail });
  }

  async function showScene(page: Page, title: string, detail: string, holdMs = defaultHoldMs) {
    sceneNumber += 1;
    await page.evaluate(async ({ overlayId, pauseKey, number, sceneTitle, sceneDetail, duration }) => {
      document.getElementById(overlayId)?.remove();
      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.cssText = [
        'position:fixed', 'left:32px', 'bottom:30px', 'z-index:2147483647',
        'max-width:640px', 'padding:18px 22px', 'border-radius:18px',
        'border:1px solid rgba(196,181,253,.38)',
        'background:linear-gradient(135deg,rgba(17,12,32,.97),rgba(15,23,42,.96))',
        'box-shadow:0 24px 70px rgba(0,0,0,.58)', 'backdrop-filter:blur(18px)',
        'color:white', 'font-family:Inter,ui-sans-serif,system-ui,sans-serif',
      ].join(';');
      overlay.innerHTML = `
        <div style="font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#c4b5fd">Campaign Studio guided test · step ${number}</div>
        <div style="margin-top:6px;font-size:22px;font-weight:750;line-height:1.15"></div>
        <div style="margin-top:7px;font-size:13px;line-height:1.5;color:rgba(255,255,255,.68)"></div>
        <div style="height:3px;margin-top:14px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.1)"><div data-progress style="height:100%;width:100%;background:linear-gradient(90deg,#8b5cf6,#22d3ee);transform-origin:left"></div></div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button data-pause style="padding:8px 13px;border:1px solid rgba(196,181,253,.4);border-radius:9px;background:rgba(124,58,237,.2);color:white;font:700 12px Inter,ui-sans-serif,system-ui;cursor:pointer"></button>
          <button data-next style="padding:8px 13px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(255,255,255,.08);color:white;font:700 12px Inter,ui-sans-serif,system-ui;cursor:pointer">Next step →</button>
          <span data-time style="font-size:10px;color:rgba(255,255,255,.48)"></span>
          <span style="font-size:10px;color:rgba(255,255,255,.36)">Space · pause &nbsp; Right arrow · next</span>
        </div>`;
      const children = overlay.children;
      children[1].textContent = sceneTitle;
      children[2].textContent = sceneDetail;
      document.body.appendChild(overlay);

      const pauseButton = overlay.querySelector<HTMLButtonElement>('[data-pause]')!;
      const nextButton = overlay.querySelector<HTMLButtonElement>('[data-next]')!;
      const progress = overlay.querySelector<HTMLElement>('[data-progress]')!;
      const time = overlay.querySelector<HTMLElement>('[data-time]')!;
      let paused = window.localStorage.getItem(pauseKey) === '1';
      let remaining = duration;
      let previousTick = performance.now();

      const render = () => {
        pauseButton.textContent = paused ? 'Resume ▶' : 'Pause Ⅱ';
        pauseButton.style.background = paused ? 'rgba(16,185,129,.22)' : 'rgba(124,58,237,.2)';
        progress.style.transform = `scaleX(${Math.max(0, remaining / duration)})`;
        time.textContent = paused ? 'Paused' : `Auto-next in ${Math.max(1, Math.ceil(remaining / 1_000))}s`;
      };
      const togglePause = () => {
        paused = !paused;
        window.localStorage.setItem(pauseKey, paused ? '1' : '0');
        previousTick = performance.now();
        render();
      };
      render();

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearInterval(timer);
          pauseButton.removeEventListener('click', togglePause);
          nextButton.removeEventListener('click', finish);
          window.removeEventListener('keydown', onKeyDown);
          resolve();
        };
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.code === 'Space') {
            event.preventDefault();
            togglePause();
          } else if (event.code === 'ArrowRight') {
            event.preventDefault();
            finish();
          }
        };
        const timer = window.setInterval(() => {
          const now = performance.now();
          if (!paused) remaining -= now - previousTick;
          previousTick = now;
          render();
          if (remaining <= 0) finish();
        }, 50);
        pauseButton.addEventListener('click', togglePause);
        nextButton.addEventListener('click', finish);
        window.addEventListener('keydown', onKeyDown);
      });
    }, {
      overlayId: OVERLAY_ID,
      pauseKey: PAUSE_KEY,
      number: sceneNumber,
      sceneTitle: title,
      sceneDetail: detail,
      duration: holdMs,
    });
    await clear(page);
  }

  return { clear, reset, showStatus, showScene };
}
