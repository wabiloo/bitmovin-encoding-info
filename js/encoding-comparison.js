const apiKey = getParameterByName('apiKey');
const tenantOrgId = getParameterByName('tenantOrgId');
const bitmovinClient = window['bitmovin-api-sdk'];

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
        ignore: ['codecConfigId'],
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
        highlight: ['ignoredBy'],
        nonSignificant: ['name', 'id', 'description']
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
        if (!(resourceType in fieldDefs)) {
            throwError(`Invalid resourceType ${resourceType}`)
        }
        return this[resourceType];
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
    constructor(arr = []) {
        this._renditions = arr
    }

    add(rendition) {
        this._renditions.push((rendition))
    }

    get renditions() {
        return this._renditions
    }

    collectFields(resourceType) {
        if (!(resourceType in fieldDefs)) {
            throwError(`Invalid resourceType ${resourceType}`)
        }

        let fieldSet = new Set(fieldDefs[resourceType]['pin']);

        this.renditions.forEach( rendition => {
            Object.getOwnPropertyNames(rendition.fieldsFor(resourceType)).forEach(key => {
                fieldSet.add(key)
            })
        });

        return fieldSet
    }

    uniqueValuesForField(resourceType, field) {
        let uniqueValues = _.uniqWith(
            _.map(this.renditions, r => {
                return r.valueForField(resourceType, field)
            }),
            _.isEqual
        );
        _.remove(uniqueValues, v => {
            return v === null;
            // return v === undefined || v === "" || v === null
        });
        return uniqueValues
    }

    canonicalPointers(filters, needsValue=true) {
        let countPlaces = needsValue ? 3 : 2;
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

            if (fc.length === countPlaces - 2) {
                fc.unshift('type')
            }
            if (fc.length === countPlaces - 1) {
                fc.unshift('codec')
            }
            if (needsValue && fc.length !== 3) {
                throwError(`Invalid filter "${fil}" - must be in the form resource:field:value`);
                return result
            }

            if (!(fc[0] in fieldDefs)) {
                throwError(`Invalid resource type "${fc[0]}"`);
                return result
            }
            if (!this.collectFields(fc[0]).has(fc[1])) {
                throwError(`Invalid field name "${fc[1]}" for resource type "${fc[0]}". Filter ignored.`);
                return result
            }

            // accumulate values for similar filters
            if (needsValue) {
                let existing = _.find(result, {0: fc[0], 1: fc[1]});
                if (existing) {
                    existing[2].push(fc[2]);
                } else {
                    result.push([fc[0], fc[1], [fc[2]]]);
                }
            } else {
                result.push([fc[0], fc[1]]);
            }

            return result
        }, []);

        console.log(filters);
        return filters
    }

    filter(filters, groups) {
        let rends = this.renditions;

        filters = this.canonicalPointers(filters);

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

        groups = this.canonicalPointers(groups, false);
        if (_.isEmpty(groups)) {
            groups = [['codec', 'type']]
        }
        let groupedRends = _.groupBy(rends,
            r => {
                return renderValue(
                    r.valueForField(groups[0][0], groups[0][1]),
                    groups[0][1],
                    groups[0][0])
            }
        );

        return new GroupedRenditionSet(groupedRends, groups[0]);
    }
}

class GroupedRenditionSet {
    constructor(map = [], pointer) {
        this._renditionMap = _.mapValues(map, g => {
            return new RenditionSet(g)
        });
        this._groupPointer = pointer
    }

    get groupField() {
        return this._groupPointer
    }

    get renditionSets() {
        return _.values(this._renditionMap)
    }

    get renditions() {
        return _.flatMap(this._renditionMap, `renditions`);
    }

    entries() {
        return _.entries(this._renditionMap)
    }

    collectFields(resourceType) {
        return new Set(_.uniq(_.flatMap(this._renditionMap, rs => {
            return Array.from(rs.collectFields(resourceType))
        })));
    }

    uniqueValuesForField(resourceType, field) {
        let values = _.flatMap(this._renditionMap, r => {
            return r.uniqueValuesForField(resourceType, field)
        });
        return _.uniqWith(values, _.isEqual)
    };
}

let allRenditions = new RenditionSet();

$(document).ready(function () {

    let encodingIds = getParameterByName('encodingIds');
    encodingIds = encodingIds.replace(/,/g, ',\n');
    document.getElementById('inputEncodingIds').value = encodingIds;

    const filters = getParameterByName('filters');
    document.getElementById('simpleFilters').value = filters;

    const groupby = getParameterByName('groupBy');
    document.getElementById('simpleGroups').value = groupby;

    expandFieldDefs();

    if (encodingIds) {
        processEncodings(encodingIds);
    }

});

