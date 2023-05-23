'use strict';

const componentSeparator = ';';

class sliderWithTickmarks extends HTMLInputElement {
  connectedCallback() {
    this.addTickmarks();
  }

  static get observedAttributes() {
    return ['max'];
  }

  attributeChangedCallback() {
    this.addTickmarks();
  }

  addTickmarks() {
    let id = this.id + 'Tickmarks';
    this.setAttribute('list', id);

    let datalist = document.getElementById(id);
    if (datalist) datalist.remove();

    datalist = document.createElement('datalist');
    datalist.id = id;
    for (let i = 0; +this.max && i <= this.max; i++) {
      datalist.append(new Option("", i));
    }

    this.after(datalist);
  }
}

customElements.define('slider-with-tickmarks', sliderWithTickmarks, { extends: 'input' });

class Graph {
  constructor(edges) {
    // Array met objecten? Dit zijn edges in Cytoscape formaat
    if (!Array.isArray(edges[0])) {
      this.edges = [...edges];
      return;
    }

    // Array met alleen edge endpoints
    this.edges = edges.map(([source, target]) => {
      let sourceRoot = nodeComponents(source)[0].toString();
      let targetRoot = nodeComponents(target)[0].toString();
      return {
        data: {
          id: `${source} -> ${target}`,
          source: source,
          target: target,
          scope: sourceRoot === targetRoot ? 'internal' : 'external',
        }
      };
    });
  }

  get nodes() {
    let nodes = new Set();
    this.edges.forEach(({ data: { source, target } }) => nodes.add(source).add(target));
    nodes = Array.from(nodes).sort();

    return nodes.map(node => {
      return {
        data: {
          id: node,
          name: node.replaceAll(componentSeparator, ' | '),
          image: nodeImage(node),
          width: 1,
          height: 1,
          // get width() { return this.image.width * cy.data('nodeSizeFactor') },
          // get height() { return this.image.height * cy.data('nodeSizeFactor') },
          sap: !nodeComponents(node)[0][1].startsWith('z'),
        }
      };
    });
  }

  get elements() {
    return {
      nodes: this.nodes,
      edges: this.edges,
    };
  }

}
function importNode(node) {
  return node
    .toLowerCase()
    .replace(/^\\/, '')
    .replaceAll('\\', componentSeparator);
}

function nodeComponents(node) {
  return node
    .split(componentSeparator)
    .map(component => component.split(':'));
}

function nodeImage(node) {
  let svgTemplate = document.getElementById('svg-template');
  let svgFragment = svgTemplate.content.cloneNode(true);

  document.body.append(svgFragment);
  let svg = document.body.querySelector('svg');

  let table = svg.querySelector('table');
  for (let component of nodeComponents(node)) {
    let row = table.insertRow();
    for (let segment of component) {
      let cell = row.insertCell();
      cell.innerHTML = segment;
    }
  }

  svg.setAttribute("width", table.offsetWidth);
  svg.setAttribute("height", table.offsetHeight);

  let svgXml = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg>' + new XMLSerializer().serializeToString(svg);
  let image = {
    width: table.offsetWidth,
    height: table.offsetHeight,
    data: 'data:image/svg+xml;utf8,' + encodeURIComponent(svgXml),
  };

  svg.remove();
  return image;
}

function importEdges(edges) {
  return edges.map(({ source, target }) => [importNode(source), importNode(target)]);
}

function importXref(xref) {
  return new Graph(importEdges(xref.calls));
}

function importXrefs(xrefs) {
  let objects = xrefs.map(({ id, type, name }) => ({ id, text: `${type.toLowerCase()} ${name}` }));
  objects.sort((a, b) => a.text.localeCompare(b.text));
  const objectSelector = document.getElementById('object');
  objectSelector.add(document.createElement("option"));
  for (let object of objects) {
    let option = document.createElement("option");
    option.value = object.id;
    option.text = object.text;
    objectSelector.add(option);
  }
}

