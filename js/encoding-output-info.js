const apiKey = getParameterByName('apiKey');
const tenantOrgId = getParameterByName('tenantOrgId');
const bitmovinClient = window['bitmovin-api-sdk'];
const apiClient = new bitmovinClient.default({apiKey: apiKey, tenantOrgId: tenantOrgId, debug: true});
const apiHelper = new BitmovinHelper(apiClient);

let player;
let bmTables = {
    encodings: undefined,
    muxings: undefined,
    streams: undefined,
    manifests: undefined
};

let mapMuxingsToStreams = {};

numeral.zeroFormat('N/A');
numeral.nullFormat('N/A');

async function processEncoding(apiHelper, encodingId) {
    await fetchEncodingInformation(apiHelper, encodingId);
    await fetchMuxingOutputInformation(apiHelper, encodingId);
    await fetchStreamInformation(apiHelper, encodingId);
    await fetchManifestOutputInformation(apiHelper, encodingId);
}

async function fetchEncodingInformation(apiHelper, encodingId) {
    const encoding = await apiHelper.getEncoding(encodingId);
    console.log(encoding);

    addEncodingRow(encoding)
}

async function fetchStreamInformation(apiHelper, encodingId) {
    const streams = await apiHelper.getStreamsForEncodingId(encodingId);
    streams.items.forEach(async function(stream) {
        console.log("Partial stream:", stream);

        const codecType = await apiHelper.getCodecConfigurationType(stream.codecConfigId);
        console.log("Codec Type: ", codecType);
        const codecConfig = await apiHelper.getCodecConfigurationDetails(stream.codecConfigId, codecType.type);
        console.log("Codec: ", codecConfig);

        let row = {
            "streamid": stream.id,
            "mode": stream.mode,
            "media": apiHelper.getMediaTypeFromClassName(codecConfig.constructor.name),
            "codec": apiHelper.getCodecNameFromClass(codecConfig.constructor.name),
            "label": apiHelper.computeCodecConfigName(codecConfig),
            "width": codecConfig.width,
            "height": codecConfig.height,
            "bitrate": codecConfig.bitrate,
            "jsonstream": `<pre><code>${JSON.stringify(stream, null, 2)}</code></pre>`,
            "jsoncodec": `<pre><code>${JSON.stringify(codecConfig, null, 2)}</code></pre>`
        };

        addStreamRow(row);
    })
}

async function fetchMuxingOutputInformation(apiHelper, encodingId) {
    let allMuxings = {};

    const muxings = await apiHelper.getMuxingsForEncodingId(encodingId);
    muxings.items.forEach(async function(muxing)  {
        console.log("Partial muxing:", muxing);

        let streams = apiHelper.getStreamIdsFromMuxing(muxing);
        // record for later use
        mapMuxingsToStreams[muxing.id] = streams;

        // TODO - determine whether the partial vs full representation are different (and therefore whether this additional call is required)
        await apiHelper.getMuxingDetails(encodingId, muxing).then(fullmuxing => {
            console.log("Full muxing:", fullmuxing);

            if (fullmuxing.outputs) {
                fullmuxing.outputs.forEach(muxingOutput => {
                    allMuxings[muxing.id] = processMuxingEncodingOutput(apiHelper, muxingOutput, fullmuxing, streams)})
            }
        });

        let muxingDrms = await apiHelper.getMuxingDrms(encodingId, muxing);

        muxingDrms.items.forEach(async function(drm) {
            apiHelper.getMuxingDrmDetails(encodingId, muxing, drm).then(fulldrm => {
                console.log("DRM info:", fulldrm);

                if (fulldrm.outputs) {
                    fulldrm.outputs.forEach(drmOutput => {
                        allMuxings[drm.id] = processMuxingDrmEncodingOutput(apiHelper, drmOutput, muxing, fulldrm, streams)})
                }
            })
        });
        console.log(muxingDrms.items)
    });
}

async function processMuxingEncodingOutput(apiHelper, muxingOutput, muxing, streams) {
    let fileName = null;
    if (!apiHelper.isSegmentedMuxing(muxing)) {
        fileName = muxing.filename
    }

    const urls = await apiHelper.computeUrls(muxingOutput.outputId, muxingOutput.outputPath, fileName);

    addMuxingRow(
        apiHelper.getMuxingNameFromClass(muxing.constructor.name),
        muxing.id,
        muxing.avgBitrate,
        null,
        null,
        urls,
        streams,
        JSON.stringify(muxing, null, 2)
    );

    return {
        muxing: muxing,
        urls: urls,
        drm: null
    };
}

