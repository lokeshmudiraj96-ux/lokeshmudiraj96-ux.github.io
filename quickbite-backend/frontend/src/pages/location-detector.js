/**
 * Location detector component for QuickBite
 * - tries browser geolocation first
 * - falls back to IP-based lookup
 * - supports search/autocomplete via Nominatim (OpenStreetMap)
 * - saves selection in localStorage (key: quickbite_location)
 * - dispatches 'locationChanged' CustomEvent on document with { lat, lon, label }
 *
 * NOTE: For production usage or higher request volumes, use a proper geocoding provider (Mapbox/Google) with API keys.
 */

(function () {
  const LS_KEY = 'quickbite_location';
  const btn = document.getElementById('use-location-btn');
  const labelEl = document.getElementById('location-label');
  const controls = document.getElementById('location-controls');
  const searchInput = document.getElementById('location-search');
  const suggestions = document.getElementById('location-suggestions');
  const useGeoBtn = document.getElementById('use-geo');
  const useIpBtn = document.getElementById('use-ip');
  const closeBtn = document.getElementById('close-location');

  const state = {
    loading: false,
    results: [],
    focusedSuggestion: -1
  };

  function setLoading(v) {
    state.loading = v;
    if (v) {
      btn.classList.add('disabled');
      btn.setAttribute('aria-busy', 'true');
    } else {
      btn.classList.remove('disabled');
      btn.removeAttribute('aria-busy');
    }
  }

  function saveLocation(loc) {
    localStorage.setItem(LS_KEY, JSON.stringify(loc));
    dispatchLocation(loc);
  }

  function dispatchLocation(loc) {
    labelEl.textContent = loc.label || 'Selected location';
    const ev = new CustomEvent('locationChanged', { detail: loc });
    document.dispatchEvent(ev);
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const loc = JSON.parse(raw);
        if (loc && loc.lat && loc.lon) {
          dispatchLocation(loc);
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Reverse geocode using Nominatim
  async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error('Reverse geocode failed');
    return resp.json();
  }

  // Search (autocomplete) using Nominatim
  async function searchPlaces(q) {
    if (!q || q.length < 2) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=6`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error('Search failed');
    return resp.json();
  }

  // Fallback IP lookup via ipapi.co (free-ish, check limits and privacy)
  async function ipLookup() {
    const url = 'https://ipapi.co/json/';
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error('IP lookup failed');
    return resp.json();
  }

  // UI helpers
  function showControls() {
    controls.classList.remove('hidden');
    searchInput.focus();
  }
  function hideControls() {
    controls.classList.add('hidden');
    suggestions.classList.add('hidden');
    searchInput.value = '';
    state.results = [];
    renderSuggestions();
  }

  function renderSuggestions() {
    suggestions.innerHTML = '';
    if (!state.results || state.results.length === 0) {
      suggestions.classList.add('hidden');
      return;
    }
    suggestions.classList.remove('hidden');
    state.results.forEach((r, idx) => {
      const li = document.createElement('li');
      li.setAttribute('role','option');
      li.setAttribute('data-idx', idx);
      li.id = `loc-sug-${idx}`;
      li.tabIndex = 0;
      li.textContent = r.display_name || `${r.name || ''}`;
      li.setAttribute('aria-selected', state.focusedSuggestion === idx ? 'true' : 'false');
      li.addEventListener('click', () => selectSuggestion(idx));
      li.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') selectSuggestion(idx);
      });
      suggestions.appendChild(li);
    });
  }

  function selectSuggestion(idx) {
    const item = state.results[idx];
    if (!item) return;
    const loc = {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      label: item.display_name
    };
    saveLocation(loc);
    hideControls();
  }

  // Public actions
  async function doGeolocation() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const info = await reverseGeocode(lat, lon);
        const label = info.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        const loc = { lat, lon, label };
        saveLocation(loc);
      } catch (err) {
        console.error(err);
        alert('Could not resolve your location to an address.');
      } finally {
        setLoading(false);
      }
    }, async (err) => {
      console.warn('Geolocation error', err);
      setLoading(false);
      // On permission denied or other errors, fall back to IP lookup
      try {
        await doIpLookup();
      } catch (e) {
        alert('Location detection failed.');
      }
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  async function doIpLookup() {
    setLoading(true);
    try {
      const resp = await ipLookup();
      const lat = parseFloat(resp.latitude || resp.lat || resp.latitude);
      const lon = parseFloat(resp.longitude || resp.lon || resp.longitude);
      const labelParts = [resp.city, resp.region, resp.country_name].filter(Boolean);
      const label = labelParts.join(', ') || resp.ip || `${lat}, ${lon}`;
      if (!isNaN(lat) && !isNaN(lon)) {
        const loc = { lat, lon, label };
        saveLocation(loc);
      } else {
        throw new Error('No lat/lon in IP response');
      }
    } catch (err) {
      console.error('IP lookup failed', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // Search input debounce
  let debounceTimer = null;
  searchInput && searchInput.addEventListener('input', (ev) => {
    const q = ev.target.value.trim();
    clearTimeout(debounceTimer);
    if (!q) {
      state.results = [];
      renderSuggestions();
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const res = await searchPlaces(q);
        state.results = res;
        state.focusedSuggestion = -1;
        renderSuggestions();
      } catch (err) {
        console.error(err);
      }
    }, 300);
  });

  // keyboard navigation
  searchInput && searchInput.addEventListener('keydown', (ev) => {
    if (!state.results || state.results.length === 0) return;
    if (ev.key === 'ArrowDown') {
      state.focusedSuggestion = Math.min(state.focusedSuggestion + 1, state.results.length - 1);
      renderSuggestions();
      document.getElementById(`loc-sug-${state.focusedSuggestion}`)?.focus();
      ev.preventDefault();
    } else if (ev.key === 'ArrowUp') {
      state.focusedSuggestion = Math.max(state.focusedSuggestion - 1, 0);
      renderSuggestions();
      document.getElementById(`loc-sug-${state.focusedSuggestion}`)?.focus();
      ev.preventDefault();
    } else if (ev.key === 'Enter' && state.focusedSuggestion >= 0) {
      selectSuggestion(state.focusedSuggestion);
      ev.preventDefault();
    }
  });

  // Buttons
  btn && btn.addEventListener('click', () => {
    // toggle controls
    if (controls.classList.contains('hidden')) showControls(); else hideControls();
  });

  useGeoBtn && useGeoBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    doGeolocation();
  });

  useIpBtn && useIpBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    doIpLookup();
  });

  closeBtn && closeBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    hideControls();
  });

  // click outside should close
  document.addEventListener('click', (ev) => {
    const target = ev.target;
    const container = document.getElementById('location-detector');
    if (!container) return;
    if (!container.contains(target)) {
      hideControls();
    }
  });

  // Initialize from saved value
  loadSaved();

  // Expose for debugging
  window.QuickBiteLocation = {
    getCurrent: () => {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    clear: () => {
      localStorage.removeItem(LS_KEY);
      labelEl.textContent = 'Select location';
    }
  };
})();
