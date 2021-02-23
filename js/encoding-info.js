const apiKey = getParameterByName('apiKey');
const tenantOrgId = getParameterByName('tenantOrgId');
const bitmovinClient = window['bitmovin-api-sdk'];

let player;
let bmTables = {
    encodings: undefined,
    muxings: undefined,
    streams: undefined,
    manifests: undefined
};

let mapMuxingsToStreams = {};

let drmKeys = {};

numeral.zeroFormat('N/A');
numeral.nullFormat('N/A');

async function processEncoding(apiHelper, encodingId) {
    await fetchEncodingInformation(apiHelper, encodingId);
    await fetchMuxingOutputInformation(apiHelper, encodingId);
    await fetchStreamInformation(apiHelper, encodingId);
    await fetchManifestOutputInformation(apiHelper, encodingId);

    await initPlayer(encodingId);
}

async function fetchEncodingInformation(apiHelper, encodingId) {
    try {
        const encoding = await apiHelper.getEncoding(encodingId);
        console.log(encoding);

        const encodingStart = await apiHelper.getEncodingStart(encodingId);
        console.log(encodingStart);

        addEncodingRow(encoding, encodingStart)
    } catch (e) {
        throwBitmovinError(e)
    }
}

async function fetchStreamInformation(apiHelper, encodingId) {
    const streams = await apiHelper.getStreamsForEncodingId(encodingId);
    streams.items.forEach(async function(stream) {
        console.log("Partial stream:", stream);

        const codecType = await apiHelper.getCodecConfigurationType(stream.codecConfigId);
        console.log("Codec Type: ", codecType);
        const codecConfig = await apiHelper.getCodecConfigurationDetails(stream.codecConfigId, codecType.type);
        console.log("Codec: ", codecConfig);

        const filters = await this.fetchFiltersInformation(apiHelper, encodingId, stream.id, []);
        console.log("Filters", filters);
        const filterTable = this.makeStreamFilterTable(filters);

        const inputInfo = await apiHelper.getStreamInputDetails(encodingId, stream.id);
        console.log("Input", inputInfo);

        // const inputStreams = await this.fetchInputStreamInformation(apiHelper, encodingId, stream);
        const inputStreamsTable = await this.makeInputStreamChainTable(apiHelper, encodingId, stream.inputStreams[0], "(stream)");

        let row = {
            "streamid": stream.id,
            "mode": stream.mode,
            "media": apiHelper.getMediaTypeFromClassName(codecConfig.constructor.name),
            "codec": apiHelper.getCodecNameFromClass(codecConfig.constructor.name),
            "label": apiHelper.computeCodecConfigName(codecConfig),
            "width": codecConfig.width,
            "height": codecConfig.height,
            "bitrate": codecConfig.bitrate,
            "jsonstream": prettyPayload(stream),
            "jsoncodec": prettyPayload(codecConfig),
            "jsonfilters": filterTable.prop('outerHTML'),
            "inputstreams": inputStreamsTable.prop('outerHTML'),
            "inputinfo": prettyPayload(inputInfo)
        };

        addStreamRow(row);
    })
}

async function fetchInputStreamInformation(apiHelper, encodingId, inputStreamId) {
    const inputStreamDetails = await apiHelper.getInputStreamDetails(encodingId, inputStreamId);
    console.log("Input Stream details:", inputStreamDetails);

    return inputStreamDetails
}

async function makeInputStreamChainTable(apiHelper, encodingId, json, initialTitle) {

    initialTitle = initialTitle || "(top)";

    let table = $('<table class="table table-sm table-hover"></table>');
    let body = $('<tbody>').appendTo(table);
    let headerRow = $('<tr colspan="2">').appendTo(body);
    let header = $('<th>').appendTo(headerRow);
    header.text(initialTitle);

    let mainRow = $("<tr>").appendTo(body);

    let cell1 = $("<td>").appendTo(mainRow);
    let jsonHtml = $(prettyPayload(json)).appendTo(cell1);

    let cell2 = $("<td>").appendTo(mainRow);

    let subInputStreamIds = collectInputStreamIds(json, []);
    await Promise.all(subInputStreamIds.map(async(inputStreamId) => {
        const inputStreamDetails = await apiHelper.getInputStreamDetails(encodingId, inputStreamId);
        console.log("Input Stream details:", inputStreamDetails);

        cell2.append(await makeInputStreamChainTable(apiHelper, encodingId, inputStreamDetails, inputStreamDetails.type))
    }));

    return table
}

function collectInputStreamIds(obj, res) {
    Object.keys(obj).forEach(key => {

        if (key === "inputStreamId" && obj[key] !== undefined) {
            console.log(`key: ${key}, value: ${obj[key]}`);
            res.push(obj[key])
        }

        if (typeof obj[key] === 'object') {
            collectInputStreamIds(obj[key], res)
        }

    });
    return res
}

