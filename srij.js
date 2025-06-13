// Move all JavaScript from the <script> tag in HTML to this file
// Initialize the map
var map = L.map('map').setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);
// Placeholder for disaster data overlays
// ...
// Placeholder for Chart.js charts
var historyChart = new Chart(document.getElementById('historyChart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Occurrences', data: [] }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
});
var severityChart = new Chart(document.getElementById('severityChart'), {
    type: 'pie',
    data: { labels: ['Low', 'Moderate', 'High'], datasets: [{ data: [0,0,0], backgroundColor: ['#4caf50','#ffeb3b','#f44336'] }] },
    options: { responsive: true }
});
// Placeholder for filter and report logic
// Fetch and display real-time earthquake data from USGS
// Helper: filter earthquakes by region and time
function filterEarthquakes(features, region, timePeriod) {
    const now = Date.now();
    let minTime = now;
    if (timePeriod === '1y') minTime -= 365 * 24 * 60 * 60 * 1000;
    else if (timePeriod === '5y') minTime -= 5 * 365 * 24 * 60 * 60 * 1000;
    else if (timePeriod === '10y') minTime -= 10 * 365 * 24 * 60 * 60 * 1000;
    return features.filter(f => {
        const matchRegion = region ? (f.properties.place && f.properties.place.toLowerCase().includes(region.toLowerCase())) : true;
        const matchTime = f.properties.time >= minTime;
        return matchRegion && matchTime;
    });
}

// Store last fetched data for filtering
let lastEarthquakeData = null;

// Helper: get date string for USGS API
function getDateYearsAgo(years) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().split('T')[0];
}

// Helper: get bounding box for region (country)
function getRegionBoundingBox(region, callback) {
    if (!region) {
        callback(null);
        return;
    }
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(region)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                const bbox = data[0].boundingbox;
                callback({
                    minLat: bbox[0],
                    maxLat: bbox[1],
                    minLon: bbox[2],
                    maxLon: bbox[3]
                });
            } else {
                callback(null);
            }
        })
        .catch(() => callback(null));
}

// Helper: get selected disaster types from the multi-select
function getSelectedDisasterTypes() {
    const select = document.getElementById('disasterType');
    const selected = Array.from(select.selectedOptions).map(opt => opt.value);
    if (selected.includes('all')) {
        // If 'all' is selected, return all types except 'all'
        return Array.from(select.options)
            .map(opt => opt.value)
            .filter(v => v !== 'all');
    }
    return selected;
}

// Fetch earthquakes for region and time period using USGS API
function fetchEarthquakeData(region = '', timePeriod = '1y', minMag, maxMag, minDepth, maxDepth, disasterTypes) {
    // Only fetch earthquakes for now, but filter by disasterTypes
    let startTime = '1970-01-01';
    if (timePeriod === '1y') startTime = getDateYearsAgo(1);
    else if (timePeriod === '5y') startTime = getDateYearsAgo(5);
    else if (timePeriod === '10y') startTime = getDateYearsAgo(10);
    const endTime = new Date().toISOString().split('T')[0];
    // Build query params
    let params = `format=geojson&starttime=${startTime}&endtime=${endTime}`;
    if (minMag) params += `&minmagnitude=${minMag}`;
    if (maxMag) params += `&maxmagnitude=${maxMag}`;
    if (minDepth) params += `&mindepth=${minDepth}`;
    if (maxDepth) params += `&maxdepth=${maxDepth}`;
    params += '&limit=20000';
    if (region) {
        getRegionBoundingBox(region, function(bbox) {
            let url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
            if (bbox) {
                url += `&minlatitude=${bbox.minLat}&maxlatitude=${bbox.maxLat}&minlongitude=${bbox.minLon}&maxlongitude=${bbox.maxLon}`;
            }
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    lastEarthquakeData = data;
                    updateEarthquakeDisplay(region, timePeriod, minMag, maxMag, minDepth, maxDepth, disasterTypes);
                });
        });
    } else {
        // No region: global
        let url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
        fetch(url)
            .then(response => response.json())
            .then(data => {
                lastEarthquakeData = data;
                updateEarthquakeDisplay(region, timePeriod, minMag, maxMag, minDepth, maxDepth, disasterTypes);
            });
    }
}

