import puppeteer from 'puppeteer-core';
async function test() {
  try {
    const browser = await puppeteer.launch({
      executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('http://localhost:5173');
    const title = await page.title();
    console.log('SUCCESS: Page title is:', title);
    await browser.close();
  } catch (err) {
    console.error('ERROR:', err);
  }
}
test();