function nodeInElements(elements, depth) {
  let inElements = elements.incomers();
  return (depth == 0) ? cy.collection() : inElements.union(nodeInElements(inElements, depth - 1));
}

function nodeOutElements(elements, depth) {
  let outElements = elements.outgoers();
  return (depth == 0) ? cy.collection() : outElements.union(nodeOutElements(outElements, depth - 1));
}

function nodeInMaxLength(node) {
  // Perform an A* search to find the shortest path from the node to each predecessors
  let predecessors = node.predecessors('node');
  let maxLength = predecessors.reduce(function (value = 0, predecessor) {
    let aStar = cy.elements().aStar({ root: node, goal: predecessor });
    return Math.max(value, aStar.distance);
  });
  return maxLength ?? 0;
}

function nodeOutMaxLength(node) {
  let successors = node.successors('node');
  let maxLength = successors.reduce(function (value = 0, successor) {
    let aStar = cy.elements().aStar({ root: node, goal: successor });
    return Math.max(value, aStar.distance);
  });
  return maxLength ?? 0;
}

function condenseGraph(graph) {
  function condenseNode(node) {
    return node.replace(/;[^;]*$/, '');
  }

  let condensedEdges = new Map();
  graph.edges.forEach(({ data: { source, target } }) => {
    let edge = [condenseNode(source), condenseNode(target)];
    condensedEdges.set(edge.toString(), edge);
  });
  condensedEdges = Array
    .from(condensedEdges.values())
    .filter(([source, target]) => source.toString() != target.toString());  // verwijder loops
  return new Graph(condensedEdges);
}

function setHighlight(event) {
  let highlight = document.getElementById('highlight-on').checked;
  cy.elements().removeClass('highlight subgraph');
  cy.elements().addClass((highlight) ? 'highlight' : 'subgraph');
  if (event) refreshLayout();
}

function setLabels(event) {
  let labels = document.getElementById('labels').checked;
  cy.nodes().toggleClass('labels', labels);
  if (event) refreshLayout();
}

function refreshGraph() {
  // Condense 
  let graph = window.mainGraph;
  let condenseDepth = +document.getElementById('condenseSlider').value;
  for (let i = 0; i < condenseDepth; i++) graph = condenseGraph(graph);

  let edges = graph.edges;

  // Scope 
  let scope = document.querySelector("input[name=scope]:checked").value;
  if (scope !== 'all') edges = edges.filter(edge => edge.data.scope === scope);

  // SAP calls 
  let sapCalls = document.getElementById('sap-calls').checked;
  if (!sapCalls) {
    let nodes = graph.nodes;
    edges = edges.filter(edge => {
      let target = nodes.find(node => node.data.id == edge.data.target);
      return !target.data.sap;
    });
  };

  // Bouw de graph opnieuw op
  graph = new Graph(edges);
  cy.remove(cy.elements());
  cy.add(graph.elements);

  setHighlight();
  setLabels();
  refreshLayout();

  // Ververs de selectielijst en herstel een eventuele eerdere selectie
  let selection = document.getElementById('selection');
  let nodes = document.getElementById('nodes');
  cy.$('node:selected').unselect();
  let name = selection.value.replaceAll('|', '\|');
  let node = cy.filter(`node[name = "${name}"]`).select();

  while (nodes.firstChild) nodes.removeChild(nodes.firstChild);
  nodes.append(new Option(""));
  graph.nodes.forEach(({ data: { name } }) => nodes.append(new Option(name)));
  // ID wordt bewust niet als value meegenomen omdat Chrome deze ook in de lijst toont
  // Workaround zou zijn: https://stackoverflow.com/a/37116207/14655704

  selection.value = node.data('name') ?? "";
}

