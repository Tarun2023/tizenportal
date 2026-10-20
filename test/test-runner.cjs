/**
 * TizenPortal Local Test Suite
 * 
 * Tests the AdBlock bundle, popup interception, overlay detection,
 * and TV remote event handling in a simulated Tizen TV browser environment.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('   TIZENPORTAL AUTOMATED TEST SUITE (Tizen TV Mock)   ');
console.log('====================================================\n');

// 1. Setup simulated Samsung Tizen TV browser environment
const html = `<!DOCTYPE html>
<html>
<head><title>Simulated TV Page</title></head>
<body>
  <div id="content">
    <h1>Test Video Player Page</h1>
    <button id="play-btn">Play Video</button>
    <a id="ad-link" href="https://popads.net/click" target="_blank">Fake Download Ad</a>
    <a id="clean-link" href="https://example.com/stream" target="_blank">Clean Stream Link</a>
  </div>
</body>
</html>`;

const dom = new JSDOM(html, {
  url: 'https://senpai-stream.makeup/watch/episode-1',
  runScripts: 'dangerously',
  resources: 'usable'
});

const win = dom.window;
const doc = win.document;

// Mock screen dimensions for 1080p TV
win.innerWidth = 1920;
win.innerHeight = 1080;

// Mock Samsung Tizen TV device API
win.tizen = {
  tvinputdevice: {
    registerKey: function(keyName) {
      // console.log('Mock Tizen: Registered key ' + keyName);
      return true;
    },
    unregisterKey: function(keyName) {
      return true;
    },
    getKey: function(keyName) {
      return { name: keyName, code: 1000 };
    }
  }
};

// Track results
let passed = 0;
let failed = 0;

function assert(condition, testName, details) {
  if (condition) {
    console.log('  ✅ PASS: ' + testName);
    passed++;
  } else {
    console.error('  ❌ FAIL: ' + testName + (details ? ' (' + details + ')' : ''));
    failed++;
  }
}

// 2. Load the bundled distribution script
const bundlePath = path.join(__dirname, '../dist/tizenportal.js');
const bundleCode = fs.readFileSync(bundlePath, 'utf8');

// Inject TizenPortal runtime into the DOM
const scriptEl = doc.createElement('script');
scriptEl.textContent = bundleCode;
doc.head.appendChild(scriptEl);

const TP = win.TizenPortal;

console.log('--- Test Group 1: Runtime Initialization & Registry ---');
assert(!!TP, 'TizenPortal global object is initialized');
assert(TP && TP.version === '1121', 'TizenPortal version is 1121', 'Got: ' + (TP ? TP.version : 'null'));

const adblockBundle = TP && TP.bundles ? TP.bundles.get('adblock') : null;
assert(!!adblockBundle, 'AdBlock bundle exists in registry');

const manifest = adblockBundle ? adblockBundle.manifest : null;
assert(manifest && manifest.provides && manifest.provides.includes('popup-blocking'), 
  'AdBlock manifest declares popup-blocking support');

const blockPopupsOption = manifest && manifest.options ? manifest.options.find(o => o.key === 'blockPopups') : null;
assert(!!blockPopupsOption, 'AdBlock manifest exposes "blockPopups" option');
assert(blockPopupsOption && blockPopupsOption.default === true, '"blockPopups" defaults to true');
assert(typeof adblockBundle.getBlockedCount === 'function', 'AdBlock exposes getBlockedCount() API');
assert(typeof TP.onLogEntry === 'function', 'TizenPortal exposes onLogEntry listener API');


console.log('\n--- Test Group 2: Popup Blocker (window.open Interception) ---');
// Activate AdBlock bundle on the window
const card = {
  id: 'test-card-1',
  name: 'Senpai Stream',
  url: 'https://senpai-stream.makeup/watch/episode-1',
  featureBundle: 'adblock',
  bundleOptions: { strict: true, blockPopups: true }
};

adblockBundle.onBeforeLoad(win, card);
adblockBundle.onAfterLoad(win, card);

// Test 2.1: Known ad popup
const adPopup = win.open('https://popads.net/serve?id=12345', '_blank', 'width=600,height=400');
assert(!!adPopup, 'window.open on ad URL returns safe mock Window object (does not crash)');
assert(typeof adPopup.focus === 'function' && typeof adPopup.close === 'function', 'Mock window provides safe no-op methods');

// Test 2.2: Blank popup (frequently used by popunder scripts)
const blankPopup = win.open('about:blank', '_blank');
assert(!!blankPopup, 'window.open on about:blank returns mock Window object');

// Test 2.3: Adsterra popup
const adsterraPopup = win.open('https://adsterra.com/direct?zone=789', '_new');
assert(!!adsterraPopup, 'window.open on Adsterra popunder network blocked');

// Test 2.4: Monetag popup
const monetagPopup = win.open('https://monetag.com/click', '_blank');
assert(!!monetagPopup, 'window.open on Monetag popup network blocked');


console.log('\n--- Test Group 3: Link & target="_blank" Interception ---');
// Test 3.1: Clicking an ad link
const adLink = doc.getElementById('ad-link');
let adClickDefaultPrevented = false;
const evt1 = new win.MouseEvent('click', { bubbles: true, cancelable: true });
adLink.dispatchEvent(evt1);
assert(evt1.defaultPrevented, 'Click on popads.net ad link was intercepted and canceled');

// Test 3.2: Clean link with target="_blank" (should be neutralized to prevent opening secondary TV tab)
const cleanLink = doc.getElementById('clean-link');
const evt2 = new win.MouseEvent('click', { bubbles: true, cancelable: true });
cleanLink.dispatchEvent(evt2);
assert(!cleanLink.hasAttribute('target') || cleanLink.getAttribute('target') === '', 
  'target="_blank" was automatically stripped from link to keep single-tab TV focus');


console.log('\n--- Test Group 4: Clickjacking & Full-Screen Overlay Detection ---');
// Simulate an invisible transparent click overlay injected by streaming site
const overlay = doc.createElement('div');
overlay.id = 'streaming-click-trap';
overlay.style.position = 'fixed';
overlay.style.top = '0px';
overlay.style.left = '0px';
overlay.style.width = '1920px';
overlay.style.height = '1080px';
overlay.style.zIndex = '2147483647'; // max z-index
overlay.style.opacity = '0';
// Mock getBoundingClientRect for jsdom
overlay.getBoundingClientRect = function() {
  return { top: 0, left: 0, width: 1920, height: 1080, right: 1920, bottom: 1080 };
};
doc.body.appendChild(overlay);

assert(doc.getElementById('streaming-click-trap') !== null, 'Clickjack overlay element was mounted');

// Run overlay detection
adblockBundle.removeClickOverlays(doc);
assert(doc.getElementById('streaming-click-trap') === null, 
  'Full-screen clickjack overlay was successfully detected and eliminated from DOM');


console.log('\n--- Test Group 5: Request Interception (fetch & XHR) ---');
// Test 5.1: Blocked fetch
let fetchBlocked = false;
win.fetch('https://googleadservices.com/pagead/show_ads.js')
  .catch(err => {
    if (err && err.message && err.message.includes('Blocked by TizenPortal AdBlock')) {
      fetchBlocked = true;
    }
  });

// Wait briefly for promise resolution
setTimeout(() => {
  assert(fetchBlocked, 'fetch() to known ad domain (googleadservices) was blocked');

  // Test 5.2: Blocked XHR
  const xhr = new win.XMLHttpRequest();
  xhr.open('GET', 'https://doubleclick.net/rpc');
  assert(xhr._blocked === true, 'XMLHttpRequest to doubleclick.net was marked blocked');

  console.log('\n--- Test Group 6: Ad SDK Neutralization (Stubbing) ---');
  assert(typeof win.adsbygoogle !== 'undefined', 'window.adsbygoogle is defined');
  let pushThrew = false;
  try {
    win.adsbygoogle.push({});
  } catch (e) {
    pushThrew = true;
  }
  assert(!pushThrew, 'window.adsbygoogle.push() executes safely without throwing');

  assert(typeof win.googletag === 'object', 'window.googletag is stubbed');
  assert(typeof win.gtag === 'function', 'window.gtag is stubbed');
  assert(typeof win.ga === 'function', 'window.ga is stubbed');
  assert(typeof win.fbq === 'function', 'window.fbq is stubbed');
  assert(adblockBundle.getBlockedCount() >= 5, 'adblock.getBlockedCount() tracked blocked items correctly (count: ' + adblockBundle.getBlockedCount() + ')');

  console.log('\n--- Test Group 7: Persistent Statistics & Global Storage ---');
  assert(typeof TP.stats === 'object', 'TizenPortal.stats API is exposed');
  const stats = TP.stats.get();
  assert(stats && stats.totalBlocked > 0, 'Global statistics stored in localStorage (totalBlocked: ' + stats.totalBlocked + ')');
  assert(stats.popups > 0, 'Popups counter persisted (> 0): ' + stats.popups);
  assert(typeof TP.stats.reset === 'function', 'TizenPortal.stats.reset() is available');

  console.log('\n====================================================');
  console.log('              TEST RUN SUMMARY                      ');
  console.log('====================================================');
  console.log('Total Tests: ' + (passed + failed));
  console.log('Passed:      ' + passed);
  console.log('Failed:      ' + failed);

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Code is safe and validated.');
    process.exit(0);
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.');
    process.exit(1);
  }
}, 50);
