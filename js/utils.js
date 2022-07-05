function formatBitrate(data) {
    if (_.isNumber(data)) {
        var i = -1;
        var byteUnits = [' kbps', ' Mbps', ' Gbps', ' Tbps', 'Pbps', 'Ebps', 'Zbps', 'Ybps'];
        do {
            data = data / 1024;
            i++;
        } while (data > 1024);

        var out = Math.max(data, 0.1).toFixed(1) + byteUnits[i];
        return out;
    } else {
        return data;
    }
}


function formatDuration(data) {
    if (_.isNumber(data)) {
        return new Date(data * 1000).toISOString().substr(11, 8)
    } else {
        return undefined;
    }
}
