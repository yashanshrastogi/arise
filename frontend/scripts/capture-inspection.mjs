import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const outDir = path.resolve(process.env.HOME, 'arise/artifacts/inspection-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage();

  // 1. Mobile 390px Light Mode (Bottom Nav visible at bottom)
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, 'mobile-390-light.png'), fullPage: false });

  // 2. Mobile 390px Dark Mode
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outDir, 'mobile-390-dark.png'), fullPage: false });

  // 3. Desktop 1280px (Header Clock + Forecast Chart)
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
  });
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, 'desktop-1280-today.png'), fullPage: false });

  // 4. Scrolled view showing Forecast Horizon Chart
  await page.evaluate(() => {
    window.scrollBy(0, 520);
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, 'desktop-forecast-chart.png'), fullPage: false });

  await browser.close();
  console.log('Inspection screenshots successfully saved to ' + outDir);
})();