// Helper: get marker radius based on zoom and magnitude
function getMarkerRadius(mag, zoom) {
    // Smaller radius when zoomed out, larger when zoomed in
    if (zoom < 3) return Math.max(2, mag);
    if (zoom < 6) return Math.max(3, mag * 1.5);
    return Math.max(4, mag * 2);
}

// Update display to use new filters
function updateEarthquakeDisplay(region, timePeriod, minMag, maxMag, minDepth, maxDepth, disasterTypes) {
    if (!lastEarthquakeData) return;
    if (window.earthquakeMarkers) {
        window.earthquakeMarkers.forEach(marker => map.removeLayer(marker));
    }
    window.earthquakeMarkers = [];
    // Only show earthquakes if 'earthquake' is selected
    if (!disasterTypes || disasterTypes.includes('earthquake')) {
        const filtered = lastEarthquakeData.features.filter(f => {
            const m = f.properties.mag;
            const d = f.geometry.coordinates[2];
            let pass = true;
            if (minMag && m < minMag) pass = false;
            if (maxMag && m > maxMag) pass = false;
            if (minDepth && d < minDepth) pass = false;
            if (maxDepth && d > maxDepth) pass = false;
            if (region) {
                pass = pass && (f.properties.place && f.properties.place.toLowerCase().includes(region.toLowerCase()));
            }
            return pass;
        });
        const zoom = map.getZoom();
        filtered.forEach(feature => {
            const coords = feature.geometry.coordinates;
            const mag = feature.properties.mag;
            const place = feature.properties.place;
            const time = new Date(feature.properties.time).toLocaleString();
            // Use correct color for earthquake
            const marker = L.circleMarker([coords[1], coords[0]], {
                radius: getMarkerRadius(mag, zoom),
                color: getDisasterColor('earthquake'),
                fillOpacity: 0.7
            }).addTo(map);
            marker.bindPopup(`<b>Magnitude:</b> ${mag}<br><b>Location:</b> ${place}<br><b>Depth:</b> ${coords[2]} km<br><b>Time:</b> ${time}`);
            window.earthquakeMarkers.push(marker);
        });
    }
    // Update chart with earthquake occurrences by magnitude
    const magBuckets = { 'Low': 0, 'Moderate': 0, 'High': 0 };
    filtered.forEach(f => {
        const m = f.properties.mag;
        if (m < 3) magBuckets['Low']++;
        else if (m < 5) magBuckets['Moderate']++;
        else magBuckets['High']++;
    });
    severityChart.data.datasets[0].data = [magBuckets['Low'], magBuckets['Moderate'], magBuckets['High']];
    severityChart.update();
    // Update history chart (number of earthquakes per day)
    const days = Array(31).fill(0);
    filtered.forEach(f => {
        const date = new Date(f.properties.time);
        days[date.getDate() - 1]++;
    });
    historyChart.data.labels = days.map((_, i) => `Day ${i + 1}`);
    historyChart.data.datasets[0].data = days;
    historyChart.update();
    // Update risk tips
    document.getElementById('tipsList').innerHTML = `
        <li>Drop, Cover, and Hold On during an earthquake.</li>
        <li>Secure heavy items in your home.</li>
        <li>Prepare an emergency kit and evacuation plan.</li>
    `;
}

// Geocode region and zoom map
function geocodeRegion(region, callback) {
    if (!region) {
        callback();
        return;
    }
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(region)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                const bbox = data[0].boundingbox;
                const southWest = L.latLng(bbox[0], bbox[2]);
                const northEast = L.latLng(bbox[1], bbox[3]);
                const bounds = L.latLngBounds(southWest, northEast);
                map.fitBounds(bounds);
            }
            callback();
        })
        .catch(() => callback());
}

