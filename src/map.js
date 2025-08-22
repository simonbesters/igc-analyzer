import leaflet from 'leaflet';
import leafletImage from 'leaflet-image';
import 'leaflet-providers';
import 'leaflet-easybutton';
import 'leaflet-ruler';
import 'leaflet-ruler/src/leaflet-ruler.css';
import * as ui from './ui';
import proj4 from 'proj4';


const L = leaflet;
const UTM_ZONE = "+proj=utm +zone=31 +ellps=WGS84 +datum=WGS84 +units=m +no_defs";
const INIT_COORDS = [51.55802, 4.93596];
// const GRID_ANCHOR_START = L.latLng(51.55802, 4.93596); // startveld
const GRID_ANCHOR_START = L.latLng(51.55166, 4.93284); // startveld doorgetrokken
const GRID_ANCHOR_LIER = L.latLng(51.56619, 4.94022); // lier
const CIRCUIT_MAX_OFFSET_M = 700; // > 700 m = rood


const DEFAULT_OPTIONS = {
    theme: 'CartoDB.DarkMatter',
    lineOptions: {
        color: '#0CB1E8',
        weight: 1,
        opacity: 0.5,
        smoothFactor: 1,
        overrideExisting: true,
        detectColors: true,
    },
    markerOptions: {
        color: '#00FF00',
        weight: 3,
        radius: 5,
        opacity: 0.5
    }
};

export default class GpxMap {
    constructor(options) {
        this.options = options || DEFAULT_OPTIONS;
        this.tracks = [];
        this.filters = {
            minDate: null,
            maxDate: null,
        };
        this.imageMarkers = [];

        this.map = L.map('background-map', {
            center: INIT_COORDS,
            zoom: 14,
            preferCanvas: true,
        });

        this.gridLayer = L.layerGroup().addTo(this.map);
        addGridRotated(this.map, GRID_ANCHOR_START, GRID_ANCHOR_LIER, 250, this.gridLayer);

// en als je ‘m na pan/zoom opnieuw wil tekenen:
        this.map.on('moveend zoomend', () => {
            addGridRotated(this.map, GRID_ANCHOR_START, GRID_ANCHOR_LIER, 250, this.gridLayer);
        });

        this.toLocalBaseline = makeBaselineTransform(GRID_ANCHOR_START, GRID_ANCHOR_LIER);

        L.control.scale({
            imperial: false,
            metric: true,
            maxWidth: 200,
            position: 'bottomleft'
        }).addTo(this.map);


        L.control.ruler({
            position: 'topleft',
            circleMarker: {
                color: 'red',
                radius: 2
            },
            lineStyle: {
                color: 'red',
                dashArray: '1,6'
            },
            lengthUnit: {
                display: 'meters',
                decimal: 0,
                factor: 1000,
                label: 'm'
            },
            angleUnit: {
                display: '&deg;',           // This is the display value will be shown on the screen. Example: 'Gradian'
                decimal: 0,                 // Bearing result will be fixed to this value.
                factor: null,                // This option is required to customize angle unit. Specify solid angle value for angle unit. Example: 400 (for gradian).
                label: 'Bearing:'
            }
        }).addTo(this.map);

        L.easyButton({
            type: 'animate',
            states: [{
                icon: 'fa-camera fa-lg',
                stateName: 'default',
                title: 'Export as png',
                onClick: () => {
                    let modal = ui.showModal('exportImage')
                        .afterClose(() => modal.destroy());

                    document.getElementById('render-export').onclick = (e) => {
                        e.preventDefault();

                        let output = document.getElementById('export-output');
                        output.innerHTML = 'Rendering <i class="fa fa-cog fa-spin"></i>';

                        let form = document.getElementById('export-settings').elements;
                        this.screenshot(form.format.value, output);
                    };
                }
            }]
        }).addTo(this.map);

        L.easyButton({
            type: 'animate',
            states: [{
                icon: 'fa-sliders fa-lg',
                stateName: 'default',
                title: 'Open settings dialog',
                onClick: () => {
                    ui.buildSettingsModal(this.tracks, this.options, (opts) => {
                        this.updateOptions(opts);
                        this.saveOptions(opts);
                    }).show();
                },
            }],
        }).addTo(this.map);

        L.easyButton({
            type: 'animate',
            states: [{
                icon: 'fa-filter fa-lg',
                stateName: 'default',
                title: 'Filter displayed tracks',
                onClick: () => {
                    ui.buildFilterModal(this.tracks, this.filters, (f) => {
                        this.filters = f;
                        this.applyFilters();
                    }).show();
                }
            }]
        }).addTo(this.map);


        L.easyButton('fa-th fa-lg', () => {
            if (this.map.hasLayer(this.gridLayer)) {
                this.map.removeLayer(this.gridLayer);
            } else {
                this.map.addLayer(this.gridLayer);
            }
        }, 'Toggle 250m grid').addTo(this.map);

        this.viewAll = L.easyButton({
            type: 'animate',
            states: [{
                icon: 'fa-map fa-lg',
                stateName: 'default',
                title: 'Zoom to all tracks',
                onClick: () => {
                    this.center();
                },
            }],
        }).addTo(this.map);

        this.markScrolled = () => {
            this.map.removeEventListener('movestart', this.markScrolled);
            this.scrolled = true;
        };

        this.clearScroll();
        this.viewAll.disable();
        this.switchTheme(this.options.theme);
        this.requestBrowserLocation();
    }

