const apiKey = getParameterByName('apiKey');
const tenantOrgId = getParameterByName('tenantOrgId');
const bitmovinApi = window['bitmovin-api-sdk'].default({apiKey: apiKey, tenantOrgId: tenantOrgId, debug: true});

numeral.zeroFormat('N/A');
numeral.nullFormat('N/A');

const fieldDefs = {
    muxing: {
        pin: ['id', 'type', 'filename'],
        ignore: ['streams', 'outputs']
    },
    codec: {
        pin: [
            'id', 'mediaType', 'type', 'width', 'height', 'presetConfiguration', 'encodingMode', 'profile', 'level', 'rate',
            'bitrate', 'minBitrate', 'maxBitrate', 'bufsize'
        ],
        transform: {
            'bufsize': bitrateToString,
            'partitions': arrayToString,
        }
    },
    stream: {
        pin: ['id'],
        transform: {
            'conditions': conditionsToString,
            'metadata': extractLanguage,
            'appliedSettings': appliedSettingsToString,
            'inputStreams': inputStreamsToString
        }
    },
    encoding: {
        ignore: ['name', 'cloudRegion', 'infrastructure', 'infrastructureId', 'selectedEncodingMode', 'selectedCloudRegion', 'cssClass']
    },
    all: {
        ignore: ['createdAt', 'modifiedAt', 'description', 'customData'],
        transform: {
            'bitrate': bitrateToString,
            'maxBitrate': bitrateToString,
            'minBitrate': bitrateToString,
            'avgBitrate': bitrateToString,
            'ignoredBy': ignoredByToString
        },
        highlight: ['ignoredBy']
    }
};

class Rendition {
    constructor(encoding) {
        this._encoding = encoding;
    }

    get encoding() {
        return this._encoding
    }
    set encoding(encoding) {
        this._encoding = encoding;
    }
    get encodingId() {
        return this.encoding['id'];
    }

    get codec() {
        return this._codec
    }
    set codec(config) {
        this._codec = config;
    }

    get stream() {
        return this._stream
    }
    set stream(stream) {
        this._stream = stream
    }

    get muxing() {
        return this._muxing
    }
    set muxing(muxing) {
        this._muxing = muxing;
    }

    get cssClasses() {
        return [
            this.encoding['cssClass'],      // TODO - not a great way of assigning
            "codec" + this.codec['type'],
            "media" + this.codec['mediaType']
        ];
    }

    fieldsFor(resourceType) {
        switch (resourceType) {
            case "encoding":
                return this.encoding;
            case "codec":
                return this.codec;
            case "muxing":
                return this.muxing;
            case "stream":
                return this.stream;
        }
    }

    valueForField(resourceType, field) {
        let info = this.fieldsFor(resourceType);

        if (field in info) {
            return info[field]
        } else {
            return null
        }
    }
}

class RenditionSet {
    constructor() {
        this._renditions = []
    }

    add(rendition) {
        this._renditions.push((rendition))
    }

    get renditions() {
        return this._renditions
    }

    filter(filters) {
        let rends = this.renditions;
        if (_.isUndefined(filters) || filters === "") {
            filters = []
        }
        if (_.isString(filters)) {
            filters = filters.split(",")
        }

        // TODO - validate tuple better
        filters = _.reduce(filters, (result, f) => {
            f = _.trim(f);
            if (_.isEmpty(f)) {
                return result
            }

            let fc = f.split(":");

            if (fc.length === 1) {
                fc.unshift('type')
            }
            if (fc.length === 2) {
                fc.unshift('codec')
            }
            if (fc.length !== 3) {
                throwError(`Invalid filter "${fil}" - must be in the form resource:field:value`);
                return result
            }

            if (!(fc[0] in fieldDefs)) {
                throwError(`Invalid resource type "${fc[0]}"`);
                return result
            }
            if (!collectAllFields(rends, fc[0]).has(fc[1])) {
                throwError(`Invalid field name "${fc[1]}" for resource type "${fc[0]}"`);
                return result
            }

            // accumulate values for similar filters
            let existing = _.find(result, {0: fc[0], 1: fc[1]});
            if (existing) {
                existing[2].push(fc[2]);
            } else {
                result.push([fc[0], fc[1], [fc[2]]]);
            }

            return result
        }, []);

        console.log(filters);

        for (let fc of filters) {
            rends = _.filter(rends, r => {
                // TODO - too crude to do string comparisons!
                return fc[2].includes(_.toString(r.valueForField(fc[0], fc[1])));
            });
        }

        rends = _.sortBy(rends, [
            r => { return r.valueForField('codec', 'height') },
            r => { return r.valueForField('codec', 'bitrate') }]
        ).reverse();

        return rends;
    }
}

