const BitmovinApi = window['bitmovin-api-sdk']

class BitmovinHelper {
    constructor(bitmovinApi) {
        this._api = bitmovinApi
    }

    // === Utilities: Bitmovin

    getEncoding(encodingId) {
        return this._api.encoding.encodings.get(encodingId);
    }

    getEncodingCustomData(encodingId) {
        return this._api.encoding.encodings.customdata.get(encodingId)
    }

    getEncodingStart(encodingId) {
        return this._api.encoding.encodings.getStartRequest(encodingId);
    }

    getMuxingsForEncodingId(encodingId) {

        return this._api.encoding.encodings.muxings.list(encodingId, {limit: 100})
    }

    getMuxingDetails(encodingId, muxing) {
        let muxingEndpointPath = this.getMuxingEndpointFromClassName(muxing.constructor.name);
        try {
            // return this._api.encoding.encodings.muxings[muxingEndpointPath].get(encodingId, muxing.id);
            return this._api.encoding.encodings.muxings.get(encodingId, muxing.id);
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

    getMuxingIdsForStreamId(streamId) {
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
        return this._api.encoding.encodings.streams.list(encodingId,{limit: 100})
    }

    getStreamForEncodingIdAndStreamId(encodingId, streamId) {
        return this._api.encoding.encodings.streams.get(encodingId, streamId)
    }

    getOutputType(outputId) {
        return this._api.encoding.outputs.type.get(outputId)
    }

    getCodecConfigurationType(configurationId) {
        return this._api.encoding.configurations.type.get(configurationId)
    }

    getOutputDetails(outputId, outputType) {
        // let objectName = BitmovinApi.Output._discriminatorMapping[outputType];
        // let endpoint = this.getOutputEndpointFromClassName(objectName);

        return this._api.encoding.outputs.get(outputId);
    }

    getInputDetails(inputId) {
        // let objectName = BitmovinApi.Output._discriminatorMapping[outputType];
        // let endpoint = this.getOutputEndpointFromClassName(objectName);

        return this._api.encoding.inputs.get(inputId);
    }

    getStreamIdsFromMuxing(muxing) {
        return muxing.streams.map(muxingstream => muxingstream.streamId )
    }

    getCodecConfigurationDetails(configurationId, codecType) {
        let className = BitmovinApi.CodecConfiguration._discriminatorMapping[codecType];
        // let mediaEndpointPath = this.getMediaTypeFromClassName(className);
        // let codecEndpointPath = this.getCodecEndpointFromClassName(className);
        try {
            // return this._api.encoding.configurations[mediaEndpointPath][codecEndpointPath].get(configurationId);
            return this._api.encoding.configurations.get(configurationId);
        } catch (e) {
            console.error("Codec configuration type not recognised or handled: " + className)
        }
    }

    getStreamFilters(encodingId, streamId) {
        return this._api.encoding.encodings.streams.filters.list(encodingId, streamId)
    }

    getFilterType(filterId) {
        return this._api.encoding.filters.type.get(filterId)
    }

    getFilterDetails(filterId, filterType) {
        let className = BitmovinApi.Filter._discriminatorMapping[filterType];
        let filterEndpointPath = this.getFilterEndpointFromClassName(className);
        try {
            return this._api.encoding.filters[filterEndpointPath].get(filterId);
        } catch (e) {
            console.error("Filter type not recognised or handled: " + className)
        }
    }

    getInputStreamType(encodingId, inputStreamId) {
        return this._api.encoding.encodings.inputStreams.type.get(encodingId, inputStreamId)
    }

    getInputStreamDetails(encodingId, inputStreamId) {
        try {
            return this._api.encoding.encodings.inputStreams.get(encodingId, inputStreamId);
        } catch (e) {
            console.error("InputStream type not recognised or handled: " + inputStreamType)
        }
    }

    getStreamInputDetails(encodingId, streamId) {
        try {
            return this._api.encoding.encodings.streams.input.get(encodingId, streamId);
        } catch (e) {
            console.error("Stream Input Details not found for stream: " + streamId)
        }
    }

    getStreamSprites(encodingId, streamId) {
        return this._api.encoding.encodings.streams.sprites.list(encodingId, streamId)
    }

    getStreamThumbnails(encodingId, streamId) {
        return this._api.encoding.encodings.streams.thumbnails.list(encodingId, streamId)
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
        var codec = this.getObjectNameFromClass(BitmovinApi.CodecConfiguration._discriminatorMapping, classname)
        return codec || "unknown"

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
        if (classname === undefined) {
            return "unknown"
        }
        if (classname.includes('Audio'))
            return "audio";
        if (classname.includes("Video"))
            return "video";
        return "unknown"
    }

    getCodecEndpointFromClassName(classname) {
        if (classname === undefined) {
            return "unknown"
        }
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

    getFilterEndpointFromClassName(classname) {
        classname = classname.replace("Filter", "");
        classname = classname.charAt(0).toLowerCase() + classname.substring(1);
        return classname
    }

    // --- Manifests

    getDashManifestsForEncodingId(encodingId) {
        return this._api.encoding.manifests.dash.list(q => q.encodingId(encodingId));
    }

    getHlsManifestsForEncodingId(encodingId) {
        return this._api.encoding.manifests.hls.list(q => q.encodingId(encodingId));
    }

    getSmoothManifestsForEncodingId(encodingId) {
        return this._api.encoding.manifests.smooth.list(q => q.encodingId(encodingId));
    }

    async getDashManifestResourceTree(manifestId) {
        let manifest = await this._api.encoding.manifests.dash.get(manifestId);
        let node = {
            "type": manifest.constructor.name,
            "payload": manifest
        };

        node.children = await this.getDashManifestResourceTree_periods(manifest.id);
        return node
    }

    async getDashManifestResourceTree_periods(manifestId) {
        let periods = await this._api.encoding.manifests.dash.periods.list(manifestId);

        return Promise.all(periods.items.map(async period => {
            let node = {
                "type": period.constructor.name,
                "payload": period
            };
            node.children = await this.getDashManifestResourceTree_adaptationsets(manifestId, period.id);
            return node
        }));
    }

    async getDashManifestResourceTree_adaptationsets(manifestId, periodId) {
        let adaptationsets = await Promise.all(
            ['audio', 'video', 'subtitle', 'image'].map(t => {
                return this._api.encoding.manifests.dash.periods.adaptationsets[t].list(manifestId, periodId);
            }
        ));
        adaptationsets = _.flatMap(adaptationsets, 'items');

        return Promise.all(adaptationsets.map(async adaptationset => {
            let node = {
                "type": adaptationset.constructor.name,
                "payload": adaptationset
            };
            node.children = await this.getDashManifestResourceTree_representations(manifestId, periodId, adaptationset.id);
            return node
        }));
    }

    async getDashManifestResourceTree_representations(manifestId, periodId, adaptationsetId) {
        let rkeys = _.keys(this._api.encoding.manifests.dash.periods.adaptationsets.representations);
        let representationTypes = _.differenceWith(rkeys, ['restClient']);

        let representations = await Promise.all(
            representationTypes.map(t => {
                    return this._api.encoding.manifests.dash.periods.adaptationsets.representations[t]
                        .list(manifestId, periodId, adaptationsetId);
                }
            ));
        representations = _.flatMap(representations, 'items');

        let drmrepresentations = await Promise.all(
            representationTypes.map(t => {
                try{
                    return this._api.encoding.manifests.dash.periods.adaptationsets.representations[t].drm
                        .list(manifestId, periodId, adaptationsetId).catch(error => {
                            return
                        });
                } catch (e) {
                    return
                }
            }));
        drmrepresentations = _.flatMap(drmrepresentations, 'items');

        let allrepresentations = [...representations, ...drmrepresentations];
        allrepresentations = _.filter(allrepresentations);

        return Promise.all(allrepresentations.map(async representation => {
            let node = {
                "type": representation.constructor.name,
                "payload": representation
            };
            return node
        }));
    }

    async getHlsManifestResourceTree(manifestId) {
        let manifest = await this._api.encoding.manifests.hls.get(manifestId);
        let node = {
            "type": manifest.constructor.name,
            "payload": manifest
        };

        const streams = await this.getHlsManifestResourceTree_streams(manifest.id);
        const media = await this.getHlsManifestResourceTree_medias(manifest.id);
        node.children = [...streams, ...media];

        return node
    }

    async getHlsManifestResourceTree_medias(manifestId) {
        let rkeys = _.keys(this._api.encoding.manifests.hls.media);
        let mediaTypes = _.differenceWith(rkeys, ['restClient', 'type', 'customTags']);

        let medias = await Promise.all(
            mediaTypes.map(t => {
                    return this._api.encoding.manifests.hls.media[t]
                        .list(manifestId);
                }
            ));
        medias = _.flatMap(medias, 'items');

        return Promise.all(medias.map(async media => {
            let node = {
                "type": media.constructor.name,
                "payload": media
            };
            return node
        }));
    }

    async getHlsManifestResourceTree_streams(manifestId) {
        let streams = await this._api.encoding.manifests.hls.streams.list(manifestId);

        return Promise.all(streams.items.map(async stream => {
            let node = {
                "type": stream.constructor.name,
                "payload": stream
            };
            return node
        }));
    }

    // --- Codec and stream naming

    makeStreamLabel(codecConfig, stream) {
        let mediaEndpointPath = this.getMediaTypeFromClassName(codecConfig.constructor.name);
        let codecLabel = this.getCodecNameFromClass(codecConfig.constructor.name);

        switch (mediaEndpointPath) {
            case "audio":
                return `ChannelLayout.${codecConfig.channelLayout} @ ${formatBitrate(codecConfig.bitrate)}`;
                break;
            case "video":
                let resolution = "";
                if (codecConfig.width && codecConfig.height) {
                    resolution = `${codecConfig.width}x${codecConfig.height}`
                } else if (codecConfig.width) {
                    resolution = `${codecConfig.width}w`
                } else if (codecConfig.height) {
                    resolution = `${codecConfig.height}h`
                }

                let framerate = codecConfig.rate ? `${codecConfig.rate}fps` : "";
                let streamMode = "";
                if (stream !== undefined && stream.mode && stream.mode.startsWith("PER_TITLE_TEMPLATE")) {
                    streamMode = "(PT)"
                }

                let bitrate = codecConfig.bitrate ? formatBitrate(codecConfig.bitrate) : "";

                return `${resolution} ${framerate} @ ${bitrate}${streamMode}`;
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
        urls.filename = fileName;
        urls.outputType = this.getOutputNameFromClass(output.constructor.name);

        if (output instanceof BitmovinApi.S3Output) {
            urls = this.computeS3Urls(urls, output.bucketName);
        } else if (output instanceof BitmovinApi.GcsOutput) {
            urls = this.computeGcsUrls(urls, output.bucketName);
        }

        outputPath = outputPath.replace(/\/+$/, '').replace(/^\/+/, '');
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