    clearScroll() {
        this.scrolled = false;
        this.map.addEventListener('movestart', this.markScrolled);
    }

    switchTheme(themeName) {
        if (this.mapTiles) {
            this.mapTiles.removeFrom(this.map);
        }

        if (themeName !== 'No map') {
            this.mapTiles = L.tileLayer.provider(themeName);
            this.mapTiles.addTo(this.map, {detectRetina: true});
        }
    }

    saveOptions(opts) {
        window.localStorage.setItem('options', JSON.stringify(opts));
    }

    restoreSavedOptions() {
        if (window.localStorage.getItem('options') === null) {
            return;
        }

        let opts = window.localStorage.getItem('options');
        opts = JSON.parse(opts);

        if (typeof opts === 'object') {
            this.updateOptions(opts);
        }
    }

    updateOptions(opts) {
        if (opts.theme !== this.options.theme) {
            this.switchTheme(opts.theme);
        }

        if (opts.lineOptions.overrideExisting) {
            this.tracks.forEach(({line}) => {
                line.setStyle({
                    color: opts.lineOptions.color,
                    weight: opts.lineOptions.weight,
                    opacity: opts.lineOptions.opacity,
                });

                line.redraw();
            });

            let markerOptions = opts.markerOptions;
            this.imageMarkers.forEach(i => {
                i.setStyle({
                    color: markerOptions.color,
                    weight: markerOptions.weight,
                    opacity: markerOptions.opacity,
                    radius: markerOptions.radius
                });

                i.redraw();
            });

        }

        this.options = opts;
    }

    applyFilters() {
        const dateBounds = {
            min: new Date(this.filters.minDate || '1900/01/01'),
            max: new Date(this.filters.maxDate || '2500/01/01'),
        };

        // NOTE: Tracks that don't have an associated timestamp will never be
        // excluded.
        const filters = [
            (t) => t.timestamp && dateBounds.min > t.timestamp,
            (t) => t.timestamp && dateBounds.max < t.timestamp,
        ];

        for (let track of this.tracks) {
            let hideTrack = filters.some(f => f(track));

            if (hideTrack && track.visible) {
                track.line.remove();
            } else if (!hideTrack && !track.visible) {
                track.line.addTo(this.map);
            }

            track.visible = !hideTrack;
        }
    }

    // Try to pull geo location from browser and center the map
    requestBrowserLocation() {
        navigator.geolocation.getCurrentPosition(pos => {
            if (!this.scrolled && this.tracks.length === 0) {
                this.map.panTo([pos.coords.latitude, pos.coords.longitude], {
                    noMoveStart: true,
                    animate: false,
                });
                this.clearScroll();
            }
        });
    }

