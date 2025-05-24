// app.js with improved AR support, performance, and orientation permissions

// Pure Leaflet + CartoDB Positron minimal tiles
const map = L.map('map').setView([0, 0], 2);
L.tileLayer(
  'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
).addTo(map);

// Marker cluster group
// Consider experimenting with maxClusterRadius. Default is 80. 50 is more granular.
const markersCluster = L.markerClusterGroup({ maxClusterRadius: 60 }); // Adjusted slightly, experiment as needed
map.addLayer(markersCluster);

// Location marker
let locationMarker;
map.locate({ setView: true, maxZoom: 16 });
map.on('locationerror', () => {
  alert('Could not get your location. Please ensure location services are enabled.');
  // TODO: Add a visual indicator on the page for location error
});
map.on('locationfound', (e) => {
  if (locationMarker) map.removeLayer(locationMarker);
  locationMarker = L.circleMarker(e.latlng, { radius: 8, color: 'blue', fillOpacity: 0.7, stroke: false }).addTo(map);
  map.setView(e.latlng, 16); // Ensure view is centered and zoomed on new location
  fetchNearby(e.latlng.lat, e.latlng.lng, 1000); // Fetch for immediate vicinity
});

// Debounced bbox fetch and cache
let fetchTimeout;
const bboxCache = new Map();
map.on('moveend', () => {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(() => {
    const b = map.getBounds();
    const key = [
      b.getSouth().toFixed(3),
      b.getWest().toFixed(3),
      b.getNorth().toFixed(3),
      b.getEast().toFixed(3)
    ].join(',');
    if (bboxCache.has(key)) {
      renderMarkers(bboxCache.get(key));
    } else {
      // TODO: Show loading indicator
      fetchFountains(b, key);
    }
  }, 500);
});

// Overpass small radius fetch
async function fetchNearby(lat, lon, radius) {
  const query = `[out:json][timeout:15];node["amenity"="drinking_water"](around:${radius},${lat},${lon});out center;`;
  // TODO: Show loading indicator for nearby fetch if AR is not active or map needs it
  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if (!resp.ok) throw new Error(`Overpass API error: ${resp.status}`);
    const data = await resp.json();
    renderMarkers(data.elements); // This will also update window._fountains
  } catch (err) {
    console.error('Overpass radius error', err);
    // TODO: Hide loading indicator, show error message
  }
}

// Overpass bbox fetch
async function fetchFountains(bounds, key) {
  const query = `[out:json][timeout:25];(node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});way["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});relation["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}););out center;`;
  // TODO: Show loading indicator for bbox fetch
  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if (!resp.ok) throw new Error(`Overpass API error: ${resp.status}`);
    const data = await resp.json();
    bboxCache.set(key, data.elements);
    renderMarkers(data.elements);
  } catch (err) {
    console.error('Overpass bbox error', err);
    // TODO: Hide loading indicator, show error message
  } finally {
    // TODO: Hide loading indicator regardless of success/failure
  }
}

// Render markers and store for AR
function renderMarkers(elements) {
  markersCluster.clearLayers();
  window._fountains = elements || []; // Ensure _fountains is always an array
  (elements || []).forEach((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return;
    const name = el.tags?.name || 'Drinking water';
    const popupContent = `<strong>${name}</strong><br/><button class="nav-button" data-lat="${lat}" data-lon="${lon}">Navigate</button>`;
    markersCluster.addLayer(
      L.marker([lat, lon]).bindPopup(popupContent)
    );
  });
  // Add event listener for navigate buttons (event delegation)
  document.getElementById('map').addEventListener('click', function(event) {
    if (event.target && event.target.classList.contains('nav-button')) {
      const lat = event.target.getAttribute('data-lat');
      const lon = event.target.getAttribute('data-lon');
      navigate(lat, lon);
    }
  });
}

// Navigate handler
window.navigate = (lat, lon) => {
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform);
  // More standard Google Maps URL
  const url = isIOS
    ? `maps://maps.apple.com/?daddr=${lat},${lon}&dirflg=w` // Added walking directions flag
    : `https://www.google.com/maps?daddr=${lat},${lon}&dirflg=w`; // Added walking directions flag for Google Maps
  window.open(url, '_blank');
};