let encodings = [];
let renditions = new RenditionSet();

$(document).ready(function () {

    const encodingIds = getParameterByName('encodingIds');
    document.getElementById('inputEncodingIds').value = encodingIds;

    const filters = getParameterByName('filters');
    document.getElementById('simpleFilters').value = filters;

    expandFieldDefs();

    if (encodingIds) {
        processEncodings(encodingIds);
    }

});

async function processEncodings(encodingIds) {
    encodings = [];
    renditions = new RenditionSet();

    encodingIdList = encodingIds.split(",");
    await Promise.all(encodingIdList.map((id, i) => processEncoding(id, i)));

    // TODO - reflect changes to filters form in the URL
    // displayFilters(renditions);
    displaySimpleFilters();

    // trigger a filter change, which will display the table
    filtersChanged()
}

async function processEncoding(encodingId, i) {
    let encoding = await fetchEncodingInformation(encodingId);
    encoding['cssClass'] = "encoding"+i;
    encodings.push(encoding);
    addEncodingRow(encoding);

    await fetchMuxingOutputInformation(encoding);
}

async function fetchEncodingInformation(encodingId) {
    const encoding = await getEncoding(encodingId);
    console.log(encoding);
    return encoding
}

async function fetchMuxingOutputInformation(encoding) {
    // iterate through muxings
    const muxings = await getMuxingsForEncodingId(encoding.id);
    await Promise.all(muxings.items.map(async function(muxing)  {
        console.log("Partial muxing:", muxing);

        let rendition = new Rendition(encoding);

        await getMuxingDetails(encoding.id, muxing).then(fullmuxing => {
            console.log("Full muxing:", fullmuxing);
            fullmuxing['type'] = getMuxingNameFromClass(fullmuxing.constructor.name);

            rendition.muxing = fullmuxing
        });

        let streamIds = getStreamIdsFromMuxing(muxing);

        // TODO - something more clever than just picking the first stream...
        await fetchStreamAndCodecInformation(encoding.id, streamIds[0], rendition);

        renditions.add(rendition)
    }));

    return renditions;
}

async function fetchStreamAndCodecInformation(encodingId, streamId, rendition) {
    const stream = await getStreamForEncodingIdAndStreamId(encodingId, streamId);
    console.log("Full stream:", stream);

    rendition.stream = stream;

    const codecType = await getCodecConfigurationType(stream.codecConfigId);
    console.log("Codec Type: ", codecType);
    const codecConfig = await getCodecConfigurationDetails(stream.codecConfigId, codecType.type);
    codecConfig['type'] = codecType.type;
    codecConfig['mediaType'] = getMediaTypeFromClassName(codecConfig.constructor.name);
    console.log("Codec: ", codecConfig);

    rendition.codec = codecConfig;
}

function getStreamIdsFromMuxing(muxing) {
    return muxing.streams.map(muxingstream => muxingstream.streamId )
}


function arrayToString(value) {
    if (Array.isArray(value)) {
        return "[" + value.join(" ") + "]"
    } else {
        return value
    }

}

function bitrateToString(value) {
    return numeral(value).format('0,0')
}

function conditionsToString(value) {
    // TODO - handle more complex conditions
   return value.attribute + value.operator + value.value;
}

function extractLanguage(value) {
    return value.language
}

function ignoredByToString(value) {
    return "(" + value.map( v => {
        return v['ignoredBy']
    }).join(" + ") + ")";
}

function appliedSettingsToString(value) {
    return `(${value.width} x ${value.height})`
}

function inputStreamsToString(value) {
    // TODO - handle multiple strings

    let inputStream = value[0];
    if (inputStream.inputStreamId !== undefined) {
        return inputStream.inputStreamId
    } else {
        return inputStream.inputPath
    }
}

function collectAllFields(renditions, resourceType) {
    if (!(resourceType in fieldDefs)) {
        throwError(`Invalid resourceType ${resourceType}`)
    }

    let fieldSet = new Set(fieldDefs[resourceType]['pin']);

    renditions.forEach( rendition => {
        Object.getOwnPropertyNames(rendition.fieldsFor(resourceType)).forEach(key => {
            fieldSet.add(key)
        })
    });

    return fieldSet
}

function expandFieldDefs() {
    let resourceTypes = ['encoding', 'muxing', 'stream', 'codec'];
    for (resourceType of resourceTypes) {
        _.mergeWith(fieldDefs[resourceType], fieldDefs['all'], arrayMerger);
    }
}

function arrayMerger(objValue, srcValue) {
    if (_.isArray(objValue)) {
        return  _.uniq(objValue.concat(srcValue));
    }
}


