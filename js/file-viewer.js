
// string encoder
if (!String.prototype.encodeHTML) {
    String.prototype.encodeHTML = function () {
        return this.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };
}

// string decoder
if (!String.prototype.decodeHTML) {
    String.prototype.decodeHTML = function () {
        return this.replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    };
}

// get query parameters
function getJsonFromUrl() {
    var query = location.search.substr(1);
    var result = {};
    query.split("&").forEach(function(part) {
        var item = part.split("=");
        result[item[0]] = decodeURIComponent(item[1]);
    });
    return result;
}

// hyperlink stuff

function renderData(data) {
    // escape everything
    var encoded = data.encodeHTML();

    // replace "\r\n" sequences with just "\n"
    encoded = encoded.replace(new RegExp("\r\n", "g"), "\n");

    // look for "http://" links
    var linkedData = "";
    var lastLinkIndex = 0;
    while (true) {
        var nextLinkIndex = encoded.indexOf("http", lastLinkIndex);
        if (nextLinkIndex < 0) {
            linkedData += encoded.substring(lastLinkIndex);
            break;
        }
        if ((encoded.indexOf("http://", nextLinkIndex) != nextLinkIndex) && (encoded.indexOf("https://", nextLinkIndex) != nextLinkIndex)) {
            linkedData += encoded.substring(lastLinkIndex, nextLinkIndex + 4);
            lastLinkIndex = nextLinkIndex + 4;
            continue;
        }
        var nextQuote = encoded.indexOf("&quot;", nextLinkIndex + 1);
        var nextNewLine = encoded.indexOf("\n", nextLinkIndex + 1);
        var nextLessThan = encoded.indexOf("&lt;", nextLinkIndex + 1);
        if (nextQuote < 0 && nextNewLine < 0 && nextLessThan < 0) {
            alert("ERROR: didn't find an end for the link starting at " + nextLinkIndex + " in the string \"" + encoded.substring(lastLinkIndex) + "\"");
            break;
        }
        var linkEndIndex = nextQuote;
        if (linkEndIndex < 0 || (nextNewLine >= 0 && nextNewLine < linkEndIndex)) {
            linkEndIndex = nextNewLine;
        }
        if (linkEndIndex < 0 || (nextLessThan >= 0 && nextLessThan < linkEndIndex)) {
            linkEndIndex = nextLessThan;
        }
        var encodedLink = encoded.substring(nextLinkIndex, linkEndIndex);
        var rawLink = encodedLink.decodeHTML().decodeHTML();
        linkedData += encoded.substring(lastLinkIndex, nextLinkIndex) + "<a href=\"?url=" + encodeURIComponent(rawLink) + "\">" + encodedLink + "</a>";
        lastLinkIndex = linkEndIndex;
    }
    encoded = linkedData;

    // look for m3u8 links
    linkedData = "";
    lastLinkIndex = 0;
    while (true) {
        var nextLinkIndex = encoded.indexOf("#EXT-X-STREAM-INF", lastLinkIndex);
        if (nextLinkIndex < 0) {
            var nextLinkIndex = encoded.indexOf("#EXTINF", lastLinkIndex);
        }
        if (nextLinkIndex < 0) {
            linkedData += encoded.substring(lastLinkIndex);
            break;
        }
        var nextLinkIndex = encoded.indexOf("\n", nextLinkIndex + 1);
        if (nextLinkIndex < 0) {
            alert("ERROR: didn't find an end for the INF tag starting at " + nextLinkIndex + " in the string \"" + encoded.substring(lastLinkIndex) + "\"");
            break;
        }
        nextLinkIndex++ // skip the "\n"
        var linkEndIndex = encoded.indexOf("\n", nextLinkIndex + 1);
        if (linkEndIndex < 0) {
            linkEndIndex = encoded.length;
        }
        var encodedLink = encoded.substring(nextLinkIndex, linkEndIndex);
        if (encodedLink.indexOf("<") == 0 || encodedLink.indexOf("#") == 0) {
            // already captured via http or an empty #EXTINF
            linkedData += encoded.substring(lastLinkIndex, linkEndIndex);
        } else {
            var rawLink = encodedLink.decodeHTML().decodeHTML();
            var realLink = rawLink;
            if (rawLink.indexOf("http") != 0) {
                var url = $("#file-url").val();
                var baseUrl = url.substring(0, url.lastIndexOf("/"));
                realLink = baseUrl + "/" + rawLink;
            }
            linkedData += encoded.substring(lastLinkIndex, nextLinkIndex) + "<a href='#' class='openurl' data-url='" + realLink + "'>" + encodedLink + "</a>";
        }
        lastLinkIndex = linkEndIndex;
    }
    encoded = linkedData;

    // change the color of #EXT entries
    linkedData = "";
    lastLinkIndex = 0;
    while (true) {
        var nextLinkIndex = encoded.indexOf("#EXT", lastLinkIndex);
        if (nextLinkIndex < 0) {
            linkedData += encoded.substring(lastLinkIndex);
            break;
        }
        var nextColon = encoded.indexOf(":", nextLinkIndex + 1);
        var nextNewLine = encoded.indexOf("\n", nextLinkIndex + 1);
        var linkEndIndex = nextColon;
        if (nextColon < 0 && nextNewLine < 0) {
            // end of file
            linkEndIndex = encoded.length;
        } else if (nextColon < 0 || nextNewLine < nextColon) {
            linkEndIndex = nextNewLine;
        }
        linkedData += encoded.substring(lastLinkIndex, nextLinkIndex) + "<span class=\"ext\">" + encoded.substring(nextLinkIndex, linkEndIndex) + "</span>";
        lastLinkIndex = linkEndIndex;
    }
    encoded = linkedData;


    // show <hr>'s before discontinuities
    encoded = encoded.replace(new RegExp("\n<span class=\"ext\">#EXT-X-DISCONTINUITY", "g"), "<hr/><span class=\"ext\">#EXT-X-DISCONTINUITY");

    // show <hr>'s before stream-info
    encoded = encoded.replace(new RegExp("\n<span class=\"ext\">#EXT-X-STREAM-INF", "g"), "<hr/><span class=\"ext\">#EXT-X-STREAM-INF");

    // render it
    $("#content-viewer").html(encoded);
}

function getUrl(initUrl) {
    var url = initUrl;
    if (!url) {
        url = $("#file-url").val();
    }
    var fileStart = url.lastIndexOf("/");
    if (fileStart >= 0) {
        fileEnd = url.lastIndexOf("?");
        if (fileEnd < fileStart) {
            fileEnd = url.length;
        }
        $(document).prop("title", url.substring(fileStart + 1, fileEnd));
    }
    $.get(url, function(data) {
        renderData(data);
    }, "text");
}

function viewerKeyPress(e) {
    var key = e.keyCode || e.which;
    if (key==13) {
        getUrl();
    }
}

$(document).on('click', '.openurl', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    let btn = $(this);

    let currentUrl = $("#file-url").val();
    let newurl = btn.data('url');

    $("#previous-url").data('url', currentUrl);
    showFileContentFromUrl(newurl)
});

// Function only used when using this tool as the main page
function prep() {
    /*$.ajaxSetup({
        xhrFields: {
            withCredentials: true
        }
    });*/
    var params = getJsonFromUrl();
    if (params.url) {
        $("#file-url").val(params.url);
    }
    getUrl();
}

function showFileContentFromUrl(url) {
    $("#file-url").val(url);
    getUrl(url)
}