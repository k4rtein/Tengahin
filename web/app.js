import { findPlaces } from './places.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.getElementById('yr').textContent = new Date().getFullYear();

/* reveal + Lenis */
const items = document.querySelectorAll('[data-reveal]');
if (reduced || !('IntersectionObserver' in window)) items.forEach(e => e.classList.add('in'));
else {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .18, rootMargin: '0px 0px -8% 0px' });
  items.forEach(e => io.observe(e));
  import('https://unpkg.com/lenis@1.3.23/dist/lenis.mjs').then(m => {
    const lenis = new (m.default || m.Lenis)({ duration: 1.15, smoothWheel: true, touchMultiplier: 1.5 });
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }).catch(() => {});
}

/* state */
const PRESET = [
  { name: 'Rumah A (Jakbar)', address: 'Grogol, Jakarta Barat', lat: -6.1664, lon: 106.7900 },
  { name: 'Rumah B (Jaksel)', address: 'Kebayoran Baru, Jakarta Selatan', lat: -6.2431, lon: 106.7993 },
  { name: 'Rumah C (Jakpus)', address: 'Menteng, Jakarta Pusat', lat: -6.1950, lon: 106.8310 }
];
let people = [{ name: 'Teman 1', address: '', lat: null, lon: null }, { name: 'Teman 2', address: '', lat: null, lon: null }];
let mid = null;
let poiRequest = 0;
const grid = document.getElementById('grid');
const $ = id => document.getElementById(id);

function invalidatePoiSearch() {
  poiRequest++;
  const searchButton = $('cafeBtn');
  if (searchButton) searchButton.disabled = false;
}

function render() {
  grid.innerHTML = '';
  people.forEach((p, i) => {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<div class="card-top"><svg class="i"><use href="#pin"/></svg><button class="x" aria-label="Hapus peserta">×</button></div>
      <input class="name" placeholder="Nama" aria-label="Nama">
      <div class="row"><input class="addr" placeholder="Ketik alamat, lalu Enter" aria-label="Alamat"><button class="btn btn-ghost gps" title="Gunakan GPS" aria-label="GPS"><svg class="i" style="width:17px;height:17px"><use href="#globe"/></svg></button></div>
      <div class="status"></div>`;
    const [nm, ad, st] = [c.querySelector('.name'), c.querySelector('.addr'), c.querySelector('.status')];
    nm.value = p.name; ad.value = p.address;
    const show = (t, k) => { st.textContent = t; st.className = 'status ' + (k || ''); };
    let locationRequest = 0;
    if (p.lat != null) show(`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, 'ok');
    nm.oninput = () => p.name = nm.value;
    ad.oninput = () => {
      p.address = ad.value;
      p.lat = p.lon = null;
      mid = null;
      locationRequest++;
      invalidatePoiSearch();
      show(ad.value.trim() ? 'Tekan Enter untuk mencari alamat.' : '');
    };
    const geocode = async () => {
      const address = ad.value.trim();
      if (!address) return;
      const request = ++locationRequest;
      show('Mencari…');
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address + ', Indonesia'));
        if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
        const j = await r.json();
        if (request !== locationRequest) return;
        if (!j.length) { p.lat = p.lon = null; return show('Alamat tidak ditemukan. Coba tambah nama kecamatan atau kota.', 'err'); }
        p.lat = +j[0].lat; p.lon = +j[0].lon;
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
          p.lat = p.lon = null;
          return show('Koordinat alamat tidak valid. Coba alamat lain.', 'err');
        }
        show(`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, 'ok');
      } catch {
        if (request === locationRequest) show('Gagal menghubungi Nominatim. Cek koneksi internet.', 'err');
      }
    };
    ad.onkeydown = e => { if (e.key === 'Enter') geocode(); };
    ad.onchange = geocode;
    c.querySelector('.gps').onclick = () => {
      if (!navigator.geolocation) return show('Browser tidak mendukung GPS.', 'err');
      const request = ++locationRequest;
      mid = null;
      invalidatePoiSearch();
      show('Mendeteksi posisi…');
      navigator.geolocation.getCurrentPosition(pos => {
        if (request !== locationRequest) return;
        p.lat = pos.coords.latitude; p.lon = pos.coords.longitude; p.address = 'Lokasi GPS saya'; ad.value = p.address;
        show(`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, 'ok');
      }, () => {
        if (request === locationRequest) show('Izin GPS ditolak atau posisi tidak tersedia.', 'err');
      }, { enableHighAccuracy: true, timeout: 10000 });
    };
    c.querySelector('.x').onclick = () => { people.splice(i, 1); mid = null; invalidatePoiSearch(); render(); };
    grid.appendChild(c);
  });
  const add = document.createElement('button');
  add.className = 'card add'; add.textContent = '+ Tambah Peserta';
  add.onclick = () => { people.push({ name: 'Teman ' + (people.length + 1), address: '', lat: null, lon: null }); mid = null; invalidatePoiSearch(); render(); };
  grid.appendChild(add);
}

