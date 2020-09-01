// inspired from https://github.com/center-key/pretty-print-json

const prettyPrintJson = {

    version: '0.2.2',

    toHtml(thing, options) {
        const defaults = { indent: 3, quoteKeys: false };
        const settings = { ...defaults, ...options };

        const specificKeyClasses = {
            "^createdAt$": "mute",
            "^modifiedAt$": "mute",
            "^id$": "id",
            "^.*Id$": "ref"
        };

        const htmlEntities = (string) => {
            // Makes text displayable in browsers
            return string
                .replace(/&/g,   '&amp;')
                .replace(/\\"/g, '&bsol;&quot;')
                .replace(/</g,   '&lt;')
                .replace(/>/g,   '&gt;');
        };
        const keySpecificClass = (key) => {
            if (key) {
                const keyName = key.replace(/"([\w]+)": |(.*): /, '$1$2');
                for (let [k,c] of Object.entries(specificKeyClasses)) {
                    r = new RegExp(k);
                    if (keyName.match(r)) {
                        return "json-" + c
                    }
                }
            }
            return ""
        };
        const buildKeyHtml = (key) => {
            const html = '<span class="json-key ' + keySpecificClass(key) + '">' + key + '</span>';
            return settings.quoteKeys ? '"' + html + '": ' : html + ": "
        };
        const buildValueHtml = (value, key) => {
            // Returns a string like: "<span class=json-number>3.1415</span>"
            const strType =  /^"/.test(value) && 'string';
            const boolType = ['true', 'false'].includes(value) && 'boolean';
            const nullType = value === 'null' && 'null';
            const type =     boolType || nullType || strType || 'number';
            const pureValue = strType ? value.replace(/"(.*)"/, '$1') : value;
            const htmlValue = '<span class="json-scalar json-' + type + ' ' + keySpecificClass(key) + '">' + pureValue + '</span>';
            return strType ? '"' + htmlValue + '"' : htmlValue
        };
        const replacer = (match, p1, p2, p3, p4) => {
            // Converts the four parenthesized capture groups (indent, key, value, end) into HTML
            const part =       { indent: p1, key: p2, value: p3, end: p4 };
            const findName =   settings.quoteKeys ? /(.*)(): / : /"([\w]+)": |(.*): /;
            const indentHtml = part.indent || '';
            const keyName =    part.key && part.key.replace(/"([\w]+)": |(.*): /, '$1$2');
            const keyHtml =    part.key ? buildKeyHtml(keyName) : '';
            const valueHtml =  part.value ? buildValueHtml(part.value, keyName) : '';
            const endHtml =    part.end || '';
            return indentHtml + keyHtml + valueHtml + endHtml;
        };
        const jsonLine = /^( *)("[^"]+": )?("[^"]*"|[\w.+-]*)?([{}[\],]*)?$/mg;
        // Regex parses each line of the JSON string into four parts:
        //    Capture group       Part        Description                  '   "active": true,'
        //    ------------------  ----------  ---------------------------  --------------------
        //    ( *)                p1: indent  Spaces for indentation       '   '
        //    ("[^"]+": )         p2: key     Key name                     '"active": '
        //    ("[^"]*"|[\w.+-]*)  p3: value   Key value                    'true'
        //    ([{}[\],]*)         p4: end     Line termination characters  ','
        const json = JSON.stringify(thing, null, settings.indent);
        return htmlEntities(json).replace(jsonLine, replacer);
    }

};

if (typeof module === 'object')
    module.exports = prettyPrintJson;  //node module loading system (CommonJS)
if (typeof window === 'object')
    window.prettyPrintJson = prettyPrintJson;  //support both global and window property