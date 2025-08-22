import Pako from 'pako';
import IGCParser from 'igc-parser';

function extractIGCTracks(igc) {
  const points = [];
  let timestamp = null;

  for (const fix of igc.fixes) {
    points.push({
      lat: fix.latitude,
      lng: fix.longitude,
      // optionally: gpsAltitude: fix.gpsAltitude,
    });
    timestamp = timestamp || new Date(fix.timestamp);
  }

  return points.length > 0 ? [{
    timestamp,
    points,
    name: 'igc',
    pilot: igc.pilot || null,
    callsign: igc.callsign || null,
    gliderType: igc.gliderType || null,
    registration: igc.registration || null,
    numFlight: igc.numFlight || null,
    date: igc.date || null
  }] : [];
}

function readFile(file, isGzipped) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      try {
        resolve(isGzipped ? Pako.inflate(result, { to: 'string' }) : result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}

export default function extractTracks(file) {
  const isGzipped = /\.gz$/i.test(file.name);
  const format = file.name.replace(/\.gz$/i, '').split('.').pop().toLowerCase();

  if (format !== 'igc') {
    throw new Error(`Unsupported file format: ${format}`);
  }

  return readFile(file, isGzipped).then(textContents => {
    try {
      return extractIGCTracks(IGCParser.parse(textContents, { lenient: true }));
    } catch (err) {
      return Promise.reject(err);
    }
  });
}