// AR functionality
const arBtn = document.getElementById('ar-button');
const arView = document.getElementById('ar-view');
const arVideo = document.getElementById('ar-video');
const arCanvas = document.getElementById('ar-overlay');
const arInfo = document.getElementById('ar-info');

let arStream, deviceOrientationWatcher, animationFrameId;
let currentHeading = 0;
// let currentPitch = 0; // For future use if more advanced vertical projection is added

const HFOV_DEGREES = 75; // Approximate horizontal field of view for AR
const MAX_AR_DISTANCE = 1000; // Max distance (meters) to show fountains in AR

arBtn.addEventListener('click', async () => {
  if (arView.style.display === 'none') {
    // Show AR view
    arCanvas.width = window.innerWidth;
    arCanvas.height = window.innerHeight;
    try {
      arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      arVideo.srcObject = arStream;
      await arVideo.play(); // Ensure video plays before starting AR logic

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permissionState = await DeviceOrientationEvent.requestPermission();
        if (permissionState !== 'granted') {
          throw new Error('Orientation permission not granted.');
        }
      }
      
      startAR();
      arView.style.display = 'block'; // Display AR view only after setup
      document.body.style.overflow = 'hidden'; // Prevent scrolling while AR is active
    } catch (e) {
      console.error('AR initialization error:', e);
      alert(`AR mode not available: ${e.message}. Ensure camera and motion sensor access is allowed.`);
      stopAR(); // Clean up
    }
  } else {
    // Exit AR view
    stopAR();
  }
});

function deviceOrientationHandler(event) {
  // Prefer `alpha` for compass heading, ensure it's absolute
  if (event.absolute === true || typeof event.webkitCompassHeading !== 'undefined') {
      currentHeading = event.alpha ?? event.webkitCompassHeading ?? 0;
      // currentPitch = event.beta ?? 0; // Store pitch if needed later
  } else {
    console.warn("Device orientation data is not absolute.");
    // Fallback or use non-absolute alpha if necessary, but it might be less reliable
    currentHeading = event.alpha ?? 0; 
  }
}

function startAR() {
  // Check if DeviceOrientationEvent is supported
  if (window.DeviceOrientationEvent) {
    deviceOrientationWatcher = deviceOrientationHandler;
    window.addEventListener('deviceorientationabsolute', deviceOrientationWatcher, true);
    // Fallback for some devices / browsers that don't support 'deviceorientationabsolute'
    if (typeof DeviceOrientationEvent.requestPermission !== 'function') { // Non-iOS 13+ or already granted
        window.addEventListener('deviceorientation', deviceOrientationWatcher, true);
    }
  } else {
    throw new Error('Device orientation not supported.');
  }
  
  // Start the rendering loop
  if (animationFrameId) cancelAnimationFrame(animationFrameId); // Clear previous loop if any
  arRenderLoop();
  arInfo.textContent = 'Point your camera around...';
}

