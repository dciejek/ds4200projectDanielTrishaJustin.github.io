// js/treemap.js — Stocks vs Crypto sector treemap (yellow + pink)

document.addEventListener("DOMContentLoaded", () => {
  console.log("treemap.js loaded");

  const rootSel = d3.select("#asset-treemap");
  if (rootSel.empty()) {
    console.error("No element with id 'asset-treemap' found.");
    return;
  }

  // Helper to safely parse numbers with commas
  function parseNumber(v) {
    if (v == null || v === "") return NaN;
    return +String(v).replace(/,/g, "");
  }

  const margin = { top: 40, right: 10, bottom: 10, left: 10 };
  const width = 900 - margin.left - margin.right;
  const height = 520 - margin.top - margin.bottom;

  // Tooltip
  const tooltip = rootSel.append("div")
    .attr("class", "treemap-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(0,0,0,0.8)")
    .style("color", "white")
    .style("padding", "6px 8px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("opacity", 0);

  const svg = rootSel.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style("max-width", "100%")
    .style("height", "auto");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("text")
    .attr("x", width / 2)
    .attr("y", -15)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "600")
    .text("Sector Liquidity Treemap: Stocks vs Crypto");

  // Yellow + pink colors
  const typeColor = d3.scaleOrdinal()
    .domain(["Stocks", "Crypto"])
    .range(["#ffeb3b", "#ff66cc"]); // yellow, pink

  // legend
  const legend = g.append("g")
    .attr("transform", `translate(0, -40)`);

  ["Stocks", "Crypto"].forEach((t, i) => {
    const row = legend.append("g")
      .attr("transform", `translate(0, ${i * 18})`);

    row.append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", typeColor(t));

    row.append("text")
      .attr("x", 16)
      .attr("y", 9)
      .style("font-size", "11px")
      .text(t);
  });

  console.log("Loading CSVs for treemap…");

  Promise.all([
    d3.csv("stocks_cleaned.csv"),
    d3.csv("crypto_cleaned.csv"),
    d3.csv("companies_cleaned.csv")
  ]).then(([stockRows, cryptoRows, companyRows]) => {
    console.log("Loaded rows:", {
      stocks: stockRows.length,
      cryptos: cryptoRows.length,
      companies: companyRows.length
    });

    // ticker -> sector mapping from companies file
    const sectorByTicker = new Map(
      companyRows.map(d => [d["ticker"], d["sector"] || "Unknown"])
    );

    // ----- STOCKS: aggregate by sector, keep raw liquidity -----
    const sectorAgg = d3.rollup(
      stockRows,
      rows => {
        const totalLiquidity = d3.sum(rows, r => +r.vol_ || 0);
        const avgChange = d3.mean(rows, r => +r["chg_%"] || 0);
        const count = rows.length;
        return { totalLiquidity, avgChange, count };
      },
      r => sectorByTicker.get(r.symbol) || "Unknown"
    );

    const stockChildrenRaw = Array.from(sectorAgg, ([sector, stats]) => ({
      name: sector,
      type: "Stocks",
      rawValue: stats.totalLiquidity,   // raw volume
      avgChange: stats.avgChange,
      count: stats.count
    })).filter(d => d.rawValue > 0);

    const stockTotal = d3.sum(stockChildrenRaw, d => d.rawValue) || 1;

    // Normalize so all stock sectors together sum to 1
    const stockChildren = stockChildrenRaw.map(d => ({
      ...d,
      value: d.rawValue / stockTotal
    }));

    const cryptoAgg = d3.rollup(
      cryptoRows,
      rows => {
        const totalCap = d3.sum(rows, r => parseNumber(r.market_cap));
        const avgChange = d3.mean(rows, r => +r.chg_7d || 0);
        const first = rows[0];
        return {
          name: first.name,
          symbol: first.symbol,
          totalCap,
          avgChange
        };
      },
      r => r.symbol    // group by coin symbol
    );

    const cryptoChildrenRaw = Array.from(cryptoAgg, ([symbol, stats]) => ({
      name: stats.name || symbol,     // label = coin name
      symbol,
      type: "Crypto",
      rawValue: stats.totalCap,       // raw market cap
      avgChange: stats.avgChange,
      count: 1
    })).filter(d => d.rawValue > 0);

    const cryptoTotal = d3.sum(cryptoChildrenRaw, d => d.rawValue) || 1;

    // Normalize so all crypto coins together also sum to 1
    const cryptoChildren = cryptoChildrenRaw.map(d => ({
      ...d,
      value: d.rawValue / cryptoTotal
    }));


    // Build hierarchical data for treemap
    const treeData = {
  name: "Assets",
  children: [
    { name: "Stocks", type: "Stocks", children: stockChildren },
    { name: "Crypto", type: "Crypto", children: cryptoChildren }
  ]
};

    const root = d3.hierarchy(treeData)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.treemap()
      .size([width, height])
      .paddingInner(2)
      .paddingOuter(1)
      (root);

    const nodes = g.selectAll("g.node")
      .data(root.leaves())
      .join("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x0},${d.y0})`);

    nodes.append("rect")
      .attr("width", d => d.x1 - d.x0)
      .attr("height", d => d.y1 - d.y0)
      .attr("fill", d => {
        // parent of leaf is Stocks or Crypto
        const topType = d.parent && d.parent.data.type ? d.parent.data.type : "Stocks";
        return typeColor(topType);
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .attr("opacity", 0.9)
      .on("mouseover", (event, d) => {
        const data = d.data;
        const parentType = d.parent && d.parent.data.type ? d.parent.data.type : "Stocks";

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${data.name}</strong><br/>
            Group: ${parentType}<br/>
            Total Liquidity: ${d3.format(".3s")(data.value)}<br/>
            Avg Change: ${data.avgChange.toFixed(2)}%<br/>
            Assets: ${data.count}
          `);
      })
      .on("mousemove", event => {
        const [x, y] = d3.pointer(event, document.body);
        tooltip
          .style("left", (x + 12) + "px")
          .style("top", (y + 12) + "px");
      })
      .on("mouseout", () => {
        tooltip.style("opacity", 0);
      });

    // Labels: sector/crypto name, clipped if too small
    nodes.append("text")
      .attr("x", 4)
      .attr("y", 14)
      .style("font-size", "11px")
      .style("pointer-events", "none")
      .text(d => d.data.name)
      .each(function (d) {
        const rectWidth = d.x1 - d.x0;
        if (this.getComputedTextLength() > rectWidth - 6) {
          d3.select(this).text(""); // hide label if no room
        }
      });

  }).catch(err => {
    console.error("Error in treemap:", err);
  });
});
