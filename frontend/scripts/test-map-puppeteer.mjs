import puppeteer from 'puppeteer-core';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    const origError = console.error;
    console.error = function(...args) {
      origError.apply(console, args);
      const stack = new Error().stack;
      console.log('CAPTURED_ERROR_STACK:', stack);
    };
  });
  page.on('console', msg => {
    console.log(`BROWSER [${msg.type()}]:`, msg.text(), msg.location ? JSON.stringify(msg.location()) : '');
  });
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message, err.stack));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/#/map', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Current URL:', page.url());
  const elements = await page.evaluate(() => {
    return {
      title: document.title,
      hasAirMapContainer: !!document.getElementById('arise-air-map-container'),
      hasScopeLocal: !!document.getElementById('btn-scope-local'),
      hasScopeCountry: !!document.getElementById('btn-scope-all-india'),
      hasScopeGlobe: !!document.getElementById('btn-scope-globe'),
      hasLocateMe: !!document.getElementById('btn-locate-me'),
      hasLegend: document.body.innerText.includes('AQI Concentration (0–500)'),
      hasGood0: document.body.innerText.includes('Good (0)'),
      hasSevere500: document.body.innerText.includes('Severe (500)'),
      bodySnippet: document.body.innerText.slice(0, 300),
    };
  });
  console.log('DOM Elements:', JSON.stringify(elements, null, 2));

  // Test map interaction & frame rate
  const perf = await page.evaluate(async () => {
    const map = window.__ariseMap;
    if (!map) return { hasMapInstance: false };

    const start = performance.now();
    // Simulate zoom in and zoom out
    map.setZoom(map.getZoom() + 1);
    await new Promise(r => setTimeout(r, 300));
    map.setZoom(map.getZoom() - 1);
    await new Promise(r => setTimeout(r, 300));
    // Simulate panning
    map.panTo({ lat: 19.0760, lng: 72.8777 }); // Mumbai
    await new Promise(r => setTimeout(r, 400));
    map.panTo({ lat: 28.6139, lng: 77.2090 }); // Delhi
    await new Promise(r => setTimeout(r, 400));
    const end = performance.now();

    return {
      hasMapInstance: true,
      totalDurationMs: end - start,
      currentZoom: map.getZoom(),
      currentCenter: map.getCenter() ? { lat: map.getCenter().lat(), lng: map.getCenter().lng() } : null,
    };
  });
  console.log('Map Performance & Interaction:', JSON.stringify(perf, null, 2));

  await page.screenshot({ path: '/home/yashansh_rastogi/arise/artifacts/map-live-tested.png' });
  console.log('Screenshot saved to artifacts/map-live-tested.png');

  await browser.close();
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