// --- DOM ---

$(document).on('submit', '#inputEncodings', encodingsChanged);
$(document).on('submit', '#inputFilters', filtersChanged);

function encodingsChanged(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    resetTables();
    let encodingId = $('#inputEncodingIds').val();
    processEncodings(encodingId);

    // to prevent the submit to reload the page
    return false;
}

function filtersChanged(event) {
    let options = {
        'fieldFilter': document.getElementById('simpleFilters').value,
        'hideFieldsWithoutDiff': document.getElementById('diffFieldsOnly').checked
    };

    let encodings = document.getElementById('encodingsTable');
    let checkboxes = encodings.getElementsByTagName("input");

    let encodingFilter = "";
    for (chk of checkboxes) {
        if (chk.checked) {
            encodingFilter += chk.value + ","
        }
    }
    options['encodingFilter'] = encodingFilter;

    document.getElementById('errors').innerHTML = "";

    let table = document.getElementById('renditionsTable');
    table.innerHTML = "";
    displayRenditionTable(renditions, options);

    // to prevent the submit to reload the page
    return false;
}

function addEncodingRow(encoding) {
    let table = document.getElementById("encodingsTable").getElementsByTagName("tbody")[0];

    var row = document.createElement('tr');
    row.classList.add(encoding['cssClass']);
    table.appendChild(row);

    var cell = document.createElement('td');
    let chck = document.createElement('input');
    chck.setAttribute('type', 'checkbox');
    chck.setAttribute('value', "encoding:id:" + encoding.id);
    chck.setAttribute('id', encoding.id);
    chck.setAttribute('checked', 'checked');

    chck.addEventListener('click', filtersChanged);

    cell.appendChild(chck);
    row.appendChild(cell);

    for (let el of[encoding.id, encoding.name, encoding.createdAt]) {
        if (_.isDate(el)) {
            el = moment(el).format('DD-MMM-YYYY HH:mm:ss')
        }

        var cell = document.createElement('td');
        var label = document.createElement('label');
        label.setAttribute('for', encoding.id);
        label.appendChild(document.createTextNode(el));
        cell.appendChild(label);
        row.appendChild(cell);
    }
}

function displaySimpleFilters() {

}

// function displayFilters(renditions) {
//     let div = document.getElementById("filters");
//
//     let rowMedia = document.createElement('div');
//     div.appendChild(rowMedia);
//
//     // find unique media types
//     let mediaTypes = _.map(renditions, r => {
//         return r.codec['mediaType']
//     });
//     mediaTypes = _.uniq(mediaTypes);
//
//     for (let mediaType of mediaTypes) {
//         let span = document.createElement('span');
//         rowMedia.appendChild(span);
//         let l =  "media" + mediaType;
//         let chck = document.createElement('input');
//         chck.setAttribute('type', 'checkbox');
//         chck.setAttribute('id', l);
//         chck.setAttribute('value', l);
//         chck.setAttribute('checked', 'checked');
//         chck.addEventListener('click', hideElements);
//         let label = document.createElement('label');
//         label.setAttribute('for', l);
//         label.appendChild(document.createTextNode(mediaType));
//         span.appendChild(chck);
//         span.appendChild(label);
//     }
//
//     let rowCodec = document.createElement('div');
//     div.appendChild(rowCodec);
//
//     // find unique codec types
//     let codecTypes = _.map(renditions, r => {
//         return [r.codec['type'], r.codec['mediaType']]
//     });
//     codecTypes = _.uniqBy(codecTypes, c => {
//         return c[0];
//     });
//
//     for (let codecMediaPair of codecTypes) {
//         let span = document.createElement('span');
//         span.classList.add("media" + codecMediaPair[1]);
//         rowCodec.appendChild(span);
//         let l =  "codec" + codecMediaPair[0];
//         let chck = document.createElement('input');
//         chck.setAttribute('type', 'checkbox');
//         chck.setAttribute('id', l);
//         chck.setAttribute('value', l);
//         chck.setAttribute('checked', 'checked');
//         chck.addEventListener('click', hideElements);
//         let label = document.createElement('label');
//         label.setAttribute('for', l);
//         label.appendChild(document.createTextNode(codecMediaPair[0]));
//         span.appendChild(chck);
//         span.appendChild(label);
//     }
//
// }

function displayRenditionTable(renditions, options) {
    var table = document.createElement('table');
    table.classList.add('renditions');
    var tableBody = document.createElement('tbody');

    let rends = renditions.filter(options['encodingFilter'] + options['fieldFilter']);

    addRenditionHeader(tableBody, rends);
    addRenditionRowGroup(tableBody, rends, 'codec', options);
    addRenditionRowGroup(tableBody, rends, 'stream', options);
    addRenditionRowGroup(tableBody, rends, 'muxing', options);
    addRenditionRowGroup(tableBody, rends, 'encoding', options);

    table.appendChild(tableBody);
    document.getElementById('renditionsTable').appendChild(table);
}