async function processMuxingDrmEncodingOutput(apiHelper, drmOutput, muxing, drm, streams) {
    let fileName = null;
    if (!apiHelper.isSegmentedMuxing(muxing)) {
        fileName = drm.filename
    }

    const urls = await apiHelper.computeUrls(drmOutput.outputId, drmOutput.outputPath, fileName);

    addMuxingRow(
        apiHelper.getMuxingNameFromClass(muxing.constructor.name),
        muxing.id,
        muxing.avgBitrate,
        getDrmNameFromClass(drm.constructor.name),
        drm.id,
        urls,
        streams,
        JSON.stringify(muxing, null, 2)
    );

    return {
        muxing: muxing,
        urls: urls,
        drm: drm
    };
}

async function fetchManifestOutputInformation(apiHelper, encodingId) {
    const dashManifests = await apiHelper.getDashManifestsForEncodingId(encodingId);
    const hlsManifests = await apiHelper.getHlsManifestsForEncodingId(encodingId);
    const smoothManifests = await apiHelper.getSmoothManifestsForEncodingId(encodingId);

    const manifests = [...dashManifests.items, ...hlsManifests.items, ...smoothManifests.items];

    manifests.forEach(manifest => {
        console.log(manifest);

        manifest.outputs.forEach(manifestOutput => processManifestEncodingOutput(apiHelper, manifestOutput, manifest))
    });

    if (manifests.length === 0) {
        hideManifestTable();
    }
}

async function processManifestEncodingOutput(apiHelper, manifestOutput, manifest) {
    let manifestName = null;

    if (manifest instanceof bitmovinApi.SmoothStreamingManifest) {
        manifestName = manifest.clientManifestName;
    } else {
        manifestName = manifest.manifestName;
    }

    const urls = await apiHelper.computeUrls(manifestOutput.outputId, manifestOutput.outputPath, manifestName);

    addManifestRow(manifest.type, manifest.id, urls)
}

// === DOM functions

function addEncodingRow(encoding) {
    let row = {
        "encodingname": encoding.name,
        "status": encoding.status
    };

    bmTables.encodings.row.add(row).draw()
}

function addMuxingRow(muxing_type, muxing_id, bitrate, drm_type, drm_id, urls, streams, json) {
    let urlTable = $('<table class="table table-sm table-hover urls"></table>');
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

    let row = {
        "muxing": muxing_type,
        "muxingid": muxing_id,
        "drmid": drm_id,
        "drm": drm_type ? drm_type : "-",
        "bitrate": bitrate,
        "output": urls.outputType,
        "host": urls.host,
        "urls": urlTable.prop('outerHTML'),
        "streams": addRefLinks(streams),
        "json": `<pre><code>${json}</code></pre>`
    };

    bmTables.muxings.row.add(row).draw();
    // hack suggested at https://datatables.net/forums/discussion/comment/156646#Comment_156646 to avoid race condition
    //setTimeout(function(){ muxingTable.draw(); }, 2000);
}

function addRefLinks(arrayOfIds) {
    let links = arrayOfIds.join("<br/>");
    let refs = arrayOfIds.join(",");

    let button = `<button type="button" class="btn btn-xs btn-info follow-ref" data-ref="${refs}">show</button>`;

    return `${links}<br/>${button}`;
}

function hideManifestTable() {
    $("table#manifests").hide();
}

