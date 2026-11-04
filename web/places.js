const TYPES = {
  cafe: 'Cafe',
  restaurant: 'Restoran',
  fast_food: 'Makanan cepat saji',
  bar: 'Bar',
  pub: 'Pub',
  ice_cream: 'Kedai es krim',
  food_court: 'Food court',
  cinema: 'Bioskop',
  movie_theater: 'Bioskop',
  theatre: 'Teater',
  nightclub: 'Tempat hiburan malam',
  night_club: 'Tempat hiburan malam',
  arts_centre: 'Pusat seni',
  community_centre: 'Pusat komunitas',
  library: 'Perpustakaan',
  park: 'Taman',
  garden: 'Kebun',
  playground: 'Taman bermain',
  nature_reserve: 'Cagar alam',
  sports_centre: 'Pusat olahraga',
  tourist_attraction: 'Tempat wisata',
  attraction: 'Tempat wisata',
  viewpoint: 'Titik pemandangan',
  museum: 'Museum',
  picnic_site: 'Area piknik',
  gallery: 'Galeri',
  zoo: 'Kebun binatang',
  aquarium: 'Akuarium',
  shopping_mall: 'Pusat perbelanjaan',
  mall: 'Pusat perbelanjaan',
  department_store: 'Toko serba ada',
  amusement_park: 'Taman hiburan',
  theme_park: 'Taman hiburan',
  stadium: 'Stadion',
  water_park: 'Taman air',
  monument: 'Monumen',
  memorial: 'Tugu peringatan',
  archaeological_site: 'Situs arkeologi',
  bakery: 'Toko roti',
  ice_cream_shop: 'Kedai es krim'
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

export async function findPlaces(center, isCurrentRequest) {
  const query = `[out:json][timeout:12];(
    nwr(around:2000,${center.lat},${center.lon})["name"]["amenity"~"^(cafe|restaurant|fast_food|bar|pub|ice_cream|food_court|cinema|theatre|nightclub|arts_centre|community_centre|library|marketplace)$"];
    nwr(around:2000,${center.lat},${center.lon})["name"]["leisure"~"^(park|garden|playground|nature_reserve|sports_centre|stadium|water_park)$"];
    nwr(around:2000,${center.lat},${center.lon})["name"]["tourism"~"^(attraction|viewpoint|museum|picnic_site|gallery|zoo|aquarium|theme_park)$"];
    nwr(around:2000,${center.lat},${center.lon})["name"]["shop"~"^(mall|department_store)$"];
    nwr(around:2000,${center.lat},${center.lon})["name"]["historic"~"^(castle|monument|memorial|archaeological_site)$"];
  );out center 120;`;
  const controllers = ENDPOINTS.map(() => typeof AbortController === 'function' ? new AbortController() : null);
  const errors = [];
  let failures = 0;
  const elements = await new Promise((resolve, reject) => {
    ENDPOINTS.forEach(async (endpoint, index) => {
      const controller = controllers[index];
      let timeout;
      try {
        const request = fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ data: query }),
          ...(controller ? { signal: controller.signal } : {})
        });
        const response = await Promise.race([
          request,
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              if (controller) controller.abort();
              reject(new Error('waktu tunggu habis'));
            }, 12000);
          })
        ]);
        if (!response.ok) {
          const detail = response.status === 502 || response.status === 504
            ? 'server sedang penuh'
            : `HTTP ${response.status}`;
          throw new Error(`Overpass ${detail}`);
        }
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error('Respons Overpass tidak valid');
        if (!isCurrentRequest()) {
          controllers.forEach(item => item?.abort());
          resolve(null);
          return;
        }
        controllers.forEach((item, itemIndex) => {
          if (itemIndex !== index) item?.abort();
        });
        resolve(data.elements);
      } catch (error) {
        errors[index] = `${new URL(endpoint).hostname}: ${error.name === 'AbortError' ? 'waktu tunggu habis' : error.message}`;
        failures++;
        if (failures === ENDPOINTS.length) {
          const details = errors.join('; ');
          const isBusy = errors.some(message => /server sedang penuh|waktu tunggu habis/i.test(message));
          reject(new Error(isBusy
            ? `Server pencarian OpenStreetMap sedang sibuk atau penuh. Coba lagi sebentar. (${details})`
            : `Server pencarian OpenStreetMap tidak merespons. (${details || 'Koneksi gagal'})`));
        }
      } finally {
        clearTimeout(timeout);
      }
    });
  });
  if (!elements || !isCurrentRequest()) return null;

  const seen = new Set();
  return elements.flatMap(place => {
    const lat = place.lat ?? place.center?.lat;
    const lon = place.lon ?? place.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const tags = place.tags || {};
    const name = tags.name?.trim();
    if (!name) return [];
    const latRad = center.lat * Math.PI / 180;
    const dLat = (lat - center.lat) * Math.PI / 180;
    const dLon = (lon - center.lon) * Math.PI / 180;
    const haversine = Math.sin(dLat / 2) ** 2
      + Math.cos(latRad) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    if (distance > 2000) return [];
    const key = `${name.toLocaleLowerCase()}|${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const type = tags.amenity || tags.leisure || tags.tourism || tags.shop
      || tags.historic || tags.sport || tags.healthcare;
    return [{
      lat,
      lon,
      name,
      label: TYPES[type] || 'Tempat menarik',
      rating: tags.stars && Number.isFinite(Number(tags.stars)) ? Number(tags.stars) : undefined,
      address: tags['addr:full'] || [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', '),
      distance
    }];
  });
}