function addRenditionHeader(tableBody, renditions) {

    let row = document.createElement('tr');
    let header = document.createElement('th');
    header.appendChild(document.createTextNode("#"));
    row.appendChild(header);
    tableBody.appendChild(row);

    for (let [i,r] of renditions.entries()) {
        var cell = document.createElement('td');
        cell.setAttribute('colspan', 2);
        cell.appendChild(document.createTextNode(i));
        row.appendChild(cell);
    }
}

function addRenditionRowGroup(tableBody, renditions, resourceType, options) {

    let row = document.createElement('tr');
    row.classList.add('headerrow');
    let header = document.createElement('th');
    header.setAttribute("colspan", renditions.length *2 + 1);
    header.appendChild(document.createTextNode(resourceType));
    row.appendChild(header);
    tableBody.appendChild(row);

    addRenditionRowCells(tableBody, renditions, resourceType, options)
}

function addRenditionRowCells(tableBody, renditions, resourceType, options) {
    fieldSet = collectAllFields(renditions, resourceType);
    for (let [i, field] of Array.from(fieldSet).entries()) {
        // skip if field it to be ignored
        if (fieldDefs[resourceType]['ignore'].includes(field)) {
            continue;
        }

        var row = document.createElement('tr');
        row.classList.add("row" + (i % 2));

        var header = document.createElement('th');
        header.appendChild(document.createTextNode(field));
        row.appendChild(header);

        // check if the value is the same across all renditions
        let uniqueValues = _.uniqWith(
            _.map(renditions, r => {
                return r.valueForField(resourceType, field)
            }),
            _.isEqual
        );
        _.remove(uniqueValues, v => {
            return v === undefined || v === "" || v === null
        });

        if (uniqueValues.length <= 1 && options['hideFieldsWithoutDiff']) {
            continue;
        }

        renditions.forEach(r => {
            let val = r.valueForField(resourceType, field);
            var cell = document.createElement('td');

            for (c of r.cssClasses) {
                cell.classList.add(c);
            }

            // null = field not applicable to that particular rendition
            if (val === null) {
                cell.classList.add("notapplicable")
            }

            // if all values are the same for all renditions, mute them
            if (uniqueValues.length <= 1) {
                cell.classList.add('nodiff')
            } else {
                cell.classList.add('diff');
            }

            // if there are 2 groups of values, highlight the difference
            if (renditions.length > 3 && uniqueValues.length === 2) {
                let pos = _.findIndex(uniqueValues, (v) => {
                    return _.isEqual(v, val)
                });
                cell.classList.add('diff' + (pos + 1))
            }

            // if field is to be highlighted
            if (fieldDefs[resourceType]['highlight'].includes(field)) {
                cell.classList.add('highlight')
            }

            cell.appendChild(document.createTextNode(
                renderValue(val, field, resourceType)
            ));
            row.appendChild(cell);

            var white = document.createElement('td');
            white.classList.add("margin");
            row.appendChild(white)
        });

        tableBody.appendChild(row);
    }
}

function renderValue(val, field, resourceType) {
    if (val !== undefined && val !== null) {
        if (field in fieldDefs[resourceType]['transform']) {
            val = fieldDefs[resourceType]['transform'][field](val)
        }
    } else {
        val = "";
    }

    return val
}


// function hideElements(e) {
//     let className = e.srcElement.value;
//
//     let table = document.getElementById('renditionsTable');
//     let filters = document.getElementById('filters');
//     for (h of [table, filters]) {
//         for (el of h.getElementsByClassName(className)) {
//             el.classList.toggle('hide');
//         }
//     }
// }

function throwError(msg) {
    let msgNode = document.createElement("div");
    msgNode.classList.value = "alert alert-danger alert-dismissable fade show col-5";
    msgNode.setAttribute('role', 'alert');
    msgNode.appendChild(document.createTextNode(msg));
    msgNode.insertAdjacentHTML('beforeend',
        '  <button type="button" class="close" data-dismiss="alert" aria-label="Close">\n' +
        '    <span aria-hidden="true">&times;</span>\n' +
        '  </button>');
    document.getElementById("errors").appendChild(msgNode);
}

function resetTables() {
    document.getElementById('renditionsTable').innerHTML = "";
    document.getElementById('encodingsTable').getElementsByTagName('tbody')[0].innerHTML = "";
    document.getElementById('errors').innerHTML = "";
}