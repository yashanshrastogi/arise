import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(process.env.HOME, 'arise/artifacts/responsive-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 568, deviceScaleFactor: 2 },
  { name: 'phone-360', width: 360, height: 800, deviceScaleFactor: 2 },
  { name: 'phone-390', width: 390, height: 844, deviceScaleFactor: 3 },
  { name: 'phone-430', width: 430, height: 932, deviceScaleFactor: 3 },
  { name: 'phone-landscape-844', width: 844, height: 390, deviceScaleFactor: 3 },
  { name: 'tablet-768', width: 768, height: 1024, deviceScaleFactor: 2 },
  { name: 'tablet-820', width: 820, height: 1180, deviceScaleFactor: 2 },
  { name: 'tablet-landscape-1180', width: 1180, height: 820, deviceScaleFactor: 2 },
  { name: 'laptop-1024', width: 1024, height: 768, deviceScaleFactor: 1 },
  { name: 'desktop-1280', width: 1280, height: 800, deviceScaleFactor: 1 },
  { name: 'desktop-1440', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'fhd-1920', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: 'ultrawide-2560', width: 2560, height: 1440, deviceScaleFactor: 1 }
];

const ROUTES = [
  {
    path: '/#/today',
    label: 'today',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      const hasContent = bodyText.includes('Stay indoors') || bodyText.includes('Mandir Marg') || bodyText.includes('Air Flow Status');
      const hasGlossary = !!document.getElementById('btn-open-glossary');
      return hasContent || hasGlossary;
    },
    expectedName: 'Today Dashboard'
  },
  {
    path: '/#/map',
    label: 'map',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      const hasMapBackBtn = !!document.getElementById('btn-map-back-to-today');
      const hasMapHeading = bodyText.includes('Air Quality & Fire Map');
      return hasMapBackBtn || hasMapHeading;
    },
    expectedName: 'Interactive Map View'
  },
  {
    path: '/#/ask',
    label: 'ask',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      const hasAskHeader = bodyText.includes('Ask Arise');
      const hasAskInput = !!document.querySelector('input[placeholder*="Ask"], input[placeholder*="ask"]') || bodyText.includes('Sign in to unlock');
      return hasAskHeader && hasAskInput;
    },
    expectedName: 'Ask Arise'
  },
  {
    path: '/#/more',
    label: 'more',
    verifyFn: () => {
      const bodyText = document.body.innerText || '';
      const hasMoreHeading = bodyText.includes('Regional Life, School & Travel Guides') || bodyText.includes('Should kids play outside?');
      const hasCorridors = bodyText.includes('Mobility & Smog Corridors') || bodyText.includes('My places');
      return hasMoreHeading && hasCorridors;
    },
    expectedName: 'More Guides & Corridors'
  },
  {
    path: '/#/login',
    label: 'login',
    verifyFn: () => {
      const modal = document.getElementById('auth-modal-backdrop');
      const hasEmail = !!document.getElementById('input-login-email');
      const hasSubmit = !!document.getElementById('btn-login-submit');
      return !!modal && hasEmail && hasSubmit;
    },
    expectedName: 'Login Modal Overlay'
  },
  {
    path: '/#/signup',
    label: 'signup',
    verifyFn: () => {
      const modal = document.getElementById('auth-modal-backdrop');
      const hasEmail = !!document.getElementById('input-signup-email');
      const hasSubmit = !!document.getElementById('btn-signup-submit');
      const hasGoogle = !!document.getElementById('btn-signup-google');
      return !!modal && hasEmail && hasSubmit && hasGoogle;
    },
    expectedName: 'SignUp Modal Overlay'
  }
];

