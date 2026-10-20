/**
 * TizenPortal Protection Statistics System
 * 
 * Tracks and persists global cumulative statistics (ads blocked, popups blocked,
 * trackers dropped, and clickjack overlays cleaned) across restarts, page reloads,
 * and cross-origin navigations.
 * 
 * Storage Architecture:
 * 1. Persistent Master Storage: localStorage['tp_adblock_stats'] (retained across app/TV restarts)
 * 2. Cross-Origin In-Flight Relay: window.name (__tp_stats__=...) (persists across redirects/domains in the same tab)
 * 3. Return Payload: #stats=BASE64(JSON) when returning to the portal launcher
 */

var STORAGE_KEY = 'tp_adblock_stats';

var defaultStats = {
  totalBlocked: 0,
  ads: 0,
  popups: 0,
  trackers: 0,
  overlays: 0,
  lastUpdated: null,
};

/**
 * Get current protection statistics
 * @returns {Object}
 */
export function getStats() {
  var stats = Object.assign({}, defaultStats);

  // 1. Load from localStorage (persists across restarts)
  try {
    if (typeof localStorage !== 'undefined') {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.totalBlocked === 'number') {
          stats.totalBlocked = parsed.totalBlocked || 0;
          stats.ads = parsed.ads || 0;
          stats.popups = parsed.popups || 0;
          stats.trackers = parsed.trackers || 0;
          stats.overlays = parsed.overlays || 0;
          stats.lastUpdated = parsed.lastUpdated || null;
        }
      }
    }
  } catch (e) {
    // Ignore storage errors
  }

  // 2. Check window.name for cross-origin updates that occurred on target sites
  try {
    if (typeof window !== 'undefined' && window.name) {
      var match = window.name.match(/__tp_stats__=([^;]+)/);
      if (match) {
        var fromName = JSON.parse(decodeURIComponent(match[1]));
        if (fromName && typeof fromName.totalBlocked === 'number') {
          stats.totalBlocked = Math.max(stats.totalBlocked, fromName.totalBlocked || 0);
          stats.ads = Math.max(stats.ads, fromName.ads || 0);
          stats.popups = Math.max(stats.popups, fromName.popups || 0);
          stats.trackers = Math.max(stats.trackers, fromName.trackers || 0);
          stats.overlays = Math.max(stats.overlays, fromName.overlays || 0);
        }
      }
    }
  } catch (e) {
    // Ignore window.name parse errors
  }

  return stats;
}

/**
 * Save protection statistics to storage and window.name
 * @param {Object} stats
 * @returns {Object}
 */
export function saveStats(stats) {
  var s = {
    totalBlocked: Math.max(0, parseInt(stats.totalBlocked, 10) || 0),
    ads: Math.max(0, parseInt(stats.ads, 10) || 0),
    popups: Math.max(0, parseInt(stats.popups, 10) || 0),
    trackers: Math.max(0, parseInt(stats.trackers, 10) || 0),
    overlays: Math.max(0, parseInt(stats.overlays, 10) || 0),
    lastUpdated: Date.now(),
  };

  // 1. Save to persistent localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    }
  } catch (e) {
    // Ignore storage errors
  }

  // 2. Save to window.name for cross-origin persistence across domains
  try {
    if (typeof window !== 'undefined') {
      var str = encodeURIComponent(JSON.stringify(s));
      var cur = window.name || '';
      if (cur.indexOf('__tp_stats__=') !== -1) {
        window.name = cur.replace(/__tp_stats__=[^;]+/, '__tp_stats__=' + str);
      } else {
        window.name = cur ? cur + ';__tp_stats__=' + str : '__tp_stats__=' + str;
      }
    }
  } catch (e) {
    // Ignore window.name errors
  }

  return s;
}

/**
 * Record a blocked item and update stats
 * @param {'ad'|'popup'|'tracker'|'overlay'} type
 * @param {number} [count=1]
 * @returns {Object} Updated stats
 */
export function recordBlocked(type, count) {
  var c = count || 1;
  var stats = getStats();

  stats.totalBlocked += c;
  if (type === 'popup') {
    stats.popups = (stats.popups || 0) + c;
  } else if (type === 'tracker') {
    stats.trackers = (stats.trackers || 0) + c;
  } else if (type === 'overlay') {
    stats.overlays = (stats.overlays || 0) + c;
  } else {
    stats.ads = (stats.ads || 0) + c;
  }

  return saveStats(stats);
}

/**
 * Merge an external stats object into master stats
 * @param {Object} externalStats
 * @returns {Object}
 */
export function mergeStats(externalStats) {
  if (!externalStats || typeof externalStats.totalBlocked !== 'number') {
    return getStats();
  }
  var current = getStats();
  current.totalBlocked = Math.max(current.totalBlocked, externalStats.totalBlocked || 0);
  current.ads = Math.max(current.ads, externalStats.ads || 0);
  current.popups = Math.max(current.popups, externalStats.popups || 0);
  current.trackers = Math.max(current.trackers, externalStats.trackers || 0);
  current.overlays = Math.max(current.overlays, externalStats.overlays || 0);
  return saveStats(current);
}

/**
 * Reset statistics to zero
 * @returns {Object}
 */
export function resetStats() {
  var fresh = Object.assign({}, defaultStats, { lastUpdated: Date.now() });
  return saveStats(fresh);
}
