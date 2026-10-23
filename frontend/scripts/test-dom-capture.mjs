import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

async function test() {
  console.log('Testing dark mode DOM capture to PNG...');
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('arise_theme', 'dark');
    const convId = 'guest_demo_1';
    localStorage.setItem('arise_guest_conversations', JSON.stringify([{
      id: convId,
      title: 'Outdoor Running Safety',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      preview: 'Can I go for a jog right now?',
    }]));
    localStorage.setItem(`arise_conv_msg_${convId}`, JSON.stringify([{
      q: 'Should my 8-year-old child attend football practice today?',
      verdict: 'STAY IN',
      headline: 'Air quality is Very Poor. Cancel outdoor sports and field practices.',
      why: [
        'PM2.5 concentration is 218 µg/m³, which is 14x above WHO guidelines.',
        'High respiratory exposure during aerobic activity increases pulmonary stress in children.'
      ],
      do: [
        'Move soccer drills to an indoor sports hall with HEPA filtration.',
        'Ensure hydration and monitor for coughing or throat irritation.'
      ],
      best_window: 'Unavailable',
      assistant_label: 'Arise Pediatric Advisory',
      is_rule_based: false,
      evaluator_verdict: 'VALID',
      timestamp: new Date().toISOString(),
    }]));
  });

  await page.goto('http://localhost:5173/#/ask', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.waitForSelector('button[id^="btn-share-reply-"]', { timeout: 10000 });

  const captureResult = await page.evaluate(async () => {
    // Ensure dark class is applied
    document.documentElement.classList.add('dark');
    await new Promise(r => setTimeout(r, 100));

    const btn = document.querySelector('button[id^="btn-share-reply-"]');
    const turnEl = btn.closest('.space-y-2\\.5');
    if (!turnEl) return { error: 'turnEl not found' };

    function cloneWithStyles(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent);
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return node.cloneNode(true);
      }

      // Hide or skip interactive buttons (read aloud, share)
      if (node.tagName === 'BUTTON' || node.getAttribute('aria-label')?.includes('Share') || node.getAttribute('aria-label')?.includes('Read response')) {
        return null;
      }

      const clone = document.createElement(node.tagName.toLowerCase());
      const computed = window.getComputedStyle(node);

      const props = [
        'display', 'flex-direction', 'align-items', 'justify-content', 'gap',
        'box-sizing',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'background-color', 'background',
        'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
        'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
        'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
        'box-shadow',
        'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'color',
        'list-style-type', 'list-style-position'
      ];

      let styleStr = '';
      for (const p of props) {
        const val = computed.getPropertyValue(p);
        if (val) {
          styleStr += `${p}:${val};`;
        }
      }

      if (computed.display === 'flex') {
        styleStr += 'width:100%;';
      } else if (node.classList.contains('max-w-[85%]')) {
        styleStr += 'max-width:85%;';
      }

      clone.setAttribute('style', styleStr);

      for (let child = node.firstChild; child; child = child.nextSibling) {
        const clonedChild = cloneWithStyles(child);
        if (clonedChild) {
          clone.appendChild(clonedChild);
        }
      }
      return clone;
    }

    const rect = turnEl.getBoundingClientRect();
    const cloned = cloneWithStyles(turnEl);

    const isDark = document.documentElement.classList.contains('dark');
    const pageBg = isDark ? '#0b0f19' : '#f8fafc';

    const containerWidth = Math.max(500, Math.min(800, Math.round(rect.width)));
    const container = document.createElement('div');
    container.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    container.setAttribute('style', `
      background: ${pageBg};
      padding: 24px;
      width: ${containerWidth}px;
      box-sizing: border-box;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    `);

    // Top Brand Bar
    const brandBar = document.createElement('div');
    brandBar.setAttribute('style', `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
    `);
    brandBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🌱</span>
        <span style="font-weight: 900; font-size: 14px; color: ${isDark ? '#f8fafc' : '#0f172a'};">Arise</span>
        <span style="font-weight: 700; font-size: 11px; color: #818cf8;">Atmospheric &amp; Health Intelligence</span>
      </div>
      <div style="font-weight: 700; font-size: 10px; color: ${isDark ? '#94a3b8' : '#64748b'};">
        Deterministic CPCB Safety
      </div>
    `;
    container.appendChild(brandBar);
    container.appendChild(cloned);

    // Bottom Watermark
    const footerBar = document.createElement('div');
    footerBar.setAttribute('style', `
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      font-weight: 700;
      color: ${isDark ? '#64748b' : '#94a3b8'};
    `);
    footerBar.innerHTML = `
      <span>Real-time environmental telemetry · Not medical advice</span>
      <span>arise.earth</span>
    `;
    container.appendChild(footerBar);

    // Measure height
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    document.body.appendChild(container);
    const measuredHeight = container.offsetHeight || Math.round(rect.height + 90);
    document.body.removeChild(container);
    container.style.position = '';
    container.style.left = '';
    container.style.top = '';

    const serializer = new XMLSerializer();
    const xhtml = serializer.serializeToString(container);

    const width = containerWidth;
    const height = measuredHeight;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">
        ${xhtml}
      </foreignObject>
    </svg>`;

    return new Promise((resolve) => {
      const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = 2; // retina 2x
          const canvas = document.createElement('canvas');
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve({
            success: true,
            width,
            height,
            dataUrlLength: dataUrl.length,
            dataUrl,
          });
        } catch (err) {
          resolve({ success: false, error: err.message });
        }
      };
      img.onerror = (e) => resolve({ success: false, error: 'img load error' });
      img.src = dataUri;
    });
  });

  console.log('Dark mode capture result:', {
    success: captureResult.success,
    width: captureResult.width,
    height: captureResult.height,
    dataUrlLength: captureResult.dataUrlLength,
    error: captureResult.error,
  });

  if (captureResult.dataUrl) {
    const base64Data = captureResult.dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync('/home/yashansh_rastogi/arise/artifacts/captured-conversation-dark.png', base64Data, 'base64');
    console.log('Saved dark mode screenshot to /home/yashansh_rastogi/arise/artifacts/captured-conversation-dark.png');
  }

  await browser.close();
}

test().catch(console.error);
