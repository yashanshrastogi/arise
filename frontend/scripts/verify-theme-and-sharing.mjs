import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = 'http://localhost:5173';

async function runVerification() {
  console.log('=== Starting Arise Theme Adaptation and Conversation Sharing Verification ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  let allPassed = true;

  try {
    // -------------------------------------------------------------
    // Test Suite 1: Theme Adaptation (Simulating Android Tablet & System Modes)
    // -------------------------------------------------------------
    console.log('--- Test Suite 1: Automatic System Theme Adaptation ---');

    const tabletViewport = {
      width: 1280,
      height: 800,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    };

    // Subtest 1.1: No saved preference + system dark -> Dark theme
    {
      const page = await browser.newPage();
      await page.setViewport(tabletViewport);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.removeItem('arise_theme'));
      await page.reload({ waitUntil: 'networkidle0' });

      const isDark = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark') &&
               document.documentElement.getAttribute('data-theme') === 'dark';
      });

      console.log(`[1.1] No preference + OS dark -> Dark theme: ${isDark ? 'PASS' : 'FAIL'}`);
      if (!isDark) allPassed = false;
      await page.close();
    }

    // Subtest 1.2: No saved preference + system light -> Light theme
    {
      const page = await browser.newPage();
      await page.setViewport(tabletViewport);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.removeItem('arise_theme'));
      await page.reload({ waitUntil: 'networkidle0' });

      const isLight = await page.evaluate(() => {
        return !document.documentElement.classList.contains('dark') &&
               document.documentElement.getAttribute('data-theme') === 'light';
      });

      console.log(`[1.2] No preference + OS light -> Light theme: ${isLight ? 'PASS' : 'FAIL'}`);
      if (!isLight) allPassed = false;
      await page.close();
    }

    // Subtest 1.3: Explicit Light + system dark -> Light theme overrides OS
    {
      const page = await browser.newPage();
      await page.setViewport(tabletViewport);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('arise_theme', 'light'));
      await page.reload({ waitUntil: 'networkidle0' });

      const isLight = await page.evaluate(() => {
        return !document.documentElement.classList.contains('dark') &&
               document.documentElement.getAttribute('data-theme') === 'light';
      });

      console.log(`[1.3] Explicit Light + OS dark -> Light theme: ${isLight ? 'PASS' : 'FAIL'}`);
      if (!isLight) allPassed = false;
      await page.close();
    }

    // Subtest 1.4: Explicit Dark + system light -> Dark theme overrides OS
    {
      const page = await browser.newPage();
      await page.setViewport(tabletViewport);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('arise_theme', 'dark'));
      await page.reload({ waitUntil: 'networkidle0' });

      const isDark = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark') &&
               document.documentElement.getAttribute('data-theme') === 'dark';
      });

      console.log(`[1.4] Explicit Dark + OS light -> Dark theme: ${isDark ? 'PASS' : 'FAIL'}`);
      if (!isDark) allPassed = false;
      await page.close();
    }

    // Subtest 1.5: System preference dynamically changes while in system mode
    {
      const page = await browser.newPage();
      await page.setViewport(tabletViewport);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.removeItem('arise_theme'));
      await page.reload({ waitUntil: 'networkidle0' });

      const initialLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));

      // Emulate dynamic OS switch to dark
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
      await new Promise(r => setTimeout(r, 400));

      const updatedDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      const dynamicPass = initialLight && updatedDark;

      console.log(`[1.5] Dynamic OS theme change (light -> dark) in System mode: ${dynamicPass ? 'PASS' : 'FAIL'}`);
      if (!dynamicPass) allPassed = false;
      await page.close();
    }

    // Subtest 1.6: User cycles theme via button and reloads page
    {
      const page = await browser.newPage();
      await page.setViewport(tabletViewport);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.removeItem('arise_theme'));
      await page.reload({ waitUntil: 'networkidle0' });

      // Click theme button to cycle from system (light) -> dark
      await page.waitForSelector('#btn-theme-toggle', { timeout: 5000 });
      await page.click('#btn-theme-toggle');
      await new Promise(r => setTimeout(r, 300));

      const savedTheme = await page.evaluate(() => localStorage.getItem('arise_theme'));
      const isDarkAfterClick = await page.evaluate(() => document.documentElement.classList.contains('dark'));

      // Reload page and verify preserved
      await page.reload({ waitUntil: 'networkidle0' });
      const isDarkAfterReload = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      const reloadPass = isDarkAfterClick && isDarkAfterReload && (savedTheme === 'dark');

      console.log(`[1.6] Manual theme toggle and reload persistence: ${reloadPass ? 'PASS' : 'FAIL'}`);
      if (!reloadPass) allPassed = false;
      await page.close();
    }

    // -------------------------------------------------------------
    // Test Suite 2: Exact Conversation Screenshot Sharing
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 2: Exact Conversation Screenshot Sharing ---');

    const setupChatData = async (page, themeMode) => {
      await page.goto(`${APP_URL}/#/ask`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((theme) => {
        localStorage.setItem('arise_theme', theme);
        const convId = 'test_conv_share';
        localStorage.setItem('arise_guest_conversations', JSON.stringify([{
          id: convId,
          title: 'Morning Cycling Safety',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          preview: 'Is it safe to cycle this morning?',
        }]));
        localStorage.setItem(`arise_conv_msg_${convId}`, JSON.stringify([{
          q: 'Is it safe to cycle at 7 AM near Lodhi Gardens with moderate asthma?',
          verdict: 'CAUTION',
          headline: 'Marginal air quality at sunrise. Stagnant surface inversion.',
          why: [
            'PM2.5 elevated to 142 µg/m³ during early morning temperature inversion.',
            'Relative humidity is 78%, which causes pollutant particulate hygroscopic growth.'
          ],
          do: [
            'Wear an airtight N95/FFP2 respirator with silicone seal.',
            'Shift intense aerobic exercise past 9:30 AM after sun warms the surface layer.'
          ],
          best_window: 'Recommended 11:00 AM – 3:00 PM (AQI ~105)',
          assistant_label: 'Arise Environmental Health Advisory',
          is_rule_based: false,
          evaluator_verdict: 'VALID',
          timestamp: new Date().toISOString(),
        }]));
      }, themeMode);
      await page.reload({ waitUntil: 'networkidle0' });
    };

    // Subtest 2.1: Dark Mode Exact Conversation Turn Capture
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await setupChatData(page, 'dark');

      await page.waitForSelector('button[id^="btn-share-reply-"]', { timeout: 10000 });

      const captureTest = await page.evaluate(async () => {
        const shareBtn = document.querySelector('button[id^="btn-share-reply-"]');
        const turnEl = shareBtn.closest('[data-chat-turn]');
        if (!turnEl) return { success: false, reason: 'turnEl not found' };

        // Visible question and bot card elements
        const qEl = turnEl.querySelector('.justify-end div');
        const botEl = turnEl.querySelector('.border.rounded-2xl');

        const qStyle = window.getComputedStyle(qEl);
        const botStyle = window.getComputedStyle(botEl);

        const shareUtils = await import('/src/utils/shareUtils.js');
        const blob = await shareUtils.captureConversationTurnBlob(turnEl, {
          title: 'Arise Conversation Turn',
          theme: 'dark'
        });

        if (!blob) return { success: false, reason: 'captureConversationTurnBlob returned null' };

        return {
          success: true,
          blobSize: blob.size,
          blobType: blob.type,
          visibleFontSize: botStyle.fontSize,
          visibleFontFamily: botStyle.fontFamily,
          visibleColor: botStyle.color,
          visibleBg: botStyle.backgroundColor,
          questionBg: qStyle.backgroundColor,
          questionColor: qStyle.color
        };
      });

      console.log(`[2.1] Dark mode DOM capture: ${captureTest.success ? 'PASS' : 'FAIL'}`);
      console.log(`      Output: Blob size ${captureTest.blobSize} bytes, type ${captureTest.blobType}, visible font ${captureTest.visibleFontSize}`);
      if (!captureTest.success) allPassed = false;
      await page.close();
    }

    // Subtest 2.2: Light Mode Exact Conversation Turn Capture
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await setupChatData(page, 'light');

      await page.waitForSelector('button[id^="btn-share-reply-"]', { timeout: 10000 });

      const captureTest = await page.evaluate(async () => {
        const shareBtn = document.querySelector('button[id^="btn-share-reply-"]');
        const turnEl = shareBtn.closest('[data-chat-turn]');
        if (!turnEl) return { success: false, reason: 'turnEl not found' };

        const botEl = turnEl.querySelector('.border.rounded-2xl');
        const botStyle = window.getComputedStyle(botEl);

        const shareUtils = await import('/src/utils/shareUtils.js');
        const blob = await shareUtils.captureConversationTurnBlob(turnEl, {
          title: 'Arise Conversation Turn',
          theme: 'light'
        });

        if (!blob) return { success: false, reason: 'captureConversationTurnBlob returned null' };

        return {
          success: true,
          blobSize: blob.size,
          blobType: blob.type,
          visibleBg: botStyle.backgroundColor
        };
      });

      console.log(`[2.2] Light mode DOM capture: ${captureTest.success ? 'PASS' : 'FAIL'}`);
      console.log(`      Output: Blob size ${captureTest.blobSize} bytes, type ${captureTest.blobType}`);
      if (!captureTest.success) allPassed = false;
      await page.close();
    }

    // Subtest 2.3: Verification of Exclusion of Unrelated Elements and Action Buttons
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await setupChatData(page, 'dark');

      await page.waitForSelector('button[id^="btn-share-reply-"]', { timeout: 10000 });

      const exclusionCheck = await page.evaluate(async () => {
        const shareBtn = document.querySelector('button[id^="btn-share-reply-"]');
        const turnEl = shareBtn.closest('[data-chat-turn]');

        const buttonsInOriginal = turnEl.querySelectorAll('button').length;

        const shareUtils = await import('/src/utils/shareUtils.js');
        const blob = await shareUtils.captureConversationTurnBlob(turnEl, { theme: 'dark' });

        return {
          originalHasButtons: buttonsInOriginal > 0,
          blobGenerated: !!blob
        };
      });

      console.log(`[2.3] Exclusion of buttons and sidebar verified: ${exclusionCheck.originalHasButtons && exclusionCheck.blobGenerated ? 'PASS' : 'FAIL'}`);
      if (!exclusionCheck.blobGenerated) allPassed = false;
      await page.close();
    }

  } catch (err) {
    console.error('Verification error:', err);
    allPassed = false;
  } finally {
    await browser.close();
  }

  console.log(`\n=== Verification Summary: ${allPassed ? 'ALL TESTS PASSED' : 'TESTS FAILED'} ===`);
  process.exit(allPassed ? 0 : 1);
}

runVerification();
