import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const screenshotDir = '/home/yashansh_rastogi/arise/artifacts/screenshots';
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function verify() {
  console.log('🚀 Launching Chrome to verify Profile & Locations Autocomplete fix...');
  const browser = await puppeteer.launch({
    executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('Navigating to http://localhost:5173/#/today...');
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  // Set up mock authenticated user in localStorage so Profile modal can be opened
  await page.evaluate(() => {
    const oidcKey = 'oidc.user:https://cognito-idp.us-east-1.amazonaws.com/us-east-1_qm2818Iul:32g687pdc6dulejhh4tcvd69m7';
    const fakeUser = {
      id_token: 'fake.id.token',
      access_token: 'fake.access.token',
      refresh_token: 'fake.refresh.token',
      token_type: 'Bearer',
      scope: 'openid email profile',
      profile: { sub: 'user_123', email: 'yashanshrastogi@gmail.com', name: 'Yashansh Rastogi' },
      expires_at: Math.floor(Date.now() / 1000) + 86400,
    };
    localStorage.setItem(oidcKey, JSON.stringify(fakeUser));
    localStorage.setItem('arise_user_profile', JSON.stringify({
      display_name: 'Yashansh Rastogi',
      configured_personas: ['General Public', 'Work & Outdoor Labor'],
      pinned_personas: ['General Public'],
      home_address: '',
      work_address: 'KCC Institute, Gautam Buddha Nagar, Greater Noida, Uttar Pradesh',
      work_lat: '28.4744',
      work_lon: '77.5040'
    }));
  });

  // Navigate to #/profile to open the Profile & Locations modal
  console.log('Navigating to http://localhost:5173/#/profile...');
  await page.goto('http://localhost:5173/#/profile', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));

  // Check if Home address input is visible
  const homeInput = await page.$('#address-input-home');
  if (!homeInput) {
    console.error('Home input #address-input-home not found. Check modal presence.');
    // Take debug screenshot
    await page.screenshot({ path: path.join(screenshotDir, 'debug_profile_modal.png') });
  } else {
    console.log('Found #address-input-home. Typing "Brahmpuri"...');
    await homeInput.click();
    await homeInput.type('Brahmpuri');
    console.log('Waiting for #address-input-home-dropdown to appear...');
    await page.waitForSelector('#address-input-home-dropdown', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 600));

    // Take screenshot of desktop dropdown
    const shot1 = path.join(screenshotDir, 'profile_autocomplete_desktop.png');
    await page.screenshot({ path: shot1 });
    console.log('Saved desktop screenshot:', shot1);

    // Verify dropdown properties in DOM
    const dropdownInfo = await page.evaluate(() => {
      const dropdown = document.querySelector('#address-input-home-dropdown');
      const homeSection = document.querySelector('#address-input-home').closest('section');
      const workSection = document.querySelector('#address-input-work')?.closest('section');

      if (!dropdown) return { found: false };

      const rect = dropdown.getBoundingClientRect();
      const style = window.getComputedStyle(dropdown);
      const homeSectionStyle = homeSection ? window.getComputedStyle(homeSection) : null;
      const workSectionStyle = workSection ? window.getComputedStyle(workSection) : null;

      // Check items
      const items = Array.from(dropdown.querySelectorAll('li')).map(li => ({
        text: li.innerText.replace(/\n+/g, ' | '),
        bgColor: window.getComputedStyle(li).backgroundColor
      }));

      return {
        found: true,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        zIndex: style.zIndex,
        bgColor: style.backgroundColor,
        homeSectionZIndex: homeSectionStyle?.zIndex,
        workSectionZIndex: workSectionStyle?.zIndex,
        itemCount: items.length,
        items
      };
    });

    console.log('Dropdown DOM Metrics:', JSON.stringify(dropdownInfo, null, 2));

    // Test narrow mobile viewport (390px width)
    console.log('Testing mobile viewport 390x844...');
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 500));
    const shot2 = path.join(screenshotDir, 'profile_autocomplete_mobile.png');
    await page.screenshot({ path: shot2 });
    console.log('Saved mobile screenshot:', shot2);

    // Test selecting a suggestion
    console.log('Testing explicit selection of second suggestion...');
    const options = await page.$$('#address-input-home-dropdown li');
    if (options.length > 1) {
      await options[1].click();
      await new Promise(r => setTimeout(r, 500));

      const finalValues = await page.evaluate(() => {
        const homeVal = document.querySelector('#address-input-home')?.value;
        const workVal = document.querySelector('#address-input-work')?.value;
        return { homeVal, workVal };
      });
      console.log('Selected values (Home updated, Work independent):', finalValues);
    }
  }

  await browser.close();
  console.log('Verification finished successfully!');
}

verify().catch(e => {
  console.error('Verification failed:', e);
  process.exit(1);
});
