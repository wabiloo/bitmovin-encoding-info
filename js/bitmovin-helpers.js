// === Utilities: Bitmovin

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

function getMuxingDrmDetails(encodingId, muxing, drm) {
    let muxingEndpointPath = getMuxingEndpointFromClassName(muxing.constructor.name);
    let drmEndpointPath = getDrmEndpointFromClassName(drm.constructor.name);

    return bitmovinApi.encoding.encodings.muxings[muxingEndpointPath].drm[drmEndpointPath].get(encodingId, muxing.id, drm.id)
}

function getMuxingIdsForStreamId(streamId) {
    let muxings = [];
    for (let [key, value] of Object.entries(mapMuxingsToStreams)) {
        if (value.includes(streamId))
            muxings.push(key);
    }
    return muxings
}

function isSegmentedMuxing(muxing) {
    return (muxing instanceof bitmovinApi.Fmp4Muxing
        || muxing instanceof bitmovinApi.TsMuxing
        || muxing instanceof bitmovinApi.WebmMuxing
        || muxing instanceof bitmovinApi.CmafMuxing)
}

function getStreamsForEncodingId(encodingId) {
    return bitmovinApi.encoding.encodings.streams.list(encodingId)
}

function getStreamForEncodingIdAndStreamId(encodingId, streamId) {
    return bitmovinApi.encoding.encodings.streams.get(encodingId, streamId)
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

function getCodecConfigurationType(configurationId) {
    return bitmovinApi.encoding.configurations.type.get(configurationId)
}

function getOutput(outputId, outputType) {
    // TODO - replace with generic mechanism
    if (outputType === "S3") {
        return bitmovinApi.encoding.outputs.s3.get(outputId);
    } else if (outputType === "GCS") {
        return bitmovinApi.encoding.outputs.gcs.get(outputId);
    }
}

function getStreamIdsFromMuxing(muxing) {
    return muxing.streams.map(muxingstream => muxingstream.streamId )
}

function getCodecConfigurationDetails(configurationId, codecType) {
    let className = bitmovinApi.CodecConfiguration.typeMap[codecType];
    let mediaEndpointPath = getMediaTypeFromClassName(className);
    let codecEndpointPath = getCodecEndpointFromClassName(className);
    try {
        return bitmovinApi.encoding.configurations[mediaEndpointPath][codecEndpointPath].get(configurationId);
    } catch (e) {
        console.error("Codec configuration type not recognised or handled: " + className)
    }
}

// --- Bitmovin Endpoint and Object name remapping

function getOutputNameFromClass(classname) {
    return getObjectNameFromClass(bitmovinApi.Output.typeMap, classname)
}

function getMuxingNameFromClass(classname) {
    return getObjectNameFromClass(bitmovinApi.Muxing.typeMap, classname)
}

function getDrmNameFromClass(classname) {
    return getObjectNameFromClass(bitmovinApi.Drm.typeMap, classname)
}

function getCodecNameFromClass(classname) {
    return getObjectNameFromClass(bitmovinApi.CodecConfiguration.typeMap, classname)
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

function getMediaTypeFromClassName(classname) {
    if (classname.includes('Audio'))
        return "audio";
    if (classname.includes("Video"))
        return "video";
}

function getCodecEndpointFromClassName(classname) {
    classname = classname.replace("Configuration", "");
    classname = classname.replace("Video", "");
    classname = classname.replace("Audio", "");
    classname = classname.toLowerCase();
    return classname
}

// --- Codec naming

function computeCodecConfigName(codecConfig) {
    let mediaEndpointPath = getMediaTypeFromClassName(codecConfig.constructor.name);
    let codecLabel = getCodecNameFromClass(codecConfig.constructor.name);

    let basename = `${codecLabel} ${numeral(codecConfig.bitrate).format('0b')}`;

    switch (mediaEndpointPath) {
        case "audio":
            return `${basename} ChannelLayout.${codecConfig.channelLayout}`;
            break;
        case "video":
            let resolution = codecConfig.width || codecConfig.height ? codecConfig.width +'x'+ codecConfig.height : "";
            return `${basename} ${resolution}`;
        default:
            return "(not handled by this tool correctly)";
    }
}


// === Utilities: URLs

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

// === Utilities: Generic

function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