/* map */
const BASES = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/', 'https://unpkg.com/leaflet@1.9.4/dist/'];
const loadJS = (url, timeoutMs = 8000) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  const timeout = setTimeout(() => {
    script.remove();
    reject(new Error(`Waktu tunggu habis saat memuat ${url}`));
  }, timeoutMs);
  script.onload = () => { clearTimeout(timeout); resolve(); };
  script.onerror = () => { clearTimeout(timeout); reject(new Error(`Gagal memuat ${url}`)); };
  script.src = url;
  document.head.appendChild(script);
});
async function loadLeaflet() {
  for (const base of BASES) {
    try {
      await loadJS(base + 'leaflet.js');
      if (!window.L) continue;
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = base + 'leaflet.css';
      document.head.appendChild(stylesheet);
      return;
    } catch {}
  }
}
async function initializeApp() {
await loadLeaflet();

let map, layer, poiLayer;
let participantMarkers = [];
let placeMarkers = [];

function clearMarkers() {
  participantMarkers.forEach(marker => marker.remove());
  participantMarkers = [];
  clearPlaceMarkers();
  if (layer) layer.clearLayers();
}

function clearPlaceMarkers() {
  placeMarkers.forEach(marker => marker.remove());
  placeMarkers = [];
  if (poiLayer) poiLayer.clearLayers();
}

if (window.L) {
  map = window.L.map('map', { scrollWheelZoom: false }).setView([-6.2, 106.82], 11);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);
  layer = window.L.layerGroup().addTo(map);
  poiLayer = window.L.layerGroup().addTo(map);
} else {
  $('map').innerHTML = '<p style="padding:24px;color:var(--muted);line-height:1.6">Peta gagal dimuat karena Leaflet tidak bisa diunduh. Cek koneksi atau pengaturan blokir, lalu muat ulang. Hitungan titik tengah tetap jalan.</p>';
}
const icon = cls => window.L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function addMarker(lat, lon, content, kind) {
  if (!map) return null;
  const marker = window.L.marker([lat, lon], {
    icon: icon(kind === 'place' ? 'place-marker' : kind === 'midpoint' ? 'mid' : 'pin')
  }).addTo(kind === 'place' ? poiLayer : layer);
  if (content) marker.bindPopup(content);
  (kind === 'place' ? placeMarkers : participantMarkers).push(marker);
  return marker;
}