async function processEncodings(encodingIds) {
    allRenditions = new RenditionSet();

    let encodingIdList = encodingIds.split(",");
    await Promise.all(encodingIdList.map(async (id, i) =>  {
        id = _.trim(id);
        let idParts = id.split(':');
        if (idParts.length === 1) {
            idParts.unshift(apiKey)
        }
        if (idParts.length === 2) {
            idParts.splice(1,0, tenantOrgId);
        }
        console.log("Encoding Identifier", idParts);

        await processEncoding(idParts[2], idParts[0], idParts[1], i)
    }));

    // TODO - reflect changes to filters form in the URL
    // displayFilters(allRenditions);
    displaySimpleFilters();

    // trigger a filter change, which will display the table
    filtersChanged()
}

async function processEncoding(encodingId, apiKey, tenantOrgId, i) {
    if (apiKey === null) {
        throwError("No api key found. If you don't specify an api key on the encoding tuple, " +
            "you must provide a default one through a " +
            "<code>apiKey</code> (and optionally <code>tenangOrgId</code>) URL parameter")
        return;
    }

    let apiClient = new bitmovinClient.default({apiKey: apiKey, tenantOrgId: tenantOrgId, debug: true});
    let apiHelper = new BitmovinHelper(apiClient);

    let encoding = await fetchEncodingInformation(apiHelper, encodingId);
    if (encoding) {
        encoding['cssClass'] = "encoding"+i;
        addEncodingRow(encoding);

        await fetchMuxingOutputInformation(apiHelper, encoding);

        document.getElementById("loader-" + encodingId).innerHTML = ""
    }
}

async function fetchEncodingInformation(apiHelper, encodingId) {
    try {
        let encoding;
        encoding = await apiHelper.getEncoding(encodingId);
        console.log(encoding);
        return encoding
    } catch (e) {
        throwError(`${e.name} (${e.errorCode}) - ${e.developerMessage}`, `${e.details[0].text}`)
        return
    }
}

async function fetchMuxingOutputInformation(apiHelper, encoding) {
    // iterate through muxings
    const muxings = await apiHelper.getMuxingsForEncodingId(encoding.id);
    await Promise.all(muxings.items.map(async function(muxing)  {
        console.log("Partial muxing:", muxing);

        let rendition = new Rendition(encoding);

        await apiHelper.getMuxingDetails(encoding.id, muxing).then(fullmuxing => {
            console.log("Full muxing:", fullmuxing);
            fullmuxing['type'] = apiHelper.getMuxingNameFromClass(fullmuxing.constructor.name);

            rendition.muxing = fullmuxing
        });

        // TODO - Handle DRM!

        let streamIds = apiHelper.getStreamIdsFromMuxing(muxing);

        // TODO - something more clever than just picking the first stream...
        for (streamId of streamIds) {
            let r = _.cloneDeep(rendition);
            await fetchStreamAndCodecInformation(apiHelper, encoding.id, streamId, r);
            allRenditions.add(r)
        }

    }));

    return allRenditions;
}

async function fetchStreamAndCodecInformation(apiHelper, encodingId, streamId, rendition) {
    const stream = await apiHelper.getStreamForEncodingIdAndStreamId(encodingId, streamId);
    console.log("Full stream:", stream);

    rendition.stream = stream;

    const codecType = await apiHelper.getCodecConfigurationType(stream.codecConfigId);
    console.log("Codec Type: ", codecType);
    const codecConfig = await apiHelper.getCodecConfigurationDetails(stream.codecConfigId, codecType.type);
    codecConfig['type'] = codecType.type;
    codecConfig['mediaType'] = apiHelper.getMediaTypeFromClassName(codecConfig.constructor.name);
    console.log("Codec: ", codecConfig);

    rendition.codec = codecConfig;
}

// - Value Transformation functions

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
    return value.map( v => {
        return v['ignoredBy']
    }).join(" + ");
}

function appliedSettingsToString(value) {
    return `${value.width} x ${value.height}`
}

function inputStreamsToString(value) {
    // TODO - handle multiple strings

    let inputStream = value[0];
    if (inputStream.inputStreamId !== undefined) {
        return inputStream.inputStreamId
    } else {
        return "... " + inputStream.inputPath.split('/').slice(-1)
    }
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
    resetTables();
    event.stopPropagation();
    event.stopImmediatePropagation();
    let encodingId = $('#inputEncodingIds').val();
    processEncodings(encodingId);

    // to prevent the submit to reload the page
    return false;
}

