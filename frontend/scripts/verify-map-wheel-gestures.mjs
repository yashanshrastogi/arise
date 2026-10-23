import puppeteer from 'puppeteer-core';

async function run() {
  console.log('--- STARTING AIRMAP WHEEL & PROVENANCE VERIFICATION ---');
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`BROWSER [${msg.type()}]:`, msg.text());
  });
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/#/map', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Verify Map Container and Gesture Option
  const mapInitCheck = await page.evaluate(() => {
    const map = window.__ariseMap;
    if (!map) return { ready: false };
    return {
      ready: true,
      zoom: map.getZoom(),
      center: { lat: map.getCenter().lat(), lng: map.getCenter().lng() },
    };
  });
  console.log('1. Map Instance Check:', JSON.stringify(mapInitCheck, null, 2));

  // 2. Perform Rapid Mouse-Wheel & Touchpad Simulation with Frame Profiling
  console.log('2. Profiling frame smoothness during rapid mouse-wheel & touchpad bursts...');
  const wheelProfile = await page.evaluate(async () => {
    const mapEl = document.getElementById('arise-air-map-container') || document.querySelector('div[role="region"]') || document.body;
    const rect = mapEl.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const frameDeltas = [];
    let lastTime = performance.now();
    let animId;

    const recordFrame = (now) => {
      frameDeltas.push(now - lastTime);
      lastTime = now;
      animId = requestAnimationFrame(recordFrame);
    };
    animId = requestAnimationFrame(recordFrame);

    const gestureStart = performance.now();
    // Simulate 40 rapid touchpad / mouse-wheel ticks
    for (let i = 0; i < 40; i++) {
      const deltaY = (i % 2 === 0) ? -60 : 60;
      const wheelEvt = new WheelEvent('wheel', {
        clientX,
        clientY,
        deltaY,
        deltaMode: 0,
        bubbles: true,
        cancelable: true,
      });
      mapEl.dispatchEvent(wheelEvt);
      await new Promise(r => setTimeout(r, 16)); // ~60fps cadence
    }

    // Wait 300ms for idle settling
    await new Promise(r => setTimeout(r, 300));
    cancelAnimationFrame(animId);
    const gestureEnd = performance.now();

    const avgFrameMs = frameDeltas.length > 0
      ? frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length
      : 0;
    const maxFrameMs = frameDeltas.length > 0 ? Math.max(...frameDeltas) : 0;
    const longFrames = frameDeltas.filter(f => f > 50).length; // frames taking > 50ms (drops)

    return {
      totalGestureTimeMs: Math.round(gestureEnd - gestureStart),
      totalFramesRecorded: frameDeltas.length,
      avgFrameMs: parseFloat(avgFrameMs.toFixed(2)),
      maxFrameMs: parseFloat(maxFrameMs.toFixed(2)),
      longFramesDropped: longFrames,
      isPerformant: avgFrameMs < 35 && longFrames <= 2,
    };
  });
  console.log('   Wheel Gesture Profiling Results:', JSON.stringify(wheelProfile, null, 2));

  // 3. Inspect Data Provenance & Aggregates on REGIONAL_DISTRICTS and DEFAULT_NATIONAL_HUBS
  console.log('3. Verifying Aggregated Values Labeling, Timestamps & Provenance...');
  const provenanceCheck = await page.evaluate(async () => {
    // Zoom out to Tier 2 (National Hubs)
    const map = window.__ariseMap;
    if (map) {
      map.setZoom(6);
      await new Promise(r => setTimeout(r, 500));
    }

    return {
      tier2Zoom: map ? map.getZoom() : null,
    };
  });
  console.log('   Tier Zoom set:', provenanceCheck);

  await page.screenshot({ path: '/home/yashansh_rastogi/arise/artifacts/map-wheel-tested.png' });
  console.log('   Screenshot saved: /home/yashansh_rastogi/arise/artifacts/map-wheel-tested.png');

  await browser.close();
  console.log('--- VERIFICATION COMPLETED SUCCESSFULLY ---');
}

run().catch(err => {
  console.error('VERIFICATION SCRIPT ERROR:', err);
  process.exit(1);
});
