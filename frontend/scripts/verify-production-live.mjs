import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const PROD_URL = 'https://frontend.dqmsa8e2klyso.amplifyapp.com';
const PROD_SCREENSHOT_DIR = path.resolve(process.env.HOME, 'arise/artifacts/production-live-screenshots');
if (!fs.existsSync(PROD_SCREENSHOT_DIR)) {
  fs.mkdirSync(PROD_SCREENSHOT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844, scale: 3 },
  { name: 'desktop-1280', width: 1280, height: 800, scale: 1 }
];

const ROUTES = [
  {
    path: '/#/today',
    label: 'today',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      return bodyText.includes('Stay indoors') || bodyText.includes('Mandir Marg') || !!document.getElementById('btn-open-glossary');
    }
  },
  {
    path: '/#/map',
    label: 'map',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      return !!document.getElementById('btn-map-back-to-today') || bodyText.includes('Air Quality & Fire Map');
    }
  },
  {
    path: '/#/ask',
    label: 'ask',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      return bodyText.includes('Ask Arise');
    }
  },
  {
    path: '/#/more',
    label: 'more',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      return bodyText.includes('Regional Life, School & Travel Guides') || bodyText.includes('Should kids play outside?');
    }
  },
  {
    path: '/#/login',
    label: 'login',
    verifyFn: () => {
      const modal = document.getElementById('auth-modal-backdrop');
      const bodyText = modal ? modal.innerText : '';
      return !!modal && (bodyText.includes('Welcome Back') || !!document.getElementById('input-login-email'));
    }
  },
  {
    path: '/#/signup',
    label: 'signup',
    verifyFn: () => {
      const modal = document.getElementById('auth-modal-backdrop');
      return !!modal && (!!document.getElementById('input-signup-email') || !!document.getElementById('btn-signup-submit'));
    }
  }
];

async function verifyLiveProduction() {
  console.log(`🌐 Verifying Live Production Deployment at: ${PROD_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const results = [];
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  for (const vp of VIEWPORTS) {
    console.log(`\n📱 Testing Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.scale });

    for (const r of ROUTES) {
      const targetUrl = `${PROD_URL}${r.path}`;
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(res => setTimeout(res, 1200)); // wait for API data fusion

      const check = await page.evaluate((verifyFnString) => {
        try {
          const fn = new Function('return (' + verifyFnString + ')()');
          const isLoaded = fn();
          const docWidth = document.documentElement.offsetWidth;
          const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
          const windowWidth = window.innerWidth;
          return {
            isLoaded: !!isLoaded,
            currentHash: window.location.hash,
            scrollWidth,
            windowWidth,
            hasOverflow: scrollWidth > windowWidth + 1,
            overflowDelta: Math.max(0, scrollWidth - windowWidth)
          };
        } catch (e) {
          return {
            isLoaded: false,
            error: e.message
          };
        }
      }, r.verifyFn.toString());

      const shotName = `live_prod_${vp.name}_${r.label}.png`;
      await page.screenshot({ path: path.join(PROD_SCREENSHOT_DIR, shotName) });

      const pass = check.isLoaded && !check.hasOverflow;
      console.log(`  ${pass ? '✅' : '❌'} [${r.label.padEnd(8)}] Route Loaded: ${check.isLoaded ? 'YES' : 'NO'}, Hash: ${check.currentHash}, Overflow: ${check.overflowDelta}px`);

      results.push({
        viewport: vp.name,
        route: r.label,
        pass,
        routeLoaded: check.isLoaded,
        overflowDelta: check.overflowDelta,
        currentHash: check.currentHash,
        screenshot: shotName
      });
    }
  }

  // Also verify live API communication
  console.log('\n📡 Verifying Live Frontend API Communication...');
  await page.goto(`${PROD_URL}/#/today`, { waitUntil: 'networkidle2' });
  const apiCheck = await page.evaluate(async () => {
    try {
      const res = await fetch('https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod/environment/health');
      const data = await res.json();
      return { status: res.status, ok: res.ok, data };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log(`  API Health check response:`, JSON.stringify(apiCheck));

  await browser.close();

  const reportPath = path.resolve(process.env.HOME, 'arise/artifacts/production_verification_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ results, apiCheck, pageErrors }, null, 2));

  console.log(`\n========================================`);
  console.log(`Production Verification Complete!`);
  console.log(`Results saved to: ${reportPath}`);
  console.log(`Screenshots in: ${PROD_SCREENSHOT_DIR}`);
  console.log(`========================================\n`);
}

verifyLiveProduction().catch(err => {
  console.error('Production verification failed:', err);
  process.exit(1);
});