function filtersChanged(event) {
    let options = {
        'fieldFilter': document.getElementById('simpleFilters').value,
        'groupBy': document.getElementById('simpleGroups').value,
        'hideFieldsWithoutDiff': document.getElementById('diffFieldsOnly').checked,
        'hideNonSignificantFields': document.getElementById('noDescFields').checked
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

    let table = document.getElementById('renditionsTable');
    table.innerHTML = "";
    displayRenditionTable(allRenditions, options);

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

    row.insertAdjacentHTML("beforeend",
        `<td class="loader mr-sm-4" id="loader-${encoding.id}">` +
        `  <img src="img/loading_animation_dark.gif" height="15">` +
        `</td>`)

}

function displaySimpleFilters() {

}

// function displayFilters(allRenditions) {
//     let div = document.getElementById("filters");
//
//     let rowMedia = document.createElement('div');
//     div.appendChild(rowMedia);
//
//     // find unique media types
//     let mediaTypes = _.map(allRenditions, r => {
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
//     let codecTypes = _.map(allRenditions, r => {
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

    let rends = renditions.filter(options['encodingFilter'] + options['fieldFilter'], options['groupBy']);

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
    row.classList.add("count-headers");
    let header = document.createElement('th');
    header.appendChild(document.createTextNode("#"));
    row.appendChild(header);
    tableBody.appendChild(row);

    for (let [i,r] of renditions.renditions.entries()) {
        var cell = document.createElement('td');
        cell.setAttribute('colspan', 2);
        cell.appendChild(document.createTextNode(i));
        row.appendChild(cell);
    }

    let groupRow = document.createElement('tr');
    let groupHeader = document.createElement('th');
    groupHeader.appendChild(document.createTextNode("group"));
    groupRow.appendChild(groupHeader);
    tableBody.appendChild(groupRow);

    for (const [groupkey, group] of renditions.entries()) {
        let white = document.createElement('td');
        white.classList.add("margin");
        groupRow.appendChild(white);

        var cell = document.createElement('td');
        cell.classList.add('group-header');
        cell.setAttribute('colspan', group.renditions.length*2-1);
        cell.appendChild(document.createTextNode(renditions.groupField.join(':') + " = " + groupkey));
        groupRow.appendChild(cell);
    }
}

function addRenditionRowGroup(tableBody, renditions, resourceType, options) {

    let row = document.createElement('tr');
    row.classList.add('headerrow');
    let header = document.createElement('th');
    header.setAttribute("colspan", renditions.renditions.length *2 + 1);
    header.appendChild(document.createTextNode(resourceType));
    row.appendChild(header);
    tableBody.appendChild(row);

    addRenditionRowCells(tableBody, renditions, resourceType, options)
}

function addRenditionRowCells(tableBody, renditions, resourceType, options) {
    fieldSet = renditions.collectFields(resourceType);
    for (let [i, field] of Array.from(fieldSet).entries()) {
        // skip if field it to be ignored
        if (fieldDefs[resourceType]['ignore'].includes(field)) {
            continue;
        }

        // skip non-significant fields if part of the options
        if (options['hideNonSignificantFields'] && fieldDefs[resourceType]['nonSignificant'].includes(field)) {
            continue;
        }

        var row = document.createElement('tr');
        row.classList.add("row" + (i % 2));

        var header = document.createElement('th');
        header.appendChild(document.createTextNode(field));
        row.appendChild(header);

        // check if the value is the same across all renditions (across all groups)
        let uniqueValues = renditions.uniqueValuesForField(resourceType, field);

        if (uniqueValues.length <= 1 && options['hideFieldsWithoutDiff']) {
            continue;
        }

        for (const [groupkey, group] of renditions.entries()) {
            for ([j,r] of group.renditions.entries()) {
                {
                    let uniqueGroupValues = group.uniqueValuesForField(resourceType, field);
                    let val = r.valueForField(resourceType, field);

                    var white = document.createElement('td');
                    white.classList.add("margin");
                    if (j === 0) {
                        white.classList.add("groupmargin");
                    } else if (uniqueValues.length > 1 && uniqueGroupValues.length <= 1) {
                        if (val !== null) {
                            white.classList.add('groupdiff');
                        }
                    }
                    row.appendChild(white);

                    var cell = document.createElement('td');
                    cell.classList.add('valuecell');

                    for (c of r.cssClasses) {
                        cell.classList.add(c);
                    }

                    // null = field not applicable to that particular rendition
                    if (val === null) {
                        cell.classList.add("notapplicable")
                    } else {
                        // color code diff
                        if (uniqueGroupValues.length > 1) {
                            cell.classList.add('diff');
                        } else if (uniqueValues.length > 1) {
                            cell.classList.add('groupdiff');
                        } else {
                            cell.classList.add('nodiff')
                        }
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

                    let cellVal = renderValue(val, field, resourceType);

                    cell.appendChild(document.createTextNode(cellVal));

                    if (val !== undefined && val !== null && !_.isEqual(cellVal, val)) {
                        cell.classList.add("derived")
                    }

                    row.appendChild(cell);

                }
            }
        }

        tableBody.appendChild(row);
    }
}

function renderValue(val, field, resourceType) {
    if (val !== undefined && val !== null && val !== "undefined") {
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
        let p = document.createElement("p");
        p.insertAdjacentHTML("beforeend", detail);
        msgNode.appendChild(p);
    }
    document.getElementById("errors").appendChild(msgNode);
}

function resetTables() {
    document.getElementById('renditionsTable').innerHTML = "";
    document.getElementById('encodingsTable').getElementsByTagName('tbody')[0].innerHTML = "";
    document.getElementById('errors').innerHTML = "";
}