// Filter button event
const applyBtn = document.getElementById('applyFilters');
applyBtn.addEventListener('click', function() {
    const region = document.getElementById('region').value;
    const timePeriod = document.getElementById('timePeriod').value;
    const minMag = parseFloat(document.getElementById('minMag').value) || undefined;
    const maxMag = parseFloat(document.getElementById('maxMag').value) || undefined;
    const minDepth = parseFloat(document.getElementById('minDepth').value) || undefined;
    const maxDepth = parseFloat(document.getElementById('maxDepth').value) || undefined;
    const disasterTypes = getSelectedDisasterTypes();
    geocodeRegion(region, function() {
        updateAllDisasters(region, timePeriod, minMag, maxMag, minDepth, maxDepth, disasterTypes);
    });
});

// Move heavy data processing to a Web Worker for UI responsiveness
// Create a worker if supported
let csvWorker;
if (window.Worker) {
    csvWorker = new Worker('worker-csv.js');
}

function generateCSVInWorker(data) {
    return new Promise((resolve, reject) => {
        if (!csvWorker) {
            // fallback to main thread if no worker
            resolve(generateCSV(data));
            return;
        }
        csvWorker.onmessage = function(e) {
            resolve(e.data);
        };
        csvWorker.onerror = function(e) {
            reject(e);
        };
        csvWorker.postMessage(data);
    });
}

