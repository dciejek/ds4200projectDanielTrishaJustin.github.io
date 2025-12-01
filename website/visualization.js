// visualization.js
export async function renderMarketViz(containerSelector) {
  const container = d3.select(containerSelector);

  const width = 960;
  const margin = { top: 50, right: 40, bottom: 40, left: 180 };
  const panelGap = 50; // vertical gap between stocks & crypto panels

  const wrapper = container.append("div")
    .style("font-family", "system-ui, sans-serif")
    .style("max-width", width + "px");

  // Title & subtitle
  wrapper.append("div")
    .style("margin-bottom", "4px")
    .style("font-size", "18px")
    .style("font-weight", "600")
    .text("Average % Return per Asset — Stocks vs Crypto");

  wrapper.append("div")
    .style("margin-bottom", "12px")
    .style("font-size", "12px")
    .style("color", "#6b7280")
    .html(
      "Each bar is one asset, showing its average % change across all records. " +
      "Top & bottom performers are shown separately for stocks (top) and crypto (bottom)."
    );

  // Tooltip
  const tooltip = d3.select("body").append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(17,24,39,0.97)")
    .style("color", "#f9fafb")
    .style("padding", "8px 10px")
    .style("border-radius", "6px")
    .style("font-size", "11px")
    .style("border", "1px solid #4b5563")
    .style("opacity", 0)
    .style("z-index", 9999);

  const fmtPct = d3.format("+.2f");

  const parsePct = s => {
    if (!s) return NaN;
    return parseFloat(String(s).replace("%", "").replace("+", ""));
  };

  // ---------- Load data ----------
  let stocksRaw, cryptoRaw;
  try {
    [stocksRaw, cryptoRaw] = await Promise.all([
      d3.csv("../stocks.csv"),
      d3.csv("../cryptocurrency.csv"),
    ]);
  } catch (err) {
    console.error("Error loading CSVs:", err);
    wrapper.append("div")
      .style("color", "red")
      .style("margin-top", "8px")
      .text("Error loading CSV files. Check console for details.");
    return;
  }

  // ---------- Aggregate stocks: average chg_% per normalized name ----------
  const stockGroups = new Map();

  for (const d of stocksRaw) {
    const pct = parsePct(d["chg_%"]);
    if (isNaN(pct)) continue;

    const key = d.name.trim().toLowerCase(); // normalized key
    const prettyName = d.name.trim();

    const group = stockGroups.get(key) || {
      category: "Stock",
      code: prettyName,
      sum: 0,
      count: 0,
    };

    group.sum += pct;
    group.count += 1;
    stockGroups.set(key, group);
  }

  const stocks = [...stockGroups.values()].map(d => {
    const avg = d.sum / d.count;
    return {
      id: "Stock|" + d.code,
      category: "Stock",
      code: d.code,
      avgPct: avg,
      absAvgPct: Math.abs(avg),
      count: d.count,
    };
  });

  // ---------- Aggregate crypto: average chg_24h per symbol ----------
  const cryptoGroups = new Map();

  for (const d of cryptoRaw) {
    const pct = parsePct(d.chg_24h);
    if (isNaN(pct)) continue;

    const key = d.symbol.trim().toLowerCase();
    const symbol = d.symbol.trim();
    const name = d.name;

    const group = cryptoGroups.get(key) || {
      category: "Crypto",
      code: symbol,
      name,
      sum: 0,
      count: 0,
    };

    group.sum += pct;
    group.count += 1;
    cryptoGroups.set(key, group);
  }

  const cryptos = [...cryptoGroups.values()].map(d => {
    const avg = d.sum / d.count;
    return {
      id: "Crypto|" + d.code,
      category: "Crypto",
      code: d.code,
      name: d.name,
      avgPct: avg,
      absAvgPct: Math.abs(avg),
      count: d.count,
    };
  });

  if (stocks.length === 0 && cryptos.length === 0) {
    wrapper.append("div")
      .style("color", "red")
      .style("margin-top", "8px")
      .text("No valid % change values parsed. Check columns chg_% and chg_24h.");
    return;
  }

  // ---------- Select top & bottom performers ----------
  const POS_N = 10; // top gainers
  const NEG_N = 10; // worst losers

  function pickTopBottom(arr) {
    const positives = arr
      .filter(d => d.avgPct > 0)
      .sort((a, b) => d3.descending(a.avgPct, b.avgPct))
      .slice(0, POS_N);

    const negatives = arr
      .filter(d => d.avgPct < 0)
      .sort((a, b) => d3.ascending(a.avgPct, b.avgPct)) // most negative first
      .slice(0, NEG_N)
      .reverse(); // now most negative goes to the BOTTOM of the chart


    const map = new Map();
    positives.concat(negatives).forEach(d => map.set(d.id, d));
    return [...map.values()];
  }

  const stocksSel = pickTopBottom(stocks);
  const cryptosSel = pickTopBottom(cryptos);

  // ---------- Panel heights & SVG ----------
  const stocksPanelHeight = Math.max(stocksSel.length * 18 + 40, 140);
  const cryptoPanelHeight = Math.max(cryptosSel.length * 18 + 40, 140);

  const totalHeight =
    margin.top + stocksPanelHeight +
    panelGap + cryptoPanelHeight +
    margin.bottom;

  const svg = wrapper.append("svg")
    .attr("width", width)
    .attr("height", totalHeight);

  const innerWidth = width - margin.left - margin.right;

  const categoryColors = {
    Stock: "#22c55e",
    Crypto: "#38bdf8",
  };

  // ---------- STOCK PANEL (own x scale) ----------
  const gStocks = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const yStocks = d3.scaleBand()
    .domain(stocksSel.map(d => d.code))
    .range([0, stocksPanelHeight])
    .padding(0.15);

  const stockValues = stocksSel.map(d => d.avgPct);
  const stockMaxAbs = Math.max(
    Math.abs(d3.min(stockValues) ?? 0),
    Math.abs(d3.max(stockValues) ?? 0),
    0.5 // at least ±0.5%
  );

  const xStocks = d3.scaleLinear()
    .domain([-stockMaxAbs, stockMaxAbs])
    .range([0, innerWidth])
    .nice();

  const xAxisStocks = gStocks.append("g")
    .attr("transform", `translate(0,${stocksPanelHeight})`)
    .call(
      d3.axisBottom(xStocks)
        .ticks(7)
        .tickFormat(d => d + "%")
    );

  const yAxisStocks = gStocks.append("g")
    .call(
      d3.axisLeft(yStocks)
        .tickSize(0)
    );

  yAxisStocks.selectAll("text").style("font-size", "11px");

  const zeroLineStocks = gStocks.append("line")
    .attr("x1", xStocks(0))
    .attr("x2", xStocks(0))
    .attr("y1", 0)
    .attr("y2", stocksPanelHeight)
    .attr("stroke", "#9ca3af")
    .attr("stroke-dasharray", "4,2");

  gStocks.append("text")
    .attr("x", 0)
    .attr("y", -10)
    .attr("text-anchor", "start")
    .style("font-size", "13px")
    .style("font-weight", "600")
    .text("Stocks — average % return (top & bottom)");

  gStocks.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", stocksPanelHeight + 30)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("fill", "#4b5563")
    .text("Average % change (stocks)");

  const stockBars = gStocks.append("g")
    .selectAll("rect")
    .data(stocksSel, d => d.id)
    .enter()
    .append("rect")
    .attr("y", d => yStocks(d.code))
    .attr("height", yStocks.bandwidth())
    .attr("x", xStocks(0))
    .attr("width", 0)
    .style("fill", categoryColors.Stock)
    .style("opacity", 0.85)
    .on("mouseenter", (event, d) => {
      d3.select(event.currentTarget).style("opacity", 1);
      tooltip
        .style("opacity", 1)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px")
        .html(`
          <div style="font-weight:600;margin-bottom:2px;">
            ${d.code} (Stock)
          </div>
          <div>Average % change: <b>${fmtPct(d.avgPct)}%</b></div>
        `);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");
    })
    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
      stockBars.style("opacity", 0.85);
    });

  stockBars.transition()
    .duration(500)
    .attr("x", d => d.avgPct >= 0 ? xStocks(0) : xStocks(d.avgPct))
    .attr("width", d => Math.abs(xStocks(d.avgPct) - xStocks(0)));

  // ---------- CRYPTO PANEL (own x scale) ----------
  const gCrypto = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left},${margin.top + stocksPanelHeight + panelGap})`
    );

  const yCrypto = d3.scaleBand()
    .domain(cryptosSel.map(d => d.code))
    .range([0, cryptoPanelHeight])
    .padding(0.15);

  const cryptoValues = cryptosSel.map(d => d.avgPct);
  const cryptoMaxAbs = Math.max(
    Math.abs(d3.min(cryptoValues) ?? 0),
    Math.abs(d3.max(cryptoValues) ?? 0),
    1 // at least ±1%
  );

  const xCrypto = d3.scaleLinear()
    .domain([-cryptoMaxAbs, cryptoMaxAbs])
    .range([0, innerWidth])
    .nice();

  const xAxisCrypto = gCrypto.append("g")
    .attr("transform", `translate(0,${cryptoPanelHeight})`)
    .call(
      d3.axisBottom(xCrypto)
        .ticks(7)
        .tickFormat(d => d + "%")
    );

  const yAxisCrypto = gCrypto.append("g")
    .call(
      d3.axisLeft(yCrypto)
        .tickSize(0)
    );

  yAxisCrypto.selectAll("text").style("font-size", "11px");

  const zeroLineCrypto = gCrypto.append("line")
    .attr("x1", xCrypto(0))
    .attr("x2", xCrypto(0))
    .attr("y1", 0)
    .attr("y2", cryptoPanelHeight)
    .attr("stroke", "#9ca3af")
    .attr("stroke-dasharray", "4,2");

  gCrypto.append("text")
    .attr("x", 0)
    .attr("y", -10)
    .attr("text-anchor", "start")
    .style("font-size", "13px")
    .style("font-weight", "600")
    .text("Cryptocurrencies — average % return (top & bottom)");

  gCrypto.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", cryptoPanelHeight + 30)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("fill", "#4b5563")
    .text("Average % change (crypto)");

  const cryptoBars = gCrypto.append("g")
    .selectAll("rect")
    .data(cryptosSel, d => d.id)
    .enter()
    .append("rect")
    .attr("y", d => yCrypto(d.code))
    .attr("height", yCrypto.bandwidth())
    .attr("x", xCrypto(0))
    .attr("width", 0)
    .style("fill", categoryColors.Crypto)
    .style("opacity", 0.85)
    .on("mouseenter", (event, d) => {
      d3.select(event.currentTarget).style("opacity", 1);
      tooltip
        .style("opacity", 1)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px")
        .html(`
          <div style="font-weight:600;margin-bottom:2px;">
            ${d.name ? `${d.name} (${d.code})` : d.code} (Crypto)
          </div>
          <div>Average % change: <b>${fmtPct(d.avgPct)}%</b></div>
        `);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");
    })
    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
      cryptoBars.style("opacity", 0.85);
    });

  cryptoBars.transition()
    .duration(500)
    .attr("x", d => d.avgPct >= 0 ? xCrypto(0) : xCrypto(d.avgPct))
    .attr("width", d => Math.abs(xCrypto(d.avgPct) - xCrypto(0)));
}
