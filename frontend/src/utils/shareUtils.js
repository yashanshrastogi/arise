/**
 * Arise Share Utility — Generates faithful, high-fidelity image exports
 * of rendered conversation turns directly from the live conversation DOM.
 *
 * Preserves active light/dark theme, typography floor, colors, badges,
 * and layout while cropping tightly around the intended conversation content.
 */

const MAX_IMAGE_HEIGHT = 2800;

/**
 * Clones a DOM element while inlining all computed styles.
 * Strips out interactive buttons (share, audio) so they do not appear in the screenshot.
 */
function cloneWithComputedStyles(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return node.cloneNode(true);
  }

  // Hide or omit interactive buttons (read aloud, share)
  if (
    node.tagName === 'BUTTON' ||
    node.getAttribute('data-share-exclude') === 'true' ||
    node.getAttribute('aria-label')?.includes('Share') ||
    node.getAttribute('aria-label')?.includes('Read response')
  ) {
    return null;
  }

  const clone = document.createElement(node.tagName.toLowerCase());
  const computed = window.getComputedStyle(node);

  const props = [
    'display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'flex-wrap',
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
    'word-break', 'overflow-wrap', 'white-space',
    'list-style-type', 'list-style-position'
  ];

  let styleStr = '';
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const val = computed.getPropertyValue(p);
    if (val) {
      styleStr += `${p}:${val};`;
    }
  }

  // Ensure flex rows take full container width so justify-content: flex-end aligns within bounds
  if (computed.display === 'flex') {
    styleStr += 'width:100%;';
  } else if (node.classList && (node.classList.contains('max-w-[85%]') || node.className.includes('max-w-'))) {
    styleStr += 'max-width:85%;';
  }

  clone.setAttribute('style', styleStr);

  for (let child = node.firstChild; child; child = child.nextSibling) {
    const clonedChild = cloneWithComputedStyles(child);
    if (clonedChild) {
      clone.appendChild(clonedChild);
    }
  }

  return clone;
}

/**
 * Captures an exact rendered conversation turn element directly from the DOM
 * into a PNG Blob matching the user's active theme and typography.
 *
 * @param {HTMLElement} element - The conversation turn DOM element (question bubble + assistant card)
 * @param {Object} [options]
 * @param {boolean} [options.isDark] - Override dark mode detection
 * @returns {Promise<Blob|null>}
 */