function createPlayerButton(manifest_type, streamingUrl) {
    let button = `<button type="button" class="btn btn-xs btn-primary btn-start-play" data-streamType="${manifest_type}" data-streamUrl="${streamingUrl}">play</button>`;
    // button.data('streamType', manifest_type);
    // button.data('streamUrl', streamingUrl);
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

function resetTables() {
    Object.keys(bmTables).forEach(tbname => {
        bmTables[tbname].clear().draw()
    })
}

function addStreamRow(row_info) {
    bmTables.streams.row.add(row_info).draw();
    // hack suggested at https://datatables.net/forums/discussion/comment/156646#Comment_156646 to avoid race condition
    //setTimeout(function(){ streamTable.draw(); }, 3000);
}

function addManifestRow(manifest_type, manifest_id, urls) {
    let urlTable = $('<table class="table table-sm table-hover urls"></table>');
    let urlTableBody = $('<tbody>');

    urlTableBody.append(addUrlRow('path', urls.outputPath));
    urlTableBody.append(addUrlRow('storage', urls.storageUrl, [createLinkButton("console", urls.consoleUrl)]));
    urlTableBody.append(addUrlRow('streaming', urls.streamingUrl, [createPlayerButton(manifest_type, urls.streamingUrl)]));

    urlTable.append(urlTableBody);

    let row = {
        "manifestid": manifest_id,
        "manifest": manifest_type,
        "output": urls.outputType,
        "host": urls.host,
        "urls": urlTable.prop('outerHTML')
    };

    bmTables.manifests.row.add(row).draw();
}

function addUrlRow(title, url, actions) {
    let newRow = $("<tr>");
    let cols = "";

    cols += `<th scope='row'>${title}</th>`;
    cols += `<td class="copy-me">${url}</td>`;

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

function dataTable_bitrate(data, type, row, meta) {
    if (type === "sort" || type === 'type') {
        return data ? parseInt(data) : null;
    } else {
        return data ? numeral(data).format('0 b') : undefined;
    }
}

function dataTable_addLinkToMuxings(data, type, row, meta) {
    return `<button type="button" class="btn btn-xs btn-info follow-ref-muxing" data-streamid="${data}">show</button>`;
}

function dataTable_renderHiddenColumns(api, rowIdx, columns ) {
    var data = $.map( columns, function ( col, i ) {
        return col.hidden ?
            '<tr data-dt-row="'+col.rowIndex+'" data-dt-column="'+col.columnIndex+'">'+
            '<th>'+col.title+'</th> '+
            '<td class="copy-me">'+col.data+'</td>'+
            '</tr>' :
            '';
    } ).join('');

    return data ?
        $('<table class="hidden-columns"/>').append( data ) :
        false;
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
        case 'MP4':
            source['progressive'] = stream;
            break;
        default:
            console.error('Unable to create player source for stream type:', streamType)
    }

    $('.stream-info').html(`${streamType}:<br/> <span class="copy-me">${stream}</span>`);
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

    let stream = btn.data('streamurl');
    let streamType = btn.data('streamtype');

    loadPlayer(streamType, stream)
});

$(document).on('hide.bs.modal', '#player-modal', function (e) {
    console.log("Pausing the player");
    player.pause()
});


// === Main

$(document).on('click', '.copy-me', function(event) {
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
            //span.textContent = original;
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

$(document).on('click', '.follow-ref', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    let guids = $(this).first().data('ref');
    let classes = guids.split(',').map(g => '.'+g).join(',');

    let row = $(classes);

    $('html, body').animate({
        scrollTop: (row.first().offset().top)
    },500);

    setTimeout(() => {
        row.addClass('highlight');
        setTimeout(() => {
            row.removeClass('highlight');
        }, 2500);
    }, 500);
});


$(document).on('click', '.follow-ref-muxing', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    let streamId = $(this).first().data('streamid');
    let muxingIds = getMuxingIdsForStreamId(streamId);

    let classes = muxingIds.map(g => '.'+g).join(',');

    let row = $(classes);

    $('html, body').animate({
        scrollTop: (row.first().offset().top - 70)
    },500);

    setTimeout(() => {
        row.addClass('highlight');
        setTimeout(() => {
            row.removeClass('highlight');
        }, 1500);
    }, 500);
});

$(document).on('submit', '#inputEncodings', encodingsChanged);

function encodingsChanged(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    resetTables();
    let encodingId = $('#inputEncodingId').val();
    processEncoding(apiHelper, encodingId);

    // to prevent the submit to reload the page
    return false;
}

