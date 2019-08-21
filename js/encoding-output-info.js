const apiKey = getParameterByName('apiKey');
const encodingId = getParameterByName('encodingId');
const bitmovinApi = window['bitmovin-api-sdk'].default({apiKey: apiKey, debug: true});

let player;
let muxingTable;

function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

async function processEncoding(encodingId) {
    await fetchEncodingInformation(encodingId);
    await fetchMuxingOutputInformation(encodingId);
    await fetchManifestOutputInformation(encodingId);
}

async function fetchEncodingInformation(encodingId) {
    const encoding = await getEncoding(encodingId);
    console.log(encoding);

    addEncodingRow(encoding)
}

async function fetchMuxingOutputInformation(encodingId) {
    let allMuxings = {};

    const muxings = await getMuxingsForEncodingId(encodingId);
    muxings.items.forEach(async function(muxing)  {
        console.log("Partial muxing:", muxing);

        let streams = getPartialStreamsFromMuxing(muxing);

        // TODO - determine whether the partial vs full representation are different (and therefore whether this additional call is required)
        await getMuxingDetails(encodingId, muxing).then(fullmuxing => {
            console.log("Full muxing:", fullmuxing);

            if (fullmuxing.outputs) {
                fullmuxing.outputs.forEach(muxingOutput => {
                    allMuxings[muxing.id] = processMuxingEncodingOutput(muxingOutput, fullmuxing, streams)})
            }
        });

        let muxingDrms = await getMuxingDrms(encodingId, muxing);

        muxingDrms.items.forEach(async function(drm) {
            getMuxingDrmDetails(encodingId, muxing, drm).then(fulldrm => {
                console.log("DRM info:", fulldrm);

                if (fulldrm.outputs) {
                    fulldrm.outputs.forEach(drmOutput => {
                        allMuxings[drm.id] = processMuxingDrmEncodingOutput(drmOutput, muxing, fulldrm, streams)})
                }
            })
        });
        console.log(muxingDrms.items)
    });

    console.log(allMuxings.length);
    // Object.values(allMuxings).forEach(muxingInfo => {
    //     if (muxingInfo.drm) {
    //         addMuxingRow(getMuxingNameFromClass(muxingInfo.muxing.constructor.name), muxingInfo.muxing.avgBitrate, null, muxingInfo.urls)
    //     } else {
    //         addMuxingRow(getMuxingNameFromClass(muxingInfo.muxing.constructor.name), muxingInfo.muxing.avgBitrate, muxingInfo.drm.constructor.name, muxingInfo.urls)
    //     }
    // })

}

async function processMuxingEncodingOutput(muxingOutput, muxing, streams) {
    let fileName = null;
    if (!isSegmentedMuxing(muxing)) {
        fileName = muxing.filename
    }

    const urls = await computeUrls(muxingOutput.outputId, muxingOutput.outputPath, fileName);

    addMuxingRow(getMuxingNameFromClass(muxing.constructor.name), muxing.avgBitrate, null, urls, streams);

    return {
        muxing: muxing,
        urls: urls,
        drm: null
    };
}

async function processMuxingDrmEncodingOutput(drmOutput, muxing, drm, streams) {
    let fileName = null;
    if (!isSegmentedMuxing(muxing)) {
        fileName = drm.filename
    }

    const urls = await computeUrls(drmOutput.outputId, drmOutput.outputPath, fileName);

    addMuxingRow(getMuxingNameFromClass(muxing.constructor.name), muxing.avgBitrate, getDrmNameFromClass(drm.constructor.name), urls, streams);

    return {
        muxing: drm,
        urls: urls,
        drm: drm
    };
}

async function fetchManifestOutputInformation(encodingId) {
    const dashManifests = await getDashManifestsForEncodingId(encodingId);
    const hlsManifests = await getHlsManifestsForEncodingId(encodingId);
    const smoothManifests = await getSmoothManifestsForEncodingId(encodingId);

    const manifests = [...dashManifests.items, ...hlsManifests.items, ...smoothManifests.items];

    manifests.forEach(manifest => {
        console.log(manifest);

        manifest.outputs.forEach(manifestOutput => processManifestEncodingOutput(manifestOutput, manifest))
    });

    if (manifests.length === 0) {
        hideManifestTable();
    }
}

async function processManifestEncodingOutput(manifestOutput, manifest) {
    let manifestName = null;

    if (manifest instanceof bitmovinApi.SmoothStreamingManifest) {
        manifestName = manifest.clientManifestName;
    } else {
        manifestName = manifest.manifestName;
    }

    const urls = await computeUrls(manifestOutput.outputId, manifestOutput.outputPath, manifestName);

    addManifestRow(manifest.type, urls)
}