    addTrack(track) {
        this.viewAll.enable();

        // start met defaults
        let lineOptions = Object.assign({}, this.options.lineOptions);

        // Check circuit-afwijking
        const maxOffset = maxLateralOffsetMeters(track.points, this.toLocalBaseline) ?? 0;
        const isBad = maxOffset > CIRCUIT_MAX_OFFSET_M;

        if (isBad) {
            lineOptions.color = '#ff3b3b';     // rood
            lineOptions.weight = Math.max(lineOptions.weight, 2);
        } else if (lineOptions.detectColors) {
            // Detecteer type gpx bestand
            if (/-(Hike|Walk)\.gpx/.test(track.filename)) {
                lineOptions.color = '#ffc0cb';
            } else if (/-Run\.gpx/.test(track.filename)) {
                lineOptions.color = '#ff0000';
            } else if (/-Ride\.gpx/.test(track.filename)) {
                lineOptions.color = '#00ffff';
            }
        }

// teken & log
        const line = L.polyline(track.points, lineOptions).addTo(this.map);

// popup met vluchtinfo
  const popupHtml = `
  <div style="font-family:sans-serif; font-size:13px;">
    <dl style="margin:0; display:grid; grid-template-columns:auto 1fr; gap:2px 8px;">
      <dt style="font-weight:bold;">#</dt><dd>${track.numFlight ?? '-'}</dd>
      <dt style="font-weight:bold;">Callsign</dt><dd>${track.callsign ?? '-'}</dd>
      <dt style="font-weight:bold;">Type</dt><dd>${track.gliderType ?? '-'}</dd>
      <dt style="font-weight:bold;">Registratie</dt><dd>${track.registration ?? '-'}</dd>
      <dt style="font-weight:bold;">Afstand tot het veld</dt><dd>${maxOffset.toFixed(0)} m</dd>
    </dl>
  </div>
`;
        line.bindPopup(popupHtml);

        line.on("popupopen", () => {
  // Alle andere tracks verbergen
  this.tracks.forEach(t => {
    if (t.line !== line) {
      this.map.removeLayer(t.line);
    }
  });
});

line.on("popupclose", () => {
  // Alles weer terug zichtbaar maken
  this.tracks.forEach(t => {
    if (!this.map.hasLayer(t.line)) {
      t.line.addTo(this.map);
    }
  });
});

        this.tracks.push(Object.assign({line, visible: true}, track));

        console.info(
            'track', track.filename,
            {
                maxOffsetMeters: maxOffset,
                baselineLen: this.baselineLenM
            }
        );
    }
    async markerClick(image) {
        const latitude = await image.latitude();
        const longitude = await image.longitude();
        const imageData = await image.getImageData();

        let latlng = L.latLng(latitude, longitude);

        L.popup({minWidth: 512})
            .setLatLng(latlng)
            .setContent(`<img src="${imageData}" width="512" height="100%">`)
            .addTo(this.map);
    }

    async addImage(image) {
        const lat = await image.latitude();
        const lng = await image.longitude();

        let latlng = L.latLng(lat, lng);
        let markerOptions = Object.assign({}, this.options.markerOptions);

        let marker = L.circleMarker(latlng, markerOptions)
            .on('click', () => {
                this.markerClick(image);
            })
            .addTo(this.map);

        this.imageMarkers.push(marker);
    }

    // Center the map if the user has not yet manually panned the map
    recenter() {
        if (!this.scrolled) {
            this.center();
        }
    }

    center() {
        // If there are no tracks, then don't try to get the bounds, as there
        // would be an error
        if (this.tracks.length === 0 && this.imageMarkers.length === 0) {
            return;
        }

        let tracksAndImages = this.tracks.map(t => t.line)
            .concat(this.imageMarkers);

        this.map.fitBounds((new L.featureGroup(tracksAndImages)).getBounds(), {
            noMoveStart: true,
            animate: false,
            padding: [50, 20],
        });

        if (!this.scrolled) {
            this.clearScroll();
        }
    }

    screenshot(format, domNode) {
        leafletImage(this.map, (err, canvas) => {
            if (err) {
                return window.alert(err);
            }

            let link = document.createElement('a');

            if (format === 'png') {
                link.download = 'igc-analyzer-export.png';
                link.innerText = 'Download as PNG';

                canvas.toBlob(blob => {
                    link.href = URL.createObjectURL(blob);
                    domNode.innerText = '';
                    domNode.appendChild(link);
                });
            } else if (format === 'svg') {
                link.innerText = 'Download as SVG';

                const scale = 2;
                const bounds = this.map.getPixelBounds();
                bounds.min = bounds.min.multiplyBy(scale);
                bounds.max = bounds.max.multiplyBy(scale);
                const left = bounds.min.x;
                const top = bounds.min.y;
                const width = bounds.getSize().x;
                const height = bounds.getSize().y;

                let svg = L.SVG.create('svg');
                let root = L.SVG.create('g');

                svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);

                this.tracks.forEach(track => {
                    // Project each point from LatLng, scale it up, round to
                    // nearest 1/10 (by multiplying by 10, rounding and
                    // dividing), and reducing by removing duplicates (when two
                    // consecutive points have rounded to the same value)
                    let pts = track.points.map(ll =>
                        this.map.project(ll)
                            .multiplyBy(scale * 10)
                            .round()
                            .divideBy(10)
                    ).reduce((acc, next) => {
                        if (acc.length === 0 ||
                            acc[acc.length - 1].x !== next.x ||
                            acc[acc.length - 1].y !== next.y) {
                            acc.push(next);
                        }
                        return acc;
                    }, []);

                    // If none of the points on the track are on the screen,
                    // don't export the track
                    if (!pts.some(pt => bounds.contains(pt))) {
                        return;
                    }
                    let path = L.SVG.pointsToPath([pts], false);
                    let el = L.SVG.create('path');

                    el.setAttribute('stroke', track.line.options.color);
                    el.setAttribute('stroke-opacity', track.line.options.opacity);
                    el.setAttribute('stroke-width', scale * track.line.options.weight);
                    el.setAttribute('stroke-linecap', 'round');
                    el.setAttribute('stroke-linejoin', 'round');
                    el.setAttribute('fill', 'none');

                    el.setAttribute('d', path);

                    root.appendChild(el);
                });

                svg.appendChild(root);

                let xml = (new XMLSerializer()).serializeToString(svg);
                link.download = 'igc-analyzer-export.svg';

                let blob = new Blob([xml], {type: 'application/octet-stream'});
                link.href = URL.createObjectURL(blob);

                domNode.innerText = '';
                domNode.appendChild(link);
            }
        });
    }
}