async function runAudit() {
  console.log('🚀 Starting Universal Responsive UI Audit on Arise with canonical hash routes (/#/route)...');
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const report = {
    timestamp: new Date().toISOString(),
    totalTests: 0,
    passed: 0,
    failed: 0,
    routeLoadFailures: 0,
    overflowFailures: 0,
    results: []
  };

  const page = await browser.newPage();

  for (const vp of VIEWPORTS) {
    console.log(`\n📱 Testing Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.deviceScaleFactor || 1
    });

    for (const r of ROUTES) {
      report.totalTests++;
      const fullUrl = `http://localhost:5173${r.path}`;
      
      // Navigate to the canonical hash route
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
      
      // Allow React component rendering & charts initialization
      await new Promise(res => setTimeout(res, 900));

      // 1. Assert that the intended route actually loaded
      const routeCheck = await page.evaluate((verifyFnString, label) => {
        try {
          const fn = new Function('return (' + verifyFnString + ')()');
          const isLoaded = fn();
          const currentHash = window.location.hash;
          return {
            isLoaded: !!isLoaded,
            currentHash,
            actualTitle: document.title
          };
        } catch (e) {
          return {
            isLoaded: false,
            error: e.message,
            currentHash: window.location.hash
          };
        }
      }, r.verifyFn.toString(), r.label);

      // 2. Assert horizontal overflow
      const metrics = await page.evaluate(() => {
        const docWidth = document.documentElement.offsetWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const windowWidth = window.innerWidth;
        const bodyScrollWidth = document.body.scrollWidth;
        
        // Find overflowing elements if any
        const overflowing = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const rect = el.getBoundingClientRect();
          if (rect.right > windowWidth + 1) { // 1px threshold for subpixel rounding
            overflowing.push({
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              className: (typeof el.className === 'string' ? el.className.slice(0, 50) : ''),
              right: Math.round(rect.right),
              width: Math.round(rect.width)
            });
            if (overflowing.length >= 5) break;
          }
        }

        return {
          windowWidth,
          docWidth,
          scrollWidth: Math.max(scrollWidth, bodyScrollWidth),
          hasOverflow: Math.max(scrollWidth, bodyScrollWidth) > windowWidth + 1,
          overflowDelta: Math.max(0, Math.max(scrollWidth, bodyScrollWidth) - windowWidth),
          overflowingElements: overflowing
        };
      });

      const shotFileName = `${vp.name}_${r.label}.png`;
      const shotPath = path.join(SCREENSHOT_DIR, shotFileName);
      await page.screenshot({ path: shotPath, fullPage: false });

      const testPassed = routeCheck.isLoaded && !metrics.hasOverflow;
      
      if (!routeCheck.isLoaded) {
        report.routeLoadFailures++;
      }
      if (metrics.hasOverflow) {
        report.overflowFailures++;
      }

      if (testPassed) {
        report.passed++;
        console.log(`  ✅ [PASS] ${r.label.padEnd(8)} (Route Loaded: YES [hash: ${routeCheck.currentHash}], scrollWidth: ${metrics.scrollWidth}px, innerWidth: ${metrics.windowWidth}px)`);
      } else {
        report.failed++;
        console.warn(`  ❌ [FAIL] ${r.label.padEnd(8)} (Route Loaded: ${routeCheck.isLoaded ? 'YES' : 'NO [hash: ' + routeCheck.currentHash + ']'}, Overflow: +${metrics.overflowDelta}px)`);
      }

      report.results.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        route: r.label,
        path: r.path,
        passed: testPassed,
        routeLoaded: routeCheck.isLoaded,
        currentHash: routeCheck.currentHash,
        scrollWidth: metrics.scrollWidth,
        windowWidth: metrics.windowWidth,
        overflowDelta: metrics.overflowDelta,
        overflowingElements: metrics.overflowingElements,
        screenshot: shotFileName
      });
    }
  }

  // Also test Text Zoom (A+) and Theme Toggle at representative sizes (390px, 1280px)
  console.log('\n🔤 Testing Theme Toggle and Font Scaling (A+)...');
  for (const zoomW of [390, 1280]) {
    await page.setViewport({ width: zoomW, height: 800 });
    await page.goto('http://localhost:5173/#/today', { waitUntil: 'domcontentloaded' });
    await new Promise(res => setTimeout(res, 600));

    // Click font scale toggle
    const fontButton = await page.$('button[title*="font" i], button[aria-label*="font" i]');
    if (fontButton) {
      await fontButton.click();
      await new Promise(res => setTimeout(res, 500));
      const shotName = `font_scaled_${zoomW}_today.png`;
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotName) });
      console.log(`  📸 Saved font scaled screenshot for ${zoomW}px`);
    }

    // Click theme toggle
    const themeButton = await page.$('button[title*="theme" i], button[aria-label*="theme" i]');
    if (themeButton) {
      await themeButton.click();
      await new Promise(res => setTimeout(res, 500));
      const shotName = `theme_toggled_${zoomW}_today.png`;
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotName) });
      console.log(`  📸 Saved theme toggled screenshot for ${zoomW}px`);
    }
  }

  await browser.close();

  const reportJsonPath = path.resolve(process.env.HOME, 'arise/artifacts/responsive_test_report.json');
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));

  console.log(`\n========================================`);
  console.log(`Audit Complete! Total: ${report.totalTests}, Passed: ${report.passed}, Failed: ${report.failed}`);
  console.log(`Route Load Failures: ${report.routeLoadFailures}, Overflow Failures: ${report.overflowFailures}`);
  console.log(`Detailed JSON saved to: ${reportJsonPath}`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`========================================\n`);

  return report;
}

runAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