function stopAR() {
  arView.style.display = 'none';
  document.body.style.overflow = ''; // Restore scrolling

  if (arStream) {
    arStream.getTracks().forEach(track => track.stop());
    arStream = null;
  }
  if (deviceOrientationWatcher) {
    window.removeEventListener('deviceorientationabsolute', deviceOrientationWatcher);
    window.removeEventListener('deviceorientation', deviceOrientationWatcher);
    deviceOrientationWatcher = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  const ctx = arCanvas.getContext('2d');
  ctx.clearRect(0, 0, arCanvas.width, arCanvas.height); // Clear canvas on exit
  arInfo.textContent = 'Finding nearest fountains...'; // Reset info text
}

function arRenderLoop() {
  drawAR(currentHeading);
  animationFrameId = requestAnimationFrame(arRenderLoop);
}

function drawAR(heading) {
  const ctx = arCanvas.getContext('2d');
  ctx.clearRect(0, 0, arCanvas.width, arCanvas.height);

  const fountains = window._fountains || [];
  if (!locationMarker) {
    arInfo.textContent = 'User location not available.';
    return;
  }
  const userPos = locationMarker.getLatLng();

  let arFountains = fountains
    .map(f => {
      const lat = f.lat ?? f.center?.lat;
      const lon = f.lon ?? f.center?.lon;
      if (lat == null || lon == null) return null;

      const fountainPos = L.latLng(lat, lon);
      const dist = userPos.distanceTo(fountainPos);
      if (dist > MAX_AR_DISTANCE) return null;

      // Calculate bearing from user to fountain (0-360 deg, North is 0)
      const y = Math.sin(L.Util.degToRad(lon - userPos.lng)) * Math.cos(L.Util.degToRad(lat));
      const x = Math.cos(L.Util.degToRad(userPos.lat)) * Math.sin(L.Util.degToRad(lat)) -
                Math.sin(L.Util.degToRad(userPos.lat)) * Math.cos(L.Util.degToRad(lat)) * Math.cos(L.Util.degToRad(lon - userPos.lng));
      let bearing = (L.Util.radToDeg(Math.atan2(y, x)) + 360) % 360;

      let relativeAngle = bearing - heading;
      while (relativeAngle <= -180) relativeAngle += 360;
      while (relativeAngle > 180) relativeAngle -= 360;
      
      return { name: f.tags?.name || 'Drinking water', dist, relativeAngle, id: f.id, lat, lon };
    })
    .filter(f => f !== null && Math.abs(f.relativeAngle) <= HFOV_DEGREES / 2)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  const canvasCenterX = arCanvas.width / 2;
  const canvasBottomY = arCanvas.height - 50; // Origin point for Y projection (near bottom)
  const projectionMaxY = arCanvas.height * 0.4; // Farthest items go up to this Y

  arFountains.forEach((f, i) => {
    const angleRad = f.relativeAngle * Math.PI / 180;

    // X position: based on relative angle, spread across the screen width
    const screenX = canvasCenterX + (f.relativeAngle / (HFOV_DEGREES / 2)) * (canvasCenterX * 0.9);

    // Y position: items further away appear higher (closer to horizon)
    // Inverse relationship with distance for Y.
    // yRatio is 1 for 0m distance, 0 for MAX_AR_DISTANCE
    const yRatio = Math.max(0, Math.min(1, 1 - (f.dist / MAX_AR_DISTANCE))); 
    const screenY = canvasBottomY - (yRatio * (canvasBottomY - projectionMaxY));


    // Draw an icon (circle)
    const iconRadius = 8 + (6 * yRatio); // Icon size based on proximity
    ctx.fillStyle = 'rgba(0, 123, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(screenX, screenY, iconRadius, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();


    // Draw distance text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${10 + (4 * yRatio)}px Arial`;
    ctx.textAlign = 'center';
    ctx.shadowColor = "black";
    ctx.shadowBlur = 3;
    ctx.fillText(`${Math.round(f.dist)}m`, screenX, screenY + iconRadius + 12 + (2*yRatio));
    ctx.shadowBlur = 0; // Reset shadow
  });

  if (arFountains.length > 0) {
    const nearestVisible = arFountains[0];
    arInfo.textContent = `${Math.round(nearestVisible.dist)}m to ${nearestVisible.name}.`;
  } else {
    // Check if any fountains are loaded but not in FOV
    const allLoadedFountains = (window._fountains || [])
        .map(f => {
            const lat = f.lat ?? f.center?.lat;
            const lon = f.lon ?? f.center?.lon;
            if (lat == null || lon == null) return null;
            return { dist: userPos.distanceTo(L.latLng(lat, lon)) };
        })
        .filter(f => f !== null)
        .sort((a,b) => a.dist - b.dist);
    
    if (allLoadedFountains.length > 0 && allLoadedFountains[0].dist <= MAX_AR_DISTANCE) {
        arInfo.textContent = `Nearest fountain ${Math.round(allLoadedFountains[0].dist)}m. Turn camera.`;
    } else if (allLoadedFountains.length > 0 && allLoadedFountains[0].dist > MAX_AR_DISTANCE) {
        arInfo.textContent = "No fountains within AR range. Move map or walk closer.";
    }
    else {
        arInfo.textContent = "No fountains loaded. Check map.";
    }
  }
}