export function addGridRotated(map, startLatLng, lierLatLng, spacing = 250, layer) {
    const crs = L.CRS.EPSG3857;
    const g = layer || L.layerGroup().addTo(map);
    g.clearLayers();

    const A = crs.project(L.latLng(startLatLng));
    const B = crs.project(L.latLng(lierLatLng));

    const latMid = (startLatLng.lat + lierLatLng.lat) / 2;
    const k = 1 / Math.cos(latMid * Math.PI / 180);
    const step = spacing * k;
    const pad = step * 1.5;

    const dx = B.x - A.x, dy = B.y - A.y;
    const theta = Math.atan2(dy, dx), cosT = Math.cos(theta), sinT = Math.sin(theta);

    const toLocal = (P) => {
        const rx = P.x - A.x, ry = P.y - A.y;
        return {x: cosT * rx + sinT * ry, y: -sinT * rx + cosT * ry};
    };
    const toWorld = (Lxy) => ({
        x: A.x + (cosT * Lxy.x - sinT * Lxy.y),
        y: A.y + (sinT * Lxy.x + cosT * Lxy.y),
    });

    const b = map.getBounds();
    const nw = crs.project(b.getNorthWest());
    const se = crs.project(b.getSouthEast());
    const worldMin = {x: Math.min(nw.x, se.x) - pad, y: Math.min(nw.y, se.y) - pad};
    const worldMax = {x: Math.max(nw.x, se.x) + pad, y: Math.max(nw.y, se.y) + pad};

    const Lmin = toLocal(worldMin), Lmax = toLocal(worldMax);
    const minX = Math.min(Lmin.x, Lmax.x), maxX = Math.max(Lmin.x, Lmax.x);
    const minY = Math.min(Lmin.y, Lmax.y), maxY = Math.max(Lmin.y, Lmax.y);

    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    const style = {color: '#ffffff', opacity: 0.25, weight: 1, interactive: false};

    for (let x = startX; x <= endX; x += step) {
        const W1 = toWorld({x, y: startY}), W2 = toWorld({x, y: endY});
        L.polyline([crs.unproject(W1), crs.unproject(W2)], style).addTo(g);
    }
    for (let y = startY; y <= endY; y += step) {
        const W1 = toWorld({x: startX, y}), W2 = toWorld({x: endX, y});
        L.polyline([crs.unproject(W1), crs.unproject(W2)], style).addTo(g);
    }

    L.polyline([startLatLng, lierLatLng], {
        color: '#ffcc00',
        weight: 2,
        opacity: 0.9,
        dashArray: '6 4',
        interactive: false
    })
        .addTo(g);
}

// ===== Helpers op UTM/proj4-basis =====
export function makeBaselineTransform(startLatLng, endLatLng) {
    const startUTM = proj4(UTM_ZONE, [startLatLng.lng, startLatLng.lat]);
    const endUTM = proj4(UTM_ZONE, [endLatLng.lng, endLatLng.lat]);

    const dx = endUTM[0] - startUTM[0];
    const dy = endUTM[1] - startUTM[1];
    const len = Math.hypot(dx, dy);

    const ux = dx / len, uy = dy / len;   // langs baseline
    const vx = -uy, vy = ux;         // dwars op baseline

    return function (latlng) {
        const p = proj4(UTM_ZONE, [latlng.lng, latlng.lat]);
        const relx = p[0] - startUTM[0];
        const rely = p[1] - startUTM[1];
        const x = relx * ux + rely * uy;     // langs
        const y = relx * vx + rely * vy;     // dwars (meters)
        return [x, y];
    };
}

export function maxLateralOffsetMeters(points, toLocalBaseline) {
  if (!points || points.length === 0) return 0;   // safeguard
  let maxOffset = 0;
  for (const pt of points) {
    const [ , y] = toLocalBaseline(L.latLng(pt));
    if (Math.abs(y) > maxOffset) maxOffset = Math.abs(y);
  }
  return maxOffset;
}