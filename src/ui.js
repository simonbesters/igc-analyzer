import picoModal from 'picomodal';
import extractTracks from './track';
import Image from './image';

const AVAILABLE_THEMES = [
    'CartoDB.DarkMatter',
    'CartoDB.DarkMatterNoLabels',
    'CartoDB.Positron',
    'CartoDB.PositronNoLabels',
    'Esri.WorldImagery',
    'OpenStreetMap.Mapnik',
    'OpenTopoMap',
    'Stamen.Terrain',
    'Stamen.TerrainBackground',
    'Stamen.Toner',
    'Stamen.TonerLite',
    'Stamen.TonerBackground',
    'Stamen.Watercolor',
    'CyclOSM',
    'No map',
];

const MODAL_CONTENT = {
    exportImage: `
<h3>Export Image</h3>

<form id="export-settings">
    <div class="form-row">
        <label>Format:</label>
        <select name="format">
            <option selected value="png">PNG</option>
            <option value="svg">SVG (no background map)</option>
        </select>
    </div>

    <div class="form-row">
        <label></label>
        <input id="render-export" type="button" value="Render">
    </div>
</form>

<p id="export-output"></p>
`
};

// --- file handling ---
function handleFileSelect(map, evt) {
    evt.stopPropagation();
    evt.preventDefault();

    let tracks = [];
    let files = Array.from(evt.dataTransfer.files);
    let modal = buildUploadModal(files.length);

    modal.show();

    const handleImage = async file => {
        const image = new Image(file);
        const hasGeolocationData = await image.hasGeolocationData();
        if (!hasGeolocationData) { throw 'No geolocation data'; }
        await map.addImage(image);
        modal.addSuccess();
    };

    const handleTrackFile = async (file) => {
        for (const track of await extractTracks(file)) {
            track.filename = file.name;
            tracks.push(track);
            map.addTrack(track);
            modal.addSuccess();
        }
    };

    const handleFile = async file => {
        try {
            if (/\.jpe?g$/i.test(file.name)) {
                return await handleImage(file);
            }
            return await handleTrackFile(file);
        } catch (err) {
            console.error(err);
            modal.addFailure({name: file.name, error: err});
        }
    };

    Promise.all(files.map(handleFile)).then(() => {
        map.center();
        modal.finished();
    });
}

function handleDragOver(evt) {
    evt.dataTransfer.dropEffect = 'copy';
    evt.stopPropagation();
    evt.preventDefault();
}

// --- upload modal ---
function buildUploadModal(numFiles) {
    let numLoaded = 0;
    let failures = [];
    let failureString = failures.length ? `, <span class='failures'>${failures.length} failed</span>` : '';
    let getModalContent = () => `
        <h1>Reading files...</h1>
        <p>${numLoaded} loaded${failureString} of <b>${numFiles}</b></p>`;

    let modal = picoModal({
        content: getModalContent(),
        escCloses: false,
        overlayClose: false,
        overlayStyles: styles => { styles.opacity = 0.1; },
    });

    modal.afterCreate(() => { modal.closeElem().style.display = 'none'; });
    modal.afterClose(() => modal.destroy());

    modal.setContent = body => {
        Array.from(modal.modalElem().childNodes).forEach(child => {
            if (child !== modal.closeElem()) {
                modal.modalElem().removeChild(child);
            }
        });
        modal.modalElem().insertAdjacentHTML('afterbegin', body);
    };

    modal.addFailure = failure => {
        failures.push(failure);
        modal.setContent(getModalContent());
    };

    modal.addSuccess = () => {
        numLoaded++;
        modal.setContent(getModalContent());
    };

    modal.finished = () => {
        if (failures.length === 0) return modal.close();

        let failedItems = failures.map(f => `<li>${f.name}</li>`);
        modal.setContent(`
            <h1>Files loaded</h1>
            <p>
                Loaded ${numLoaded},
                <span class="failures">${failures.length} failure${failures.length === 1 ? '' : 's'}:</span>
            </p>
            <ul class="failures">${failedItems.join('')}</ul>`);
        modal.closeElem().style.display = '';
        modal.options({ escCloses: true, overlayClose: true });
    };

    return modal;
}

// --- settings modal (nog steeds nodig) ---
export function buildSettingsModal(tracks, opts, updateCallback) {
    // ... (blijft ongewijzigd)
}

// --- filter modal (blijft ook ongewijzigd) ---
export function buildFilterModal(tracks, filters, finishCallback) {
    // ... (blijft ongewijzigd)
}

// --- andere modals zoals export ---
export function showModal(type) {
    let modal = picoModal({
        content: MODAL_CONTENT[type],
        overlayStyles: styles => { styles.opacity = 0.01; },
    });
    modal.show();
    return modal;
}

// --- initialize zonder intro modal ---
export function initialize(map) {
    window.addEventListener('dragover', handleDragOver, false);
    window.addEventListener('drop', e => { handleFileSelect(map, e); }, false);
}