// Download report as CSV
function downloadReport(region, timePeriod, minMag, maxMag, minDepth, maxDepth) {
    if (!lastEarthquakeData) return;
    const filtered = lastEarthquakeData.features.filter(f => {
        const m = f.properties.mag;
        const d = f.geometry.coordinates[2];
        let pass = true;
        if (minMag && m < minMag) pass = false;
        if (maxMag && m > maxMag) pass = false;
        if (minDepth && d < minDepth) pass = false;
        if (maxDepth && d > maxDepth) pass = false;
        if (region) {
            pass = pass && (f.properties.place && f.properties.place.toLowerCase().includes(region.toLowerCase()));
        }
        return pass;
    });
    let csv = 'Magnitude,Location,Depth (km),Time\n';
    filtered.forEach(f => {
        const mag = f.properties.mag;
        const place = f.properties.place.replace(/,/g, '');
        const depth = f.geometry.coordinates[2];
        const time = new Date(f.properties.time).toLocaleString();
        csv += `${mag},${place},${depth},${time}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earthquake_report_${region || 'all'}_${timePeriod}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Download button event
const downloadBtn = document.getElementById('downloadReport');
downloadBtn.addEventListener('click', async function() {
    const region = document.getElementById('region').value;
    const timePeriod = document.getElementById('timePeriod').value;
    const minMag = parseFloat(document.getElementById('minMag').value) || undefined;
    const maxMag = parseFloat(document.getElementById('maxMag').value) || undefined;
    const minDepth = parseFloat(document.getElementById('minDepth').value) || undefined;
    const maxDepth = parseFloat(document.getElementById('maxDepth').value) || undefined;
    // const csv = await generateCSVInWorker(filteredData);
    downloadReport(region, timePeriod, minMag, maxMag, minDepth, maxDepth);
});

// Disaster type color mapping
const disasterColors = {
    earthquake: '#f44336',
    flood: '#2196f3',
    storm: '#ffeb3b',
    tsunami: '#00bcd4',
    volcano: '#9c27b0',
    landslide: '#795548',
    wildfire: '#ff9800',
    drought: '#ffb300',
    avalanche: '#90caf9',
    cyclone: '#00acc1',
    hurricane: '#388e3c',
    tornado: '#607d8b',
    blizzard: '#b3e5fc',
    hail: '#bdbdbd',
    heatwave: '#e65100',
    coldwave: '#1976d2'
};

// Add a legend chart for disaster colors
function renderDisasterLegend() {
    const ctx = document.getElementById('disasterLegendChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(disasterColors).map(d => d.charAt(0).toUpperCase() + d.slice(1)),
            datasets: [{
                data: Object.keys(disasterColors).map(() => 1),
                backgroundColor: Object.values(disasterColors)
            }]
        },
        options: {
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: { color: '#222', font: { size: 12 } }
                }
            },
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Add a legend chart container to the DOM
const legendDiv = document.createElement('div');
legendDiv.className = 'chart-container';
legendDiv.style.maxWidth = '350px';
legendDiv.innerHTML = '<canvas id="disasterLegendChart" height="200"></canvas>';
document.querySelector('.charts').appendChild(legendDiv);
renderDisasterLegend();

// Update marker color logic to use disasterColors
function getDisasterColor(type) {
    return disasterColors[type] || '#222';
}

// --- OPTIMIZED & FIXED EONET INTEGRATION ---
// Caching EONET events to avoid repeated API calls
const eonetCache = {};

async function fetchEONETEvents(selectedTypes) {
    const eonetTypeMap = {
        flood: 'floods',
        wildfire: 'wildfires',
        storm: 'severeStorms',
        volcano: 'volcanoes',
        landslide: 'landslides',
        drought: 'drought',
        avalanche: 'snow',
        cyclone: 'severeStorms',
        hurricane: 'severeStorms',
        tornado: 'severeStorms',
        blizzard: 'snow',
        hail: 'severeStorms',
        heatwave: 'drought',
        coldwave: 'snow',
        tsunami: 'tsunamis'
    };
    const eonetCategories = Array.from(new Set(selectedTypes
        .map(type => eonetTypeMap[type])
        .filter(Boolean)));
    let allEvents = [];
    for (const cat of eonetCategories) {
        if (eonetCache[cat]) {
            allEvents = allEvents.concat(eonetCache[cat]);
            continue;
        }
        const url = `https://eonet.gsfc.nasa.gov/api/v3/events?category=${cat}&status=open`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            eonetCache[cat] = data.events || [];
            allEvents = allEvents.concat(eonetCache[cat]);
        } catch (e) { /* ignore errors for now */ }
    }
    return allEvents;
}

function clearEonetMarkers() {
    if (window.eonetMarkers) window.eonetMarkers.forEach(marker => map.removeLayer(marker));
    window.eonetMarkers = [];
}

function showEONETEventsOnMap(events, selectedTypes) {
    clearEonetMarkers();
    if (!window.eonetMarkers) window.eonetMarkers = [];
    const zoom = map.getZoom();
    events.forEach(event => {
        // Find the type for color
        let type = 'other';
        for (const t of selectedTypes) {
            if (event.categories.some(cat => cat.title.toLowerCase().includes(t))) {
                type = t;
                break;
            }
        }
        // Use first geometry (most recent)
        const geom = event.geometry && event.geometry[0];
        if (geom && geom.coordinates) {
            let coords = geom.coordinates;
            if (Array.isArray(coords[0])) coords = coords[0]; // handle polygons
            if (!coords[1] || !coords[0]) return; // skip invalid
            const marker = L.circleMarker([coords[1], coords[0]], {
                radius: getMarkerRadius(4, zoom),
                color: getDisasterColor(type),
                fillOpacity: 0.7
            }).addTo(map);
            marker.bindPopup(`<b>${event.title}</b><br><b>Type:</b> ${type.charAt(0).toUpperCase() + type.slice(1)}<br><b>Date:</b> ${geom.date ? new Date(geom.date).toLocaleString() : ''}`);
            window.eonetMarkers.push(marker);
        }
    });
}