function refreshLayout() {
  let edgeLength = +document.getElementById('edgeLength').value;  // Range 0..5
  let factor = 1 + edgeLength / 5;  // Range 1, 1.2, 1.4, 1.6, 1.8, 2
  let options = (document.getElementById('spring').checked) ?
    {
      // API documentation: https://github.com/cytoscape/cytoscape.js-cose-bilkent#api
      name: 'cose-bilkent',
      idealEdgeLength: 150 * factor,
    } :
    {
      // API documentation: https://github.com/cytoscape/cytoscape.js-cola#api
      name: 'cola',
      maxSimulationTime: 1000,
      edgeLength: (edgeLength) ? 100 * factor : undefined,
    };

  cy.layout(options).run();
}

function showSelection() {
  let node = cy.$('node:selected');
  let inLength = document.getElementById('inLengthSlider').value;
  let outLength = document.getElementById('outLengthSlider').value;

  let inElements = nodeInElements(node, inLength);
  let outElements = nodeOutElements(node, outLength);
  let path = cy.collection().merge(inElements).merge(outElements);

  cy.elements().removeClass('path not-path');
  path.addClass('path');
  cy.elements().not(path).not(node).addClass('not-path');

  // Ververs de layout alleen bij het tonen van de subgraph
  let highlight = document.getElementById('highlight-on').checked;
  if (!highlight) refreshLayout();
}

function showGraph([graph, style]) {
  window.mainGraph = graph;
  window.cy = cytoscape({
    container: document.getElementById('cy'),
    elements: graph?.elements,
    style: style,
  });

  refreshGraph();

  // Maximale condense factor
  let condenseSlider = document.getElementById('condenseSlider');
  condenseSlider.max = graph.nodes.reduce((max, { data: { id } }) => {
    let factor = nodeComponents(id).length - 1;
    return Math.max(max, factor);
  }, 0);

  // Cytoscape event handlers
  cy.on('select', 'node', function (event) {
    let node = event.target;
    document.getElementById('selection').value = node.data('name');

    document.getElementById('inLengthSlider').max = nodeInMaxLength(node);
    document.getElementById('inLengthSlider').value = 1;

    document.getElementById('outLengthSlider').max = nodeOutMaxLength(node);
    document.getElementById('outLengthSlider').value = 1;

    showSelection();
  });

  cy.on('unselect', 'node', function (event) {
    cy.elements().removeClass('path not-path');
    document.getElementById('selection').value = "";
    document.getElementById('inLengthSlider').max = 0;
    document.getElementById('outLengthSlider').max = 0;
  });
}

document.addEventListener('DOMContentLoaded', function () {
  fetch('/apps/xref-api/xrefs')
    .then(response => response.json())
    .then(xrefs => importXrefs(xrefs));

  document.getElementById('object').addEventListener('change',
    function (event) {
      const id = event.target.value;
      document.body.classList.add('loading');
      Promise.all([
        fetch(`/apps/xref-api/xrefs/${id}`)
          .then(response => response.json())
          .then(xref => importXref(xref))
          .catch(() => new Graph([])),
        fetch('xref.cycss')
          .then(response => response.text())])
        .finally(() => document.body.classList.remove('loading'))
        .then(showGraph);
    });

  document.getElementById('condenseSlider').addEventListener('input', refreshGraph);
  document.getElementById('scope').addEventListener('change', refreshGraph);
  document.getElementById('sap-calls').addEventListener('change', refreshGraph);

  document.getElementById('selection').addEventListener('change',
    function (event) {
      // Selecteer de bijbehorende node (dit triggert weer het select/node event)
      let name = event.target.value.replaceAll('|', '\|');
      cy.$('node:selected').unselect();
      cy.filter(`node[name = "${name}"]`).select();
    });

  document.getElementById('inLengthSlider').addEventListener('input', showSelection);
  document.getElementById('outLengthSlider').addEventListener('input', showSelection);
  document.getElementById('edgeLength').addEventListener('input', refreshLayout);
  document.getElementById('highlight').addEventListener('change', setHighlight);
  document.getElementById('labels').addEventListener('change', setLabels);
  document.getElementById('spring').addEventListener('change', refreshLayout);
});
