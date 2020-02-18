const BitmovinApi = window['bitmovin-api-sdk']

class BitmovinHelper {
    constructor(bitmovinApi) {
        this._api = bitmovinApi
    }

    // === Utilities: Bitmovin

    getEncoding(encodingId) {
        return this._api.encoding.encodings.get(encodingId);
    }

    getMuxingsForEncodingId(encodingId) {
        return this._api.encoding.encodings.muxings.list(encodingId)
    }

    getMuxingDetails(encodingId, muxing) {
        let muxingEndpointPath = this.getMuxingEndpointFromClassName(muxing.constructor.name);
        try {
            return this._api.encoding.encodings.muxings[muxingEndpointPath].get(encodingId, muxing.id);
        } catch (e) {
            console.error("Muxing type not recognised or handled: " + muxing.constructor.name)
        }
    }

    getMuxingDrms(encodingId, muxing) {
        let muxingEndpointPath = this.getMuxingEndpointFromClassName(muxing.constructor.name);

        return this._api.encoding.encodings.muxings[muxingEndpointPath].drm.list(encodingId, muxing.id)
    }

    getMuxingDrmDetails(encodingId, muxing, drm) {
        let muxingEndpointPath = this.getMuxingEndpointFromClassName(muxing.constructor.name);
        let drmEndpointPath = this.getDrmEndpointFromClassName(drm.constructor.name);

        return this._api.encoding.encodings.muxings[muxingEndpointPath].drm[drmEndpointPath].get(encodingId, muxing.id, drm.id)
    }

    static getMuxingIdsForStreamId(streamId) {
        let muxings = [];
        for (let [key, value] of Object.entries(mapMuxingsToStreams)) {
            if (value.includes(streamId))
                muxings.push(key);
        }
        return muxings
    }

    isSegmentedMuxing(muxing) {
        return (muxing instanceof BitmovinApi.Fmp4Muxing
            || muxing instanceof BitmovinApi.TsMuxing
            || muxing instanceof BitmovinApi.WebmMuxing
            || muxing instanceof BitmovinApi.CmafMuxing)
    }

    getStreamsForEncodingId(encodingId) {
        return this._api.encoding.encodings.streams.list(encodingId)
    }

    getStreamForEncodingIdAndStreamId(encodingId, streamId) {
        return this._api.encoding.encodings.streams.get(encodingId, streamId)
    }

    getDashManifestsForEncodingId(encodingId) {
        return this._api.encoding.manifests.dash.list(q => q.encodingId(encodingId));
    }

    getHlsManifestsForEncodingId(encodingId) {
        return this._api.encoding.manifests.hls.list(q => q.encodingId(encodingId));
    }

    getSmoothManifestsForEncodingId(encodingId) {
        return this._api.encoding.manifests.smooth.list(q => q.encodingId(encodingId));
    }

    getOutputType(outputId) {
        return this._api.encoding.outputs.type.get(outputId)
    }

    getCodecConfigurationType(configurationId) {
        return this._api.encoding.configurations.type.get(configurationId)
    }

    getOutputDetails(outputId, outputType) {
        let objectName = BitmovinApi.Output._discriminatorMapping[outputType];
        let endpoint = this.getOutputEndpointFromClassName(objectName);

        return this._api.encoding.outputs[endpoint].get(outputId);

        // TODO - replace with generic mechanism
        if (outputType === "S3") {
            return this._api.encoding.outputs.s3.get(outputId);
        } else if (outputType === "GCS") {
            return this._api.encoding.outputs.gcs.get(outputId);
        } else {
            console.error("Output type not yet handled by this tool: " + outputType);
            return false
        }
    }

    getStreamIdsFromMuxing(muxing) {
        return muxing.streams.map(muxingstream => muxingstream.streamId )
    }

