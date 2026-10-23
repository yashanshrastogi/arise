import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 730, deviceScaleFactor: 1 });
  
  // Set localStorage to Ghaziabad to reproduce the user's view
  await page.goto('http://localhost:5173/#/map', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem('arise_selected_location', JSON.stringify({
      lat: 28.6692,
      lon: 77.4538,
      name: 'Ghaziabad, Uttar Pradesh',
      city: 'Ghaziabad',
      district: 'Ghaziabad',
      region: 'National Capital Region',
      source: 'saved'
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));

  // Check key elements
  const details = await page.evaluate(() => {
    const locateBtn = document.getElementById('btn-locate-me');
    const searchLocateBtn = document.getElementById('btn-search-locate');
    const scopeLocal = document.getElementById('btn-scope-local');
    const scopeCountry = document.getElementById('btn-scope-all-india');
    const scopeGlobe = document.getElementById('btn-scope-globe');
    const locateRect = locateBtn ? locateBtn.getBoundingClientRect() : null;
    const bodyText = document.body.innerText || '';

    return {
      hasLocateBtn: !!locateBtn,
      locateRect: locateRect ? { top: locateRect.top, bottom: locateRect.bottom, right: locateRect.right, width: locateRect.width, height: locateRect.height } : null,
      hasSearchLocateBtn: !!searchLocateBtn,
      scopeLocalText: scopeLocal ? scopeLocal.innerText : null,
      scopeCountryText: scopeCountry ? scopeCountry.innerText : null,
      scopeGlobeText: scopeGlobe ? scopeGlobe.innerText : null,
      hasNcrCorridors: bodyText.includes('NCR Corridors'),
    };
  });

  console.log('Verification Details:', JSON.stringify(details, null, 2));

  const screenshotDir = path.resolve(process.env.HOME, 'arise/artifacts');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, 'map-ui-verification.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // Click on Layers header to open the drawer
  await page.evaluate(() => {
    const layersHeader = document.querySelector('[class*="cursor-pointer select-none"]');
    if (layersHeader) layersHeader.click();
  });
  await new Promise(r => setTimeout(r, 600));
  const openDrawerPath = path.join(screenshotDir, 'map-ui-drawer-open.png');
  await page.screenshot({ path: openDrawerPath });
  console.log('Open drawer screenshot saved to:', openDrawerPath);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