export async function captureConversationTurnBlob(element, options = {}) {
  if (!element || typeof document === 'undefined') {
    return null;
  }

  try {
    // Wait for web fonts to load
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    const isDark = typeof options.isDark === 'boolean'
      ? options.isDark
      : document.documentElement.classList.contains('dark');

    const pageBg = isDark ? '#0b0f19' : '#f8fafc';
    const borderSubtle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textBrand = isDark ? '#f8fafc' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const accentIndigo = isDark ? '#818cf8' : '#6366f1';

    const rect = element.getBoundingClientRect();
    const clonedTurn = cloneWithComputedStyles(element);

    if (!clonedTurn) {
      return null;
    }

    const containerWidth = Math.max(500, Math.min(840, Math.round(rect.width || 720)));

    const container = document.createElement('div');
    container.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    container.setAttribute('style', `
      background: ${pageBg};
      padding: 24px;
      width: ${containerWidth}px;
      box-sizing: border-box;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `);

    // Top Brand Header
    const brandBar = document.createElement('div');
    brandBar.setAttribute('style', `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid ${borderSubtle};
      width: 100%;
      box-sizing: border-box;
    `);
    brandBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🌱</span>
        <span style="font-weight: 900; font-size: 14px; color: ${textBrand}; letter-spacing: -0.01em;">Arise</span>
        <span style="font-weight: 700; font-size: 11px; color: ${accentIndigo};">Atmospheric &amp; Health Intelligence</span>
      </div>
      <div style="font-weight: 700; font-size: 10px; color: ${textMuted};">
        Deterministic CPCB Safety
      </div>
    `;
    container.appendChild(brandBar);
    container.appendChild(clonedTurn);

    // Bottom Watermark
    const footerBar = document.createElement('div');
    footerBar.setAttribute('style', `
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid ${borderSubtle};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      font-weight: 700;
      color: ${textMuted};
      width: 100%;
      box-sizing: border-box;
    `);
    footerBar.innerHTML = `
      <span>Environmental exposure advisory · Not medical advice</span>
      <span>arise.earth</span>
    `;
    container.appendChild(footerBar);

    // Temporarily attach offscreen to accurately measure rendered height
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    document.body.appendChild(container);
    const naturalHeight = container.offsetHeight || Math.round(rect.height + 90);
    document.body.removeChild(container);
    container.style.position = '';
    container.style.left = '';
    container.style.top = '';

    const width = containerWidth;
    const height = Math.min(MAX_IMAGE_HEIGHT, naturalHeight);

    if (naturalHeight > MAX_IMAGE_HEIGHT) {
      container.style.maxHeight = `${MAX_IMAGE_HEIGHT}px`;
      container.style.overflow = 'hidden';
    }

    const serializer = new XMLSerializer();
    const xhtml = serializer.serializeToString(container);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject width="100%" height="100%">
          ${xhtml}
        </foreignObject>
      </svg>
    `;

    return new Promise((resolve) => {
      // Use data URI to prevent origin taint on HTMLCanvasElement
      const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const img = new Image();

      img.onload = () => {
        try {
          const scale = 2; // Crisp 2x retina rasterization
          const canvas = document.createElement('canvas');
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        resolve(null);
      };

      img.src = dataUri;
    });
  } catch {
    return null;
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = (text || '').split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  return currentY + lineHeight;
}

/**
 * Fallback static advisory card generator if DOM capture is unavailable.
 */
export async function generateAdvisoryCardBlob({
  question = 'Should I go outside today?',
  verdict = 'STAY IN',
  headline = 'Air quality is Very Poor.',
  why = [],
  doActions = [],
  locationName = 'Monitored Location',
  timestamp = 'Today',
  isDark = true,
}) {
  const width = 1000;
  const estimatedLines = 6 + (why.length * 3) + (doActions.length * 3) + Math.ceil(headline.length / 45);
  const height = Math.max(750, Math.min(1600, 320 + estimatedLines * 28));

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const bgColor = isDark ? '#0F172A' : '#F8FAFC';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Header Brand
  ctx.fillStyle = '#6366F1';
  ctx.beginPath();
  ctx.arc(60, 60, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('A', 52, 68);

  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = textColor;
  ctx.fillText('Arise', 95, 58);

  ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = subtextColor;
  ctx.fillText('Atmospheric & Health Intelligence', 95, 78);

  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = isDark ? '#E2E8F0' : '#334155';
  ctx.textAlign = 'right';
  ctx.fillText(`📍 ${locationName}`, width - 50, 58);

  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = subtextColor;
  ctx.fillText(`${timestamp}`, width - 50, 78);
  ctx.textAlign = 'left';

  ctx.strokeStyle = borderColor;
  ctx.beginPath();
  ctx.moveTo(50, 105);
  ctx.lineTo(width - 50, 105);
  ctx.stroke();

  let y = 145;

  // Question bubble
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)';
  ctx.beginPath();
  ctx.roundRect(50, y, width - 100, 56, 14);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.fillStyle = subtextColor;
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Q:', 70, y + 33);
  ctx.fillStyle = textColor;
  ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(question.length > 80 ? question.slice(0, 78) + '…' : question, 95, y + 33);

  y += 85;

  const verdictClean = (verdict || 'STAY IN').toUpperCase();
  let vBg = '#E11D48';
  if (verdictClean.includes('GO')) vBg = '#059669';
  else if (verdictClean.includes('SMART')) vBg = '#D97706';
  else if (verdictClean.includes('CUT')) vBg = '#EA580C';

  ctx.fillStyle = vBg;
  ctx.beginPath();
  ctx.roundRect(50, y, 140, 32, 16);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(verdictClean, 65, y + 21);

  y += 55;

  ctx.fillStyle = textColor;
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  y = wrapText(ctx, headline.replace(/\*\*/g, ''), 50, y, width - 100, 30);

  y += 15;

  if (why && why.length > 0) {
    ctx.fillStyle = isDark ? '#818CF8' : '#4F46E5';
    ctx.font = '900 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('KEY OBSERVATIONS', 50, y);
    y += 24;

    ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDark ? '#E2E8F0' : '#334155';
    for (const item of why) {
      const cleanItem = '• ' + item.replace(/^[•\-\*]\s*/, '').replace(/\*\*/g, '');
      y = wrapText(ctx, cleanItem, 55, y, width - 110, 24);
      y += 4;
    }
    y += 15;
  }

  if (doActions && doActions.length > 0) {
    ctx.fillStyle = isDark ? '#34D399' : '#059669';
    ctx.font = '900 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('RECOMMENDED ACTIONS', 50, y);
    y += 24;

    ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDark ? '#E2E8F0' : '#334155';
    for (const act of doActions) {
      const cleanAct = '• ' + act.replace(/^[•\-\*]\s*/, '').replace(/\*\*/g, '');
      y = wrapText(ctx, cleanAct, 55, y, width - 110, 24);
      y += 4;
    }
  }

  ctx.strokeStyle = borderColor;
  ctx.beginPath();
  ctx.moveTo(50, height - 55);
  ctx.lineTo(width - 50, height - 55);
  ctx.stroke();

  ctx.fillStyle = subtextColor;
  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Environmental exposure advisory · Not medical advice · Observed & satellite telemetry', 50, height - 32);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * High-level share handler:
 * Attempts faithful live DOM capture first; if element is not supplied or fails,
 * seamlessly falls back to the deterministic canvas card generator.
 */
export async function shareAdvisoryCard({
  element = null,
  question,
  verdict,
  headline,
  why,
  doActions,
  locationName,
  timestamp,
}) {
  try {
    let blob = null;

    // 1. Attempt faithful rendered DOM capture
    if (element) {
      blob = await captureConversationTurnBlob(element);
    }

    // 2. Fallback to canvas card generator if DOM capture produced null
    if (!blob) {
      const isDark = typeof document !== 'undefined'
        ? document.documentElement.classList.contains('dark')
        : true;

      blob = await generateAdvisoryCardBlob({
        question,
        verdict,
        headline,
        why,
        doActions,
        locationName,
        timestamp,
        isDark,
      });
    }

    if (!blob) return { success: false, error: 'Failed to generate advisory image.' };

    const file = new File([blob], `arise-advisory-${Date.now()}.png`, { type: 'image/png' });

    // Native sharing if supported
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Arise Environmental Advisory',
          text: `${question}\n${headline}`,
          files: [file],
        });
        return { success: true, method: 'share' };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
      }
    }

    // Direct download fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arise-advisory-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    return { success: true, method: 'download' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