// === Compile URLs

async function computeUrls(outputId, outputPath, fileName) {
    const outputType = await getOutputType(outputId);
    const output = await getOutput(outputId, outputType.type);

    let urls = {};
    urls.outputType = getOutputNameFromClass(output.constructor.name);

    if (output instanceof bitmovinApi.S3Output) {
        urls = computeS3Urls(urls, output.bucketName);
    } else if (output instanceof bitmovinApi.GcsOutput) {
        urls = computeGcsUrls(urls, output.bucketName);
    }

    let lastChar = outputPath.substr(-1);
    if (lastChar === "/") {
        outputPath = outputPath.slice(0, -1);
    }
    urls.outputPath = outputPath;

    if (outputPath) {
        urls.streamingUrl = urls.streamingUrl + "/" + outputPath;
        urls.storageUrl = urls.storageUrl + "/" + outputPath;
        if (urls.consoleUrl)
            urls.consoleUrl = urls.consoleUrl + "/" + outputPath + "/";
    }

    if (fileName) {
        urls.streamingUrl = urls.streamingUrl + "/" + fileName;
        urls.storageUrl = urls.storageUrl + "/" + fileName;
    } else {
        urls.streamingUrl = ""
    }

    return urls;
}

function computeS3Urls(urls, bucketName) {
    let streamingUrl = "https://" + bucketName + ".s3.amazonaws.com" ;
    let storageUrl = "s3://" + bucketName;
    let consoleUrl = "https://s3.console.aws.amazon.com/s3/buckets/" + bucketName;

    urls.host = bucketName;
    urls.streamingUrl = streamingUrl;
    urls.storageUrl = storageUrl;
    urls.consoleUrl = consoleUrl;

    return urls
}

function computeGcsUrls(urls, bucketName) {
    // https://storage.googleapis.com/bitmovin-api-europe-west1-ci-input/AWOLNATION_muxed.mkv
    let streamingUrl = "https://storage.googleapis.com/" + bucketName;
    // gs://bitmovinApi-api-europe-west1-ci-input/AWOLNATION_muxed.mkv
    let storageUrl = "gs://" + bucketName ;
    // https://console.cloud.google.com/storage/browser/_details/bitmovin-api-europe-west1-ci-input/AWOLNATION_muxed.mkv
    let consoleUrl = "https://console.cloud.google.com/storage/browser/_details/" + bucketName ;

    urls.host = bucketName;
    urls.streamingUrl = streamingUrl;
    urls.storageUrl = storageUrl;
    urls.consoleUrl = consoleUrl;

    return urls
}

// === Core Bitmovin Functions

function getEncoding(encodingId) {
    return bitmovinApi.encoding.encodings.get(encodingId);
}

function getMuxingsForEncodingId(encodingId) {
    return bitmovinApi.encoding.encodings.muxings.list(encodingId)
}

function getMuxingDetails(encodingId, muxing) {
    let muxingEndpointPath = getMuxingEndpointFromClassName(muxing.constructor.name);
    try {
        return bitmovinApi.encoding.encodings.muxings[muxingEndpointPath].get(encodingId, muxing.id);
    } catch (e) {
        console.error("Muxing type not recognised or handled: " + muxing.constructor.name)
    }
}

function getMuxingDrms(encodingId, muxing) {
    let muxingEndpointPath = getMuxingEndpointFromClassName(muxing.constructor.name);

    return bitmovinApi.encoding.encodings.muxings[muxingEndpointPath].drm.list(encodingId, muxing.id)
}

function getMuxingDrmDetails(encoding, muxing, drm) {
    let muxingEndpointPath = getMuxingEndpointFromClassName(muxing.constructor.name);
    let drmEndpointPath = getDrmEndpointFromClassName(drm.constructor.name);

    return bitmovinApi.encoding.encodings.muxings[muxingEndpointPath].drm[drmEndpointPath].get(encodingId, muxing.id, drm.id)
}

function isSegmentedMuxing(muxing) {
    return (muxing instanceof bitmovinApi.Fmp4Muxing
        || muxing instanceof bitmovinApi.TsMuxing
        || muxing instanceof bitmovinApi.WebmMuxing
        || muxing instanceof bitmovinApi.CmafMuxing)
}

function getDashManifestsForEncodingId(encodingId) {
    return bitmovinApi.encoding.manifests.dash.list(q => q.encodingId(encodingId));
}

function getHlsManifestsForEncodingId(encodingId) {
    return bitmovinApi.encoding.manifests.hls.list(q => q.encodingId(encodingId));
}