function calc() {
  invalidatePoiSearch();
  mid = null;
  const v = people.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (v.length < 2) {
    clearMarkers();
    $('mapLink').href = 'https://www.google.com/maps';
    $('readout').textContent = 'Butuh minimal dua peserta dengan lokasi valid. Ketik alamat lalu tekan Enter, atau pakai GPS.';
    $('placesList').replaceChildren();
    return;
  }
  const lat = v.reduce((s, p) => s + p.lat, 0) / v.length, lon = v.reduce((s, p) => s + p.lon, 0) / v.length;
  mid = { lat, lon };
  if (map) {
    clearMarkers();
    v.forEach(p => addMarker(p.lat, p.lon, `<b>${esc(p.name)}</b><br>${esc(p.address || '')}`, 'person'));
    addMarker(lat, lon, '<b>Titik Tengah</b>', 'midpoint');
    map.fitBounds(window.L.latLngBounds([...v.map(p => [p.lat, p.lon]), [lat, lon]]).pad(.3));
  }
  $('mapLink').href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  $('readout').innerHTML = `Titik tengah dari ${v.length} peserta: <b>${lat.toFixed(5)}, ${lon.toFixed(5)}</b>`;
  $('placesList').replaceChildren();
  $('mapview').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

async function findNearbyPlaces() {
  if (!mid) { calc(); if (!mid) return; }
  const searchMid = mid;
  const request = ++poiRequest;
  const isCurrentRequest = () => request === poiRequest && mid === searchMid;
  $('cafeBtn').disabled = true;
  $('readout').textContent = 'Mencari tempat dalam radius 2 km… (long ass loading time, please wait)';
  const pending = document.createElement('p');
  pending.className = 'places-message';
  pending.textContent = 'nah bro this function is not working properly 😭😭😭😭';
  $('placesList').replaceChildren(pending);
  try {
    const places = await findPlaces(searchMid, isCurrentRequest);
    if (!isCurrentRequest() || !places) return;
    places.sort((a, b) => a.distance - b.distance);
    const nearbyPlaces = places.slice(0, 20);
    clearPlaceMarkers();
    const list = $('placesList');
    list.replaceChildren();
    nearbyPlaces.forEach(place => {
      const distance = place.distance / 1000;
      const card = document.createElement('article');
      card.className = 'place-card';

      const body = document.createElement('div');
      body.className = 'place-card-body';
      const heading = document.createElement('h3');
      heading.textContent = place.name;
      body.appendChild(heading);
      const details = document.createElement('p');
      details.className = 'place-meta';
      details.textContent = `${place.label || 'Tempat menarik'} · ${distance.toFixed(1)} km`;
      body.appendChild(details);
      const rating = document.createElement('p');
      rating.className = 'place-rating';
      rating.textContent = Number.isFinite(place.rating)
        ? `★ ${place.rating.toFixed(1)}`
        : 'Rating tidak tersedia di OpenStreetMap';
      body.appendChild(rating);
      if (place.address) {
        const address = document.createElement('p');
        address.className = 'place-meta';
        address.textContent = place.address;
        body.appendChild(address);
      }
      const link = document.createElement('a');
      link.className = 'place-link';
      const googleMapsQuery = encodeURIComponent(`${place.name} ${place.lat},${place.lon}`);
      link.href = `https://www.google.com/maps/search/?api=1&query=${googleMapsQuery}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Lihat detail di Google Maps';
      body.appendChild(link);
      card.appendChild(body);
      list.appendChild(card);
      if (map) addMarker(place.lat, place.lon,
        `<b>${esc(place.name || 'Tempat menarik')}</b><br>${esc(place.label || 'Tempat menarik')} · ${distance.toFixed(1)} km`, 'place');
    });
    if (!nearbyPlaces.length) {
      const empty = document.createElement('p');
      empty.className = 'places-message';
      empty.textContent = 'Belum ada tempat terpetakan dalam radius 2 km.';
      list.appendChild(empty);
    }
    $('readout').innerHTML = `Titik tengah: <b>${searchMid.lat.toFixed(5)}, ${searchMid.lon.toFixed(5)}</b><br>Ditemukan <b>${nearbyPlaces.length}</b> tempat terdekat.`;
  } catch (error) {
    if (!isCurrentRequest()) return;
    const message = document.createElement('p');
    message.className = 'places-message';
    message.textContent = `Pencarian tempat gagal: ${error.message}`;
    $('placesList').replaceChildren(message);
    $('readout').textContent = /sibuk|penuh|waktu tunggu/i.test(error.message)
      ? 'Server data tempat sedang sibuk atau penuh. Coba cari lagi sebentar.'
      : 'Pencarian tempat gagal. Coba lagi sebentar.';
  } finally {
    if (isCurrentRequest()) $('cafeBtn').disabled = false;
  }
}

const simulate = () => { people = PRESET.map(p => ({ ...p })); invalidatePoiSearch(); render(); calc(); };
$('simBtn').onclick = $('quickPreset').onclick = simulate;
$('calcBtn').onclick = calc;
$('cafeBtn').onclick = findNearbyPlaces;
render();
}

initializeApp().catch(error => {
  console.error('Aplikasi gagal diinisialisasi:', error);
  $('readout').textContent = 'Aplikasi gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.';
});