// Debounce filter application to avoid lag
let filterTimeout;
function debouncedApplyFilters() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        document.getElementById('applyFilters').click();
    }, 250);
}

disasterTypeSelect.addEventListener('change', debouncedApplyFilters);
map.on('zoomend', function() {
    // Update marker sizes for both earthquake and EONET markers
    const zoom = map.getZoom();
    if (window.earthquakeMarkers) {
        window.earthquakeMarkers.forEach(marker => {
            const mag = marker.options.radius / 2;
            marker.setRadius(getMarkerRadius(mag, zoom));
        });
    }
    if (window.eonetMarkers) {
        window.eonetMarkers.forEach(marker => {
            marker.setRadius(getMarkerRadius(4, zoom));
        });
    }
});

// Register a service worker for offline support and asset caching
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js');
    });
}

// Main update function
async function updateAllDisasters(region, timePeriod, minMag, maxMag, minDepth, maxDepth, disasterTypes) {
    if (window.earthquakeMarkers) window.earthquakeMarkers.forEach(m => map.removeLayer(m));
    clearEonetMarkers();
    window.earthquakeMarkers = [];
    // Earthquakes (USGS)
    if (disasterTypes.includes('earthquake')) {
        fetchEarthquakeData(region, timePeriod, minMag, maxMag, minDepth, maxDepth, ['earthquake']);
    }
    // EONET disasters
    const eonetTypes = disasterTypes.filter(t => t !== 'earthquake');
    if (eonetTypes.length > 0) {
        const events = await fetchEONETEvents(eonetTypes);
        showEONETEventsOnMap(events, eonetTypes);
    }
}

// Optimize initial load and interval
let lastDisasterTypes = getSelectedDisasterTypes();
let lastRegion = '';
let lastTimePeriod = '1y';
let lastMinMag, lastMaxMag, lastMinDepth, lastMaxDepth;

async function optimizedUpdate() {
    const region = document.getElementById('region').value;
    const timePeriod = document.getElementById('timePeriod').value;
    const minMag = parseFloat(document.getElementById('minMag').value) || undefined;
    const maxMag = parseFloat(document.getElementById('maxMag').value) || undefined;
    const minDepth = parseFloat(document.getElementById('minDepth').value) || undefined;
    const maxDepth = parseFloat(document.getElementById('maxDepth').value) || undefined;
    const disasterTypes = getSelectedDisasterTypes();
    // Only update if something changed
    if (
        region !== lastRegion ||
        timePeriod !== lastTimePeriod ||
        minMag !== lastMinMag ||
        maxMag !== lastMaxMag ||
        minDepth !== lastMinDepth ||
        maxDepth !== lastMaxDepth ||
        JSON.stringify(disasterTypes) !== JSON.stringify(lastDisasterTypes)
    ) {
        lastRegion = region;
        lastTimePeriod = timePeriod;
        lastMinMag = minMag;
        lastMaxMag = maxMag;
        lastMinDepth = minDepth;
        lastMaxDepth = maxDepth;
        lastDisasterTypes = disasterTypes;
        await updateAllDisasters(region, timePeriod, minMag, maxMag, minDepth, maxDepth, disasterTypes);
    }
}

// Use debounced optimized update for all filter changes
['region', 'timePeriod', 'minMag', 'maxMag', 'minDepth', 'maxDepth'].forEach(id => {
    document.getElementById(id).addEventListener('input', debouncedApplyFilters);
});

applyBtn.addEventListener('click', optimizedUpdate);

// Initial load
optimizedUpdate();
setInterval(optimizedUpdate, 60000);

// Update marker size on zoom
map.on('zoomend', function() {
    const zoom = map.getZoom();
    if (window.earthquakeMarkers) {
        window.earthquakeMarkers.forEach(marker => {
            // Use the stored magnitude for each marker
            const mag = marker.options.radius / 2; // Approximate original mag
            marker.setRadius(getMarkerRadius(mag, zoom));
        });
    }
});