function getSmoothManifestsForEncodingId(encodingId) {
    return bitmovinApi.encoding.manifests.smooth.list(q => q.encodingId(encodingId));
}

function getOutputType(outputId) {
    return bitmovinApi.encoding.outputs.type.get(outputId)
}

function getOutput(outputId, outputType) {
    if (outputType === "S3") {
        return bitmovinApi.encoding.outputs.s3.get(outputId);
    } else if (outputType === "GCS") {
        return bitmovinApi.encoding.outputs.gcs.get(outputId);
    }
}

function getPartialStreamsFromMuxing(muxing) {
    return muxing.streams.map(muxingstream => muxingstream.streamId )
}

// === Bitmovin Endpoint and Object name remapping

function getOutputNameFromClass(classname) {
    return getObjectNameFromClass(bitmovinApi.Output.typeMap, classname)
}

function getMuxingNameFromClass(classname) {
    return getObjectNameFromClass(bitmovinApi.Muxing.typeMap, classname)
}

function getDrmNameFromClass(classname) {
    return getObjectNameFromClass(bitmovinApi.Drm.typeMap, classname)
}

function getObjectNameFromClass(object, classname) {
    return Object.keys(object).find(key => object[key] === classname);
}

function getMuxingEndpointFromClassName(classname) {
    classname = classname.replace("Muxing", "");
    classname = classname.charAt(0).toLowerCase() + classname.substring(1);
    return classname
}

function getDrmEndpointFromClassName(classname) {
    classname = classname.replace("Drm", "");
    classname = classname.replace("Encryption", "");
    classname = classname.toLowerCase();
    return classname
}

// === Utilities


// === DOM functions

function addEncodingRow(encoding) {
    let newRow = $("<tr>");
    let cols = "";

    cols += `<td class="copyme">${encoding.name}</td>`;
    cols += `<td class="copyme">${encoding.id}</td>`;
    cols += `<td>${encoding.status}</td>`;

    newRow.append(cols);
    $("table#encodings").append(newRow);
}

function addMuxingRow(muxing_type, bitrate, drm_type, urls, streams) {
    let urlTable = $('<table class="table table-sm table-hover table-borderless urls"></table>');
    let urlTableBody = $('<tbody>');

    urlTableBody.append(addUrlRow('path', urls.outputPath));

    if (bitrate) {
        urlTableBody.append(addUrlRow('storage', urls.storageUrl, [createLinkButton("console", urls.consoleUrl)]));

        if (urls.streamingUrl !== "") {
            urlTableBody.append(addUrlRow('streaming', urls.streamingUrl, [createPlayerButton(muxing_type, urls.streamingUrl)])) ;
        }
    } else {
        urlTableBody.append(addUrlRow('storage', urls.storageUrl, null));
    }

    urlTable.append(urlTableBody);

    // TODO - replace this with DataTable styling
    if (!bitrate) {
        //newRow.addClass("not-encoded")
    }

    let row = {
        "muxing": muxing_type,
        "drm": drm_type ? drm_type : "-",
        "bitrate": bitrate,
        "output": urls.outputType,
        "host": urls.host,
        "urls": urlTable.prop('outerHTML'),
        "streams": streams.join("<br/>")
    };

    muxingTable.row.add(row);
    // hack suggested at https://datatables.net/forums/discussion/comment/156646#Comment_156646 to avoid race condition
    setTimeout(function(){ muxingTable.draw(); }, 2000);
}

function hideManifestTable() {
    $("table#manifests").hide();
}

function addManifestRow(manifest_type, urls) {
    let newRow = $("<tr>");
    let cols = "";

    cols += `<th scope='row'>${manifest_type}</th>`;
    cols += `<td>${urls.outputType}</td>`;
    cols += `<td>${urls.host}</td>`;

    newRow.append(cols);

    let urlCol = $("<td>");
    let urlTable = $('<table class="table table-sm table-hover table-borderless urls"></table>');
    let urlTableBody = $('<tbody>');

    urlTableBody.append(addUrlRow('path', urls.outputPath));
    urlTableBody.append(addUrlRow('storage', urls.storageUrl, [createLinkButton("console", urls.consoleUrl)]));
    urlTableBody.append(addUrlRow('streaming', urls.streamingUrl, [createPlayerButton(manifest_type, urls.streamingUrl)]));

    urlTable.append(urlTableBody);
    urlCol.append(urlTable);
    newRow.append(urlCol);

    $("table#manifests").append(newRow);
}

