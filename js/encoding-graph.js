class GraphBuilder {

    categoryColors = {
        "encoding": "#67C5CB",
        "stream": "#F7CE71",
        "codec": "#7FAC58",
        "input": "#B3B3B3",
        "inputstream": "#9EBAF3",
        "filter": "#8BE0A4",
        "muxing": "#DCB1F2",
        "output": "#B3B3B3",
        "drm": "#F89C73",
        "manifest": "#C9DB73"
    };

    constructor() {
        this._nodes = {};
        this._edges = {};
    }

    addNodeFromResource(resource, label="", category, cluster) {
        this.addNode(resource.id, resource.constructor.name, label, category, cluster, resource)
    }

    addNode(id, title, label="", category, cluster, resource) {
        this._nodes[id] = {
            id: id,
            title: title,
            label: label,
            category: category,
            cluster: cluster,
            resource: resource
        }
    }

    addEdge(from_id, to_id) {
        let id = `${from_id}_to_${to_id}`;
        this._edges[id] = {
            from_id: from_id,
            to_id: to_id
        }
    }

    computeNodeAttributes() {
        const defaults = {
            shape: 'box',
            style: 'filled'
        };

        Object.values(this._nodes).forEach(node => {
            let attrs = Object.assign({}, defaults);

            attrs['label'] = `<B>${node.title}</B><br/>${node.label}<br/>${node.id}`;

            // set color based on category
            if (node.category in this.categoryColors) {
                attrs.fillcolor = this.categoryColors[node.category]
            } else {
                attrs.fillcolor = "white";
            }

            // special shapes
            if (node.category === "file") {
                attrs.shape = "note"
            }

            // other processing based on the resource
            if (node.resource) {
                // handle per-title
                if (node.resource.mode && node.resource.mode.startsWith("PER_TITLE_TEMPLATE")) {
                    attrs.shape = "component";
                    attrs.fillcolor = tinycolor(attrs.fillcolor).lighten(20).toString();
                }

                // mute the ignored resources (eg. filtered out by stream conditions)
                if ("ignoredBy" in node.resource && node.resource.ignoredBy.length > 0) {
                    attrs.style = attrs.style + ",dashed";
                    attrs.fillcolor = attrs.fillcolor + ";0.5:#D3D3D3";
                    attrs.gradientangle = 272
                }

            }

            // add CSS classes
            attrs.class = "clicky " + node.id;

            node.attributes = attrs;
        })
    }

    computeEdgeAttributes() {
        const defaults = {};
        Object.values(this._edges).forEach(edge => {
            let attrs = Object.assign({}, defaults);

            attrs.class = `clicky ${edge.from_id} ${edge.to_id}`;

            // set edge color based on target node
            let node = this._nodes[edge.to_id];
            if (node.category in this.categoryColors) {
                attrs.color = this.categoryColors[node.category]
            }

            edge.attributes = attrs;
        })
    }

    makeDotDoc() {
        function groupBy(arr, prop) {
            const map = new Map(Array.from(arr, obj => [obj[prop], []]));
            arr.forEach(obj => map.get(obj[prop]).push(obj));
            return Array.from(map.values());
        }

        this.computeNodeAttributes();
        this.computeEdgeAttributes();

        // group by clusters of nodes
        let clusterNodes = groupBy(Object.values(this._nodes), "cluster");

        var dot = `
digraph G {
  rankdir="LR";
  node[fontsize=8, fontname=Arial];
  edge[arrowsize=0.6];
`;

        // add nodes
        clusterNodes.forEach(cluster => {
            let clusterdot = "";
            cluster.forEach(node => {
                clusterdot += `"${node.id}" [`;

                var attrs = [];
                Object.entries(node.attributes).forEach(([k, v]) => {
                    attrs.push(`${k}=<${v}>`)
                });
                clusterdot += attrs.join(",");
                clusterdot += `];\n`;
            });

            // create subgraphs for named clusters with more than 1 node
            if (cluster[0].cluster !== undefined && cluster.length > 1) {
                clusterdot = `subgraph "cluster_${cluster[0].cluster}" { \n` + clusterdot;
                clusterdot += "}\n";
            }

            dot += clusterdot;
        });

        // add edges
        Object.values(this._edges).forEach(edge => {
            dot += `"${edge.from_id}" -> "${edge.to_id}" `;

            var attrs = [];
            Object.entries(edge.attributes).forEach(([k, v]) => {
                attrs.push(`${k}=<${v}>`)
            });
            if (attrs.length) {
                dot += "[";
                dot += attrs.join(",");
                dot += `]`;
            }
            dot += ";\n";

        });

        dot += "}";

        console.log("DOT graph", dot);
        return dot
    }

}