async function fetchFiltersInformation(apiHelper, encodingId, streamId) {
    const filters = await apiHelper.getStreamFilters(encodingId, streamId);

    const resolvedFilters = await filters.filters.reduce(async function(res, filter) {
        const filterType = await apiHelper.getFilterType(filter.id);
        console.log("Filter type:", filterType);

        const filterDetails = await apiHelper.getFilterDetails(filter.id, filterType);
        console.log("Filter details:", filterDetails);

        // async reduce returns a Promise on each iteration, so await is required
        // https://advancedweb.hu/how-to-use-async-functions-with-array-reduce-in-javascript/#asynchronous-reduce
        res = await(res);
        res[filter.position] = filterDetails;
        return res
    }, {});

    return resolvedFilters;
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
        console.log(`DRMs for muxing ${muxing.id}:`, muxingDrms.items);

        muxingDrms.items.forEach(async function(drm) {
            apiHelper.getMuxingDrmDetails(encodingId, muxing, drm).then(fulldrm => {
                console.log("DRM info:", fulldrm);

                if (fulldrm.outputs) {
                    fulldrm.outputs.forEach(drmOutput => {
                        allMuxings[drm.id] = processMuxingDrmEncodingOutput(apiHelper, drmOutput, muxing, fulldrm, streams)})
                }

                // add to the global table, for player decryption
                addDrmKey(fulldrm.type, fulldrm.key, fulldrm.kid)
            })
        });
    });
}

function addDrmKey(type, key, kid) {
    if (!(type in drmKeys)) {
        drmKeys[type] = []
    }
    drmKeys[type] = _.unionBy(drmKeys[type], [{key:key, kid:kid}], _.isEqual)
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
        muxing,
        ""
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
        apiHelper.getDrmNameFromClass(drm.constructor.name),
        drm.id,
        urls,
        streams,
        muxing,
        drm
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

        manifest.outputs.forEach(manifestOutput => processManifestEncodingOutput(apiHelper, manifestOutput, manifest));
    });

    if (manifests.length === 0) {
        hideManifestTable();
    }
}

async function processManifestEncodingOutput(apiHelper, manifestOutput, manifest) {
    let manifestName = null;

    if (manifest instanceof BitmovinApi.SmoothStreamingManifest) {
        manifestName = manifest.clientManifestName;
    } else {
        manifestName = manifest.manifestName;
    }

    const urls = await apiHelper.computeUrls(manifestOutput.outputId, manifestOutput.outputPath, manifestName);

    let manifestTree;
    if (manifest instanceof BitmovinApi.DashManifest) {
        manifestTree = await apiHelper.getDashManifestResourceTree(manifest.id)
    }
    if (manifest instanceof BitmovinApi.HlsManifest) {
        manifestTree = await apiHelper.getHlsManifestResourceTree(manifest.id)
    }

    addManifestRow(manifest, urls, manifestTree)
}

// === DOM functions

function prettyPayload(json) {
    let html = `<div class="resourceType">${json.constructor.name}</div>`;
    html += `<pre>${prettyPrintJson.toHtml(json, {indent: 2, quoteKeys: true})}</pre>`;
    return html
}

function makeStreamFilterTable(filters) {
    let table = $('<table class="table table-sm table-hover filters"></table>');
    let tableBody = $('<tbody>');

    for (const [pos, json] of Object.entries(filters)) {
        let jsonHtml = prettyPayload(json);
        let newRow = $(`<tr><th>${pos}</th><td>${jsonHtml}</td>`);
        tableBody.append(newRow);
    }

    table.append(tableBody);
    return table;
}

function addEncodingRow(encoding, encodingStart) {
    let row = {
        "encodingname": encoding.name,
        "status": encoding.status,
        "version": encoding.selectedEncoderVersion,
        "region": encoding.selectedCloudRegion,
        "json_encoding": prettyPayload(encoding),
        "json_start": prettyPayload(encodingStart)
    };

    bmTables.encodings.row.add(row).draw()
}

