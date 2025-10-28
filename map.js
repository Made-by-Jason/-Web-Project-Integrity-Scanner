export function renderMap(svg, graph) {
  const NS = "http://www.w3.org/2000/svg";
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const width = 800;
  const height = 400;

  // Split nodes into two columns
  const jsNodes = graph.nodes.filter((n) => n.group === "js");
  const htmlNodes = graph.nodes.filter((n) => n.group === "html");

  const margin = 20;
  const colX = { js: 200, html: 600 };
  const colYs = (count) => {
    const step = Math.max(30, (height - margin * 2) / Math.max(1, count + 1));
    return Array.from({ length: count }, (_, i) => margin + step * (i + 1));
  };

  const jsY = colYs(jsNodes.length);
  const htmlY = colYs(htmlNodes.length);

  const pos = {};
  jsNodes.forEach((n, i) => (pos[n.id] = { x: colX.js, y: jsY[i] }));
  htmlNodes.forEach((n, i) => (pos[n.id] = { x: colX.html, y: htmlY[i] }));

  // Edges
  graph.edges.forEach((e) => {
    const from = pos[e.from];
    const to = pos[e.to];
    if (!from || !to) return;
    const path = document.createElementNS(NS, "path");
    const mx = (from.x + to.x) / 2;
    path.setAttribute(
      "d",
      `M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`,
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", e.ok ? "#a3a3a3" : "#dc2626");
    path.setAttribute("stroke-width", e.ok ? "1.5" : "2.5");
    svg.appendChild(path);
  });

  // Nodes
  function drawNode(n, fill, stroke) {
    const g = document.createElementNS(NS, "g");
    const p = pos[n.id];

    const r = 16;
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", fill);
    circle.setAttribute("stroke", stroke);
    circle.setAttribute("stroke-width", "1");
    g.appendChild(circle);

    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", p.x + (n.group === "js" ? -r - 6 : r + 6));
    label.setAttribute("y", p.y + 4);
    label.setAttribute("font-size", "10");
    label.setAttribute("fill", "#111827");
    label.setAttribute("text-anchor", n.group === "js" ? "end" : "start");
    label.textContent = n.label.slice(0, 40);
    g.appendChild(label);

    svg.appendChild(g);
  }

  jsNodes.forEach((n) => drawNode(n, "#111827", "#111827"));
  htmlNodes.forEach((n) => drawNode(n, "#e5e7eb", "#9ca3af"));
}