$(document).ready(function () {
    let divTest = $('#test');
    divTest.html(apiKey);

    bmTables.encodings = $('#encodings').DataTable({
        dom: "t",
        ordering: true,
        paging: false,
        columns: [
            {
                data: 'encodingname',
                title: 'Encoding',
                className: 'copy-me'
            },
            {
                data: 'status',
                title: 'Status'
            }
        ]
    });

    bmTables.manifests = $('#manifests').DataTable({
        dom: 'ift',
        ordering: true,
        paging: false,
        columns: [
            {
                data: 'manifest',
                title: 'Manifest',
            },
            {
                data: 'manifestid',
                title: "Id",
                className: "copy-me"
            },
            {
                data: 'output',
                title: 'Output'
            },
            {
                data: 'host',
                title: 'Host',
                className: "copy-me"
            },
            {
                data: "urls",
                title: "URLs",
                orderable: false
            }
        ],
        rowCallback: function( row, data, index ) {
            $(row).addClass(data.manifestid);
        }
    });

    bmTables.muxings = $('#muxings').DataTable( {
        dom: 'ift',
        ordering: true,
        orderFixed: [[0, "asc"]],
        order: [[ 1, "asc" ],[ 2, "desc" ]],
        paging: false,
        columns: [
            {
                data: "muxing",
                title: "Muxing",
                orderable: false,
            },
            {
                data: "drm",
                title: "DRM"
            },
            {
                data: "bitrate",
                title: "Avg Bitrate",
                defaultContent: "-",
                type: 'number',
                render: dataTable_bitrate
            },
            {
                data: "output",
                title: "Output"
            },
            {
                data: "host",
                title: "Host",
                className: "copy-me"
            },
            {
                data: null,
                title: "More",
                // a column just for the button controls
                className: 'control more',
                orderable: false,
                defaultContent: '',
            },
            {
                data: "urls",
                title: "URLs",
                orderable: false
            },
            {
                data: "muxingid",
                title: "Muxing Id",
                className: "none"
            },
            {
                data: "drmid",
                title: "DRM Id",
                className: "none"
            },
            {
                data: "streams",
                title: "Streams",
                // controls DataTables() responsive and force a child row
                className: "none",
                width: "50px"
            },
            {
                data: "json",
                title: "Muxing Configuration",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            }
        ],
        rowGroup: {
            dataSrc: 'muxing'
        },
        responsive: {
            details: {
                type: 'column',
                renderer: dataTable_renderHiddenColumns,
                target: '.more'  // jQuery selector as per doc - https://datatables.net/forums/discussion/57793/issue-with-using-responsive-and-a-last-column#latest
            }
        },
        rowCallback: function( row, data, index ) {
            $(row).addClass(data.muxingid);

            if (!data.bitrate) {
                $('td', row).css('color', 'lightgray');
            }
        }
    });

    bmTables.streams = $('#streams').DataTable({
        dom: 'ift',
        ordering: true,
        orderFixed: [[0, "asc"], [1, "asc"]],
        order: [[4, "desc"]],
        paging: false,
        columns: [
            {
                data: "media",
                title: "Media",
                orderable: false,
                className: "none"
            },
            {
                data: "codec",
                title: "Codec",
                orderable: false,
                className: "none"
            },
            {
                data: "label",
                title: "Codec Summary",
                width: "250px",
                className: "copy-me"
            },
            {
                data: "mode",
                title: "Mode",
                defaultContent: "-"
            },
            {
                data: "width",
                title: "Width",
                defaultContent: "-"
            },
            {
                data: "height",
                title: "Height",
                defaultContent: "-"
            },
            {
                data: "bitrate",
                title: "Bitrate",
                defaultContent: "-",
                type: 'number',
                width: "80px",
                render: dataTable_bitrate
            },
            {
                data: null,
                title: "More",
                // a column just for the button controls
                className: 'control more',
                orderable: false,
                defaultContent: '',
            },
            {
                data: "streamid",
                title: "Stream Id",
                className: "none copy-me"
            },
            {
                data: "streamid",
                title: "Muxings",
                className: "none",
                render: dataTable_addLinkToMuxings,
                defaultContent: '-'
            },
            {
                data: "jsoncodec",
                title: "Codec Configuration",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            },
            {
                data: "jsonstream",
                title: "Stream Configuration",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            }

        ],
        rowGroup: {
            dataSrc: ['media','codec']
        },
        responsive: {
            details: {
                type: 'column',
                renderer: dataTable_renderHiddenColumns,
                target: '.more'  // jQuery selector as per doc - https://datatables.net/forums/discussion/57793/issue-with-using-responsive-and-a-last-column#latest
            }
        },
        rowCallback: function (row, data, index) {
            $(row).addClass(data.streamid);
        }
    });

    const encodingId = getParameterByName('encodingId');
    if (encodingId) {
        $('#inputEncodingId').val(encodingId);
        processEncoding(apiHelper, encodingId);
    }

    const config = {
        key: 'a973bb60-98d2-4404-8b45-b9f092f3d08d',
        analytics: {
            key: 'bbb7265c-7cf1-4e4c-af81-8c063015dde9',
            videoId: encodingId,
            title: 'Outputs from encoding ' + encodingId
        }
    };

    let container = document.getElementById('test-player');
    player = new bitmovin.player.Player(container, config);
});