function addUrlRow(title, url, actions) {
    let newRow = $("<tr>");
    let cols = "";

    cols += `<th scope='row'>${title}</th>`;
    cols += `<td class="copyme">${url}</td>`;

    newRow.append(cols);

    if (actions) {
        let actionCol = $("<td style='text-align: right'>");
        actions.forEach(action => {
            actionCol.append(action);
        });
        newRow.append(actionCol);
    }

    return newRow;
}

function createPlayerButton(manifest_type, streamingUrl) {
    let button = $('<button type="button" class="btn btn-xs btn-primary btn-start-play">play</button>');
    button.data('streamType', manifest_type);
    button.data('streamUrl', streamingUrl);
    return button
}

function createLinkButton(name, url) {
    return $(`<a class="btn btn-xs btn-secondary" href="${url}" target="_blank">${name}</a>`);
}

const showLoader = () => {
    $('.loader').show()
};
const hideLoader = () => {
    $('.loader').hide()
};

// === DataTables Functions

function dataTable_bitrate(data, type, row, meta) {
    if (type === "sort" || type === 'type') {
        return data ? parseInt(data) : null;
    } else {
        return data ? numeral(data).format('0 b') : undefined;
    }
}

// === Bitmovin Player functions

function loadPlayer(streamType, stream) {
    showLoader();
    let source = {};

    switch (streamType) {
        case 'DashManifest':
            source['dash'] = stream;
            break;
        case 'HlsManifest':
            source['hls'] = stream;
            break;
        case 'SmoothStreamingManifest':
            source['smooth'] = stream;
            break;
        case 'Mp4Muxing':
            source['progressive'] = stream;
            break;
        default:
            console.error('Unable to create player source for stream type:', streamType)
    }

    $('.stream-info').html(`${streamType}:<br/> <span class="copyme">${stream}</span>`);
    $('#player-modal').modal('show');

    player.load(source).then(
        function() {
            console.log('Successfully created Bitmovin Player instance');
            hideLoader();
            player.play();
        },
        function(reason) {
            console.log('Error while creating Bitmovin Player instance');
        }
    );
}

$(document).on('click', '.btn-start-play', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    let btn = $(this);

    let stream = btn.data('streamUrl');
    let streamType = btn.data('streamType');

    loadPlayer(streamType, stream)
});

$(document).on('hide.bs.modal', '#player-modal', function (e) {
    console.log("Pausing the player");
    player.pause()
});


// === Main

$(document).on('click', '.copyme', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    let span = $(this)[0];

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(range);

    try {
        document.execCommand('copy');
        selection.removeAllRanges();

        const original = span.textContent;
        //span.textContent = 'Copied!';
        span.classList.add('copied');

        setTimeout(() => {
            span.textContent = original;
            span.classList.remove('copied');
        }, 1200);
    } catch(e) {
        const errorMsg = document.querySelector('.error-msg');
        errorMsg.classList.add('show');

        setTimeout(() => {
            errorMsg.classList.remove('show');
        }, 1200);
    }
});

$(document).ready(function () {
    let divTest = $('#test');
    divTest.html(apiKey);

    muxingTable = $('#muxings').DataTable( {
        ordering: true,
        order: [[ 0, "asc" ],[ 1, "asc" ],[ 2, "desc" ]],
        paging: false,
        columns: [
            { data: "muxing", title: "Muxing" },
            { data: "drm", title: "DRM" },
            {
                data: "bitrate",
                title: "Avg Bitrate",
                defaultContent: "-",
                type: 'number',
                render: dataTable_bitrate
            },
            { data: "output", title: "Output" },
            { data: "host", title: "Host" },
            {
                data: null,
                title: "Streams",
                // a column just for the button controls
                className: 'control streams',
                orderable: false,
                defaultContent: '',
            },
            {
                data: "urls",
                title: "URLs",
                orderable: false
            },
            {
                data: "streams",
                title: "Streams",
                // controls DataTables() responsive and force a child row
                className: "none",
                width: "50px"
            },
        ],
        rowGroup: {
            dataSrc: 'drm'
        },
        responsive: {
            details: {
                type: 'column',
                target: '.streams'  // jQuery selector as per doc - https://datatables.net/forums/discussion/57793/issue-with-using-responsive-and-a-last-column#latest
            }
        },
        rowCallback: function( row, data, index ) {
            if (!data.bitrate) {
                $('td', row).css('color', 'lightgray');
            }
        }
    });

    processEncoding(encodingId);

    const config = {
        key: 'a973bb60-98d2-4404-8b45-b9f092f3d08d',
        analytics: {
            key: 'bbb7265c-7cf1-4e4c-af81-8c063015dde9',
            videoId: encodingId,
            title: 'Outputs from encoding ' + encodingId
        }
    };

    player = new bitmovin.player.Player(container, config);
    let container = document.getElementById('test-player');

});