function addMuxingRow(muxing_type, muxing_id, bitrate, drm_type, drm_id, urls, streams, json_muxing, json_drm) {
    let urlTable = $('<table class="table table-sm table-hover urls"></table>');
    let urlTableBody = $('<tbody>');

    urlTableBody.append(addUrlRow('filename', urls.filename));
    urlTableBody.append(addUrlRow('path', urls.outputPath));

    if (bitrate) {
        urlTableBody.append(addUrlRow('storage', urls.storageUrl, [button_externalLink("console", urls.consoleUrl)]));

        if (urls.streamingUrl !== "") {
            urlTableBody.append(addUrlRow('streaming', urls.streamingUrl, [button_showPlayer(muxing_type, urls.streamingUrl)])) ;
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
        "output": urls.outputType || "(unhandled output type)",
        "host": urls.host || "(unhandled output type)" ,
        "urls": urlTable.prop('outerHTML'),
        "streams": addRefLinks(streams),
        "json_muxing": prettyPayload(json_muxing),
        "json_drm": prettyPayload(json_drm),
    };

    bmTables.muxings.row.add(row).draw();
    // hack suggested at https://datatables.net/forums/discussion/comment/156646#Comment_156646 to avoid race condition
    //setTimeout(function(){ muxingTable.draw(); }, 2000);
}

function addRefLinks(arrayOfIds) {
    let links = arrayOfIds.join("<br/>");
    let refs = arrayOfIds.join(",");

    let button = button_highlightRelatedElement(refs, "show");

    return `${links}<br/>${button}`;
}

function hideManifestTable() {
    $("table#manifests").hide();
}

function button_showPlayer(manifest_type, streamingUrl) {
    return `<button type="button" class="btn btn-xs btn-primary btn-start-play" data-streamType="${manifest_type}" data-streamUrl="${streamingUrl}">play</button>`;
}

function button_viewFile(url) {
    return `<button type="button" class="btn btn-xs btn-warning btn-view-file" data-url="${url}">view</button>`;
}


function button_externalLink(name, url) {
    return $(`<a class="btn btn-xs btn-secondary" href="${url}" target="_blank">${name}</a>`);
}

function button_highlightRelatedMuxingsForStream(data, type, row, meta) {
    return `<button type="button" class="btn btn-xs btn-info follow-ref-muxing" data-streamid="${data}">show</button>`;
}

function button_highlightRelatedElement(guid, label) {
    return `<button type="button" class="btn btn-xs btn-info follow-ref" data-ref="${guid}">${label}</button>`;
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

function addManifestRow(manifest, urls, manifestTree) {
    let urlTable = $('<table class="table table-sm table-hover urls"></table>');
    let urlTableBody = $('<tbody>');

    urlTableBody.append(addUrlRow('path', urls.outputPath));
    urlTableBody.append(
        addUrlRow(
            'storage',
            urls.storageUrl,
            [button_externalLink("console", urls.consoleUrl)]));
    urlTableBody.append(
        addUrlRow(
            'streaming',
            urls.streamingUrl,
            [button_showPlayer(manifest.type, urls.streamingUrl), button_viewFile(urls.streamingUrl)]));

    urlTable.append(urlTableBody);

    let row = {
        "manifestid": manifest.id,
        "manifest": manifest.type,
        "output": urls.outputType,
        "host": urls.host || "n/a",
        "urls": urlTable.prop('outerHTML'),
        "tree": prettyPayload(manifest)
    };

    if (manifestTree) {
        row['tree'] = makeManifestTreeDiv(manifestTree).prop('outerHTML')
    }

    bmTables.manifests.row.add(row).draw();
}

function makeManifestTreeDiv(node) {
    let ul = $('<div class="manifestResource">');

    // let head = $(`<div class="resourceType">${node.type}<div>`).appendTo(ul);
    ul.append($(`<div class="resourcePayload">${prettyPayload(node.payload)}<div>`));

    if (_.has(node.payload, 'muxingId')) {
        ul.append(button_highlightRelatedElement(node.payload.muxingId, "show muxing"))
    }
    if (_.has(node.payload, 'streamId')) {
        ul.append(button_highlightRelatedElement(node.payload.streamId, "show stream"))
    }

    if (_.has(node, 'children')) {
        node.children.forEach(c => {
            let li = $('<div class="resourceChildren">');
            ul.append(li);
            li.append(makeManifestTreeDiv(c))
        });
    }

    return ul;
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

function initPlayer(encodingId) {
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
}

function loadPlayer(streamType, stream) {
    showLoader();
    let source = {};

    switch (streamType) {
        case 'DashManifest':
        case 'DASH':
            source['dash'] = stream;
            if ('CENC' in drmKeys) {
                source['drm'] = {
                    clearkey: drmKeys['CENC']
                };
            }
            break;
        case 'HlsManifest':
        case 'HLS':
            source['hls'] = stream;
            break;
        case 'SmoothStreamingManifest':
        case 'SMOOTH':
            source['smooth'] = stream;
            break;
        case 'MP4':
            source['progressive'] = stream;
            break;
        default:
            console.error('Unable to create player source for stream type:', streamType)
    }

    $('#stream-url').html(stream);
    $('#stream-type').html(streamType);
    if (_.keys(drmKeys).length > 0) {
        $('#drm-types').html(_.keys(drmKeys).join(" + "));
    }

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

function loadViewer(url) {
    showLoader();
    $('#viewer-modal').modal('show');
    showFileContentFromUrl(url);
    hideLoader();
}

$(document).on('click', '.btn-start-play', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    let btn = $(this);

    let stream = btn.data('streamurl');
    let streamType = btn.data('streamtype');

    loadPlayer(streamType, stream)
});

$(document).on('click', '.btn-view-file', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    let btn = $(this);

    let fileUrl = btn.data('url');

    loadViewer(fileUrl)
});


$(document).on('hide.bs.modal', '#player-modal', function (e) {
    console.log("Pausing the player");
    player.pause()
});


// === Main

$(document).on('click', '.copy-me', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.shiftKey) {
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
    let muxingIds = window['apiHelper'].getMuxingIdsForStreamId(streamId);

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

    let apiClient = new bitmovinClient.default({apiKey: apiKey, tenantOrgId: tenantOrgId, debug: true});
    let apiHelper = new BitmovinHelper(apiClient);
    window['apiHelper'] = apiHelper;

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
                title: 'Encoding Name',
                className: 'copy-me'
            },
            {
                data: 'status',
                title: 'Status'
            },
            {
                data: 'version',
                title: 'Encoder Version'
            },
            {
                data: 'region',
                title: 'Cloud Region'
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
                data: "json_encoding",
                title: "Encoding",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            },
            {
                data: "json_start",
                title: "Start Configuration",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            }
        ],
        responsive: {
            details: {
                type: 'column',
                renderer: dataTable_renderHiddenColumns,
                target: '.more'  // jQuery selector as per doc - https://datatables.net/forums/discussion/57793/issue-with-using-responsive-and-a-last-column#latest
            }
        }
    });

    bmTables.manifests = $('#manifests').DataTable({
        dom: 'ift',
        ordering: true,
        paging: false,
        columns: [
            {
                data: null,
                title: "More",
                // a column just for the button controls
                className: 'control more',
                orderable: false,
                defaultContent: '',
            },
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
            },
            {
                data: "tree",
                title: "Manifest Configuration",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            }
        ],
        responsive: {
            details: {
                type: 'column',
                renderer: dataTable_renderHiddenColumns,
                target: '.more'  // jQuery selector as per doc - https://datatables.net/forums/discussion/57793/issue-with-using-responsive-and-a-last-column#latest
            }
        },
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
                data: null,
                title: "More",
                // a column just for the button controls
                className: 'control more',
                orderable: false,
                defaultContent: '',
            },
            {
                data: "muxing",
                title: "Muxing",
                orderable: false,
                // className: "none"
            },
            {
                data: "drm",
                title: "DRM",
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
                data: "json_muxing",
                title: "Muxing Configuration",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            },
            {
                data: "json_drm",
                title: "DRM Configuration",
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
                data: null,
                title: "More",
                // a column just for the button controls
                className: 'control more',
                orderable: false,
                defaultContent: '',
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
                data: "streamid",
                title: "Stream Id",
                className: "none copy-me"
            },
            {
                data: "streamid",
                title: "Muxings",
                className: "none",
                render: button_highlightRelatedMuxingsForStream,
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
            },
            {
                data: "jsonfilters",
                title: "Filters",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            },
            {
                data: "inputstreams",
                title: "Input Streams",
                // controls DataTables() responsive and force a child row
                className: "none copy-me"
            },
            {
                data: "inputinfo",
                title: "Input Analysis",
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

    if (apiKey === null) {
        throwError("No api key found. You must provide an <code>apiKey</code> (and optionally <code>tenangOrgId</code>) URL parameter");
    } else {
        let apiClient = new bitmovinClient.default({apiKey: apiKey, tenantOrgId: tenantOrgId, debug: true});
        let apiHelper = new BitmovinHelper(apiClient);
        window['apiHelper'] = apiHelper;

        const encodingId = getParameterByName('encodingId');
        if (encodingId) {
            $('#inputEncodingId').val(encodingId);
            try {
                processEncoding(apiHelper, encodingId);
            } catch (e) {
                throwError(e)
            }
        }
    }

});


function throwBitmovinError(msg) {
    throwError(msg.shortMessage, msg.message, msg.errorCode || msg.httpStatusCode )
}

function throwError(msg, detail, errorcode) {
    let msgNode = document.createElement("div");
    msgNode.classList.value = "alert alert-danger alert-dismissable fade show col-5";
    msgNode.setAttribute('role', 'alert');
    msgNode.insertAdjacentHTML("beforeend", msg);
    msgNode.insertAdjacentHTML('beforeend',
        '  <button type="button" class="close" data-dismiss="alert" aria-label="Close">\n' +
        '    <span aria-hidden="true">&times;</span>\n' +
        '  </button>');
    if (detail) {
        let p = document.createElement("pre");
        p.insertAdjacentHTML("beforeend", detail);
        msgNode.appendChild(p);
    }
    document.getElementById("errors").appendChild(msgNode);
}