    getCodecConfigurationDetails(configurationId, codecType) {
        let className = BitmovinApi.CodecConfiguration._discriminatorMapping[codecType];
        let mediaEndpointPath = this.getMediaTypeFromClassName(className);
        let codecEndpointPath = this.getCodecEndpointFromClassName(className);
        try {
            return this._api.encoding.configurations[mediaEndpointPath][codecEndpointPath].get(configurationId);
        } catch (e) {
            console.error("Codec configuration type not recognised or handled: " + className)
        }
    }

    // --- Bitmovin Endpoint and Object name remapping

    getOutputNameFromClass(classname) {
        return this.getObjectNameFromClass(BitmovinApi.Output._discriminatorMapping, classname)
    }

    getMuxingNameFromClass(classname) {
        return this.getObjectNameFromClass(BitmovinApi.Muxing._discriminatorMapping, classname)
    }

    getDrmNameFromClass(classname) {
        return this.getObjectNameFromClass(BitmovinApi.Drm._discriminatorMapping, classname)
    }

    getCodecNameFromClass(classname) {
        return this.getObjectNameFromClass(BitmovinApi.CodecConfiguration._discriminatorMapping, classname)
    }

    getObjectNameFromClass(object, classname) {
        return Object.keys(object).find(key => object[key] === classname);
    }

    getMuxingEndpointFromClassName(classname) {
        classname = classname.replace("Muxing", "");
        classname = classname.charAt(0).toLowerCase() + classname.substring(1);
        return classname
    }

    getDrmEndpointFromClassName(classname) {
        classname = classname.replace("Drm", "");
        classname = classname.replace("Encryption", "");
        classname = classname.toLowerCase();
        return classname
    }

    getMediaTypeFromClassName(classname) {
        if (classname.includes('Audio'))
            return "audio";
        if (classname.includes("Video"))
            return "video";
    }

    getCodecEndpointFromClassName(classname) {
        classname = classname.replace("Configuration", "");
        classname = classname.replace("Video", "");
        classname = classname.replace("Audio", "");
        classname = classname.toLowerCase();
        return classname
    }

    getOutputEndpointFromClassName(classname) {
        classname = classname.replace("Output", "");
        classname = classname.charAt(0).toLowerCase() + classname.substring(1);
        return classname
    }

    // --- Codec naming

    computeCodecConfigName(codecConfig) {
        let mediaEndpointPath = this.getMediaTypeFromClassName(codecConfig.constructor.name);
        let codecLabel = this.getCodecNameFromClass(codecConfig.constructor.name);

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

    computeS3Urls(urls, bucketName) {
        let streamingUrl = "https://" + bucketName + ".s3.amazonaws.com" ;
        let storageUrl = "s3://" + bucketName;
        let consoleUrl = "https://s3.console.aws.amazon.com/s3/buckets/" + bucketName;

        urls.host = bucketName;
        urls.streamingUrl = streamingUrl;
        urls.storageUrl = storageUrl;
        urls.consoleUrl = consoleUrl;

        return urls
    }

    computeGcsUrls(urls, bucketName) {
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

    async computeUrls(outputId, outputPath, fileName) {
        const outputType = await this.getOutputType(outputId);
        const output = await this.getOutputDetails(outputId, outputType.type);

        let urls = {};
        urls.outputType = this.getOutputNameFromClass(output.constructor.name);

        if (output instanceof BitmovinApi.S3Output) {
            urls = this.computeS3Urls(urls, output.bucketName);
        } else if (output instanceof BitmovinApi.GcsOutput) {
            urls = this.computeGcsUrls(urls, output.bucketName);
        }

        let lastChar = outputPath.substr(-1);
        if (lastChar === "/") {
            outputPath = outputPath.slice(0, -1);
        }
        urls.outputPath = outputPath;

        urls.streamingUrl = urls.streamingUrl || "(undefined)";
        urls.storageUrl = urls.storageUrl || "(undefined)";
        urls.consoleUrl = urls.consoleUrl || "(undefined)";

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



