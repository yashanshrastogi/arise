import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('--- TEST 1: Initial Local Map View & Legend Absence ---');
  await page.goto('http://localhost:5173/#/map', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  const initialCheck = await page.evaluate(() => {
    return {
      hasLegendBar: document.body.innerText.includes('AQI Concentration (0–500)'),
      hasGood0: document.body.innerText.includes('Good (0)'),
      hasSevere500: document.body.innerText.includes('Severe (500)'),
      hasScopeLocal: !!document.getElementById('btn-scope-local'),
      hasScopeIndia: !!document.getElementById('btn-scope-all-india'),
      hasScopeGlobe: !!document.getElementById('btn-scope-globe'),
      localButtonText: document.getElementById('btn-scope-local')?.innerText,
      indiaButtonText: document.getElementById('btn-scope-all-india')?.innerText,
      globeButtonText: document.getElementById('btn-scope-globe')?.innerText,
    };
  });
  console.log('Initial Check:', JSON.stringify(initialCheck, null, 2));

  console.log('--- TEST 2: National View (Tier 2: Major Metros) ---');
  await page.click('#btn-scope-all-india');
  await new Promise(r => setTimeout(r, 1500));
  const nationalCheck = await page.evaluate(() => {
    const map = window.__ariseMap;
    return {
      zoom: map?.getZoom(),
      center: map?.getCenter() ? { lat: map.getCenter().lat(), lng: map.getCenter().lng() } : null,
      activeScope: document.getElementById('btn-scope-all-india')?.className.includes('bg-indigo-600'),
    };
  });
  console.log('National View Check:', JSON.stringify(nationalCheck, null, 2));
  await page.screenshot({ path: '/home/yashansh_rastogi/arise/artifacts/map-tier2-national.png' });

  console.log('--- TEST 3: Global World View (Tier 1: Countries & Telemetry) ---');
  await page.click('#btn-scope-globe');
  await new Promise(r => setTimeout(r, 1500));
  const globalCheck = await page.evaluate(() => {
    const map = window.__ariseMap;
    return {
      zoom: map?.getZoom(),
      center: map?.getCenter() ? { lat: map.getCenter().lat(), lng: map.getCenter().lng() } : null,
      activeScope: document.getElementById('btn-scope-globe')?.className.includes('bg-indigo-600'),
    };
  });
  console.log('Global View Check:', JSON.stringify(globalCheck, null, 2));
  await page.screenshot({ path: '/home/yashansh_rastogi/arise/artifacts/map-tier1-global.png' });

  console.log('--- TEST 4: Return to Local View & Smooth Zoom/Pan Benchmark ---');
  await page.click('#btn-scope-local');
  await new Promise(r => setTimeout(r, 1500));
  const benchmark = await page.evaluate(async () => {
    const map = window.__ariseMap;
    if (!map) return { error: 'No map instance' };

    const timings = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      // Zoom step
      map.setZoom(map.getZoom() + 1);
      await new Promise(r => setTimeout(r, 100));
      // Pan step
      map.panTo({ lat: 28.6139 + (i * 0.01), lng: 77.2090 + (i * 0.01) });
      await new Promise(r => setTimeout(r, 100));
      map.setZoom(map.getZoom() - 1);
      await new Promise(r => setTimeout(r, 100));
      const t1 = performance.now();
      timings.push(t1 - t0);
    }
    const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    return {
      iterations: timings.length,
      averageCycleMs: Math.round(avgMs),
      samples: timings.map(t => Math.round(t)),
    };
  });
  console.log('Benchmark Timings:', JSON.stringify(benchmark, null, 2));

  console.log('--- TEST 5: Non-Delhi City Location (Pune) Isolation Check ---');
  await page.goto('about:blank');
  await page.goto('http://localhost:5173/#/map', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('arise_selected_location', JSON.stringify({
      lat: 18.5204,
      lon: 73.8567,
      name: 'Pune, Maharashtra',
      city: 'Pune',
      district: 'Pune',
      region: 'Maharashtra',
      source: 'custom'
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  const nonDelhiCheck = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const localBtn = document.getElementById('btn-scope-local');
    const map = window.__ariseMap;
    const center = map?.getCenter();
    return {
      localButtonText: localBtn?.innerText,
      mapCenterLat: center ? center.lat() : null,
      mapCenterLng: center ? center.lng() : null,
      isNearPune: center ? (Math.abs(center.lat() - 18.52) < 0.5 && Math.abs(center.lng() - 73.85) < 0.5) : false,
      hasDelhiFallback: bodyText.includes('Anand Vihar') && !bodyText.includes('Pune'),
    };
  });
  console.log('Non-Delhi Check (Pune):', JSON.stringify(nonDelhiCheck, null, 2));
  await page.screenshot({ path: '/home/yashansh_rastogi/arise/artifacts/map-non-delhi-pune.png' });

  console.log('--- TEST 6: Search & Inspector Pin Interaction ---');
  await page.waitForSelector('#input-map-search', { visible: true, timeout: 6000 });
  await page.click('#input-map-search');
  await page.type('#input-map-search', 'Jaipur', { delay: 50 });
  await page.waitForSelector('[id^="search-result-"]', { visible: true, timeout: 4000 });
  const searchResultsCount = await page.evaluate(() => {
    const results = document.querySelectorAll('[id^="search-result-"]');
    return results.length;
  });
  console.log('Search Results Count for "Jaipur":', searchResultsCount);
  await page.screenshot({ path: '/home/yashansh_rastogi/arise/artifacts/map-search-results.png' });

  // Click first result
  await page.click('[id^="search-result-"]');
  await new Promise(r => setTimeout(r, 1500));
  const afterSelection = await page.evaluate(() => {
    const map = window.__ariseMap;
    const center = map?.getCenter();
    return {
      centerLat: center ? center.lat() : null,
      centerLng: center ? center.lng() : null,
      isNearJaipur: center ? (Math.abs(center.lat() - 26.91) < 0.5 && Math.abs(center.lng() - 75.78) < 0.5) : false,
    };
  });
  console.log('After selecting search result:', JSON.stringify(afterSelection, null, 2));
  await page.screenshot({ path: '/home/yashansh_rastogi/arise/artifacts/map-inspector-placed.png' });

  await browser.close();
  console.log('All comprehensive tests finished successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
