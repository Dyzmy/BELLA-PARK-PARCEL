// Demo records for the first website preview. Live app/database sync will be connected in a later phase.
const pickupRecords = [
  { id:"BP-DEMO-001", date:"01/01/26", time:"09:15 AM", courier:"SPX", rider:"EDDY", tracking:["Myspx123","Myspx321","Myspx456","Myspx789","Myspx999"] },
  { id:"BP-DEMO-002", date:"01/01/26", time:"10:30 AM", courier:"J&T", rider:"ALI", tracking:["JT10002345","JT10006789","JT10009876"] },
  { id:"BP-DEMO-003", date:"02/01/26", time:"08:15 AM", courier:"NINJA", rider:"ABU", tracking:["NJV000123","NJV000456","NJV000789","NJV000999"] }
];

const $ = (id) => document.getElementById(id);
const totals = pickupRecords.reduce((out, record) => {
  out[record.courier] = (out[record.courier] || 0) + record.tracking.length;
  out.all += record.tracking.length;
  return out;
}, { all: 0 });
$("grand-total").textContent = totals.all;
$("spx-total").textContent = totals.SPX || 0;
$("jt-total").textContent = totals["J&T"] || 0;
$("ninja-total").textContent = totals.NINJA || 0;
$("year").textContent = new Date().getFullYear();
$("today-label").textContent = new Intl.DateTimeFormat("ms-MY",{day:"2-digit",month:"short",year:"numeric"}).format(new Date()).toUpperCase();

function renderRecords() {
  const query = $("search-input").value.trim().toLowerCase();
  const courier = $("courier-filter").value;
  const rows = pickupRecords.filter(r => (courier === "ALL" || r.courier === courier) &&
    [r.date,r.time,r.courier,r.rider,...r.tracking].join(" ").toLowerCase().includes(query));
  $("records-body").innerHTML = rows.length ? rows.map(r => `<tr>
    <td>${r.date}</td><td>${r.time}</td>
    <td><button class="total-link" type="button" data-record="${r.id}">${r.tracking.length}#</button></td>
    <td><span class="courier-pill">${r.courier}</span></td><td>${escapeHtml(r.rider)}</td><td><span class="status-pill">● DEMO</span></td>
  </tr>`).join("") : '<tr><td class="empty-row" colspan="6">Tiada rekod sepadan.</td></tr>';
  document.querySelectorAll("[data-record]").forEach(button => button.addEventListener("click", () => showDetail(button.dataset.record)));
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function showDetail(id) {
  const r = pickupRecords.find(item => item.id === id);
  if (!r) return;
  $("detail-meta").innerHTML = [
    ["TARIKH",r.date],["MASA",r.time],["COURIER",r.courier],["DRIVER / RIDER",r.rider],["TOTAL",r.tracking.length+" parcel"],["RECORD ID",r.id]
  ].map(([label,value]) => `<div class="meta-item"><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`).join("");
  $("tracking-count").textContent = r.tracking.length+" tracking";
  $("tracking-list").innerHTML = r.tracking.map(t => `<li>${escapeHtml(t)}</li>`).join("");
  $("detail-modal").classList.add("open");
  $("detail-modal").setAttribute("aria-hidden","false");
}
function closeDetail() { $("detail-modal").classList.remove("open"); $("detail-modal").setAttribute("aria-hidden","true"); }
$("close-modal").addEventListener("click",closeDetail);
$("detail-modal").addEventListener("click",e => { if(e.target === $("detail-modal")) closeDetail(); });
document.addEventListener("keydown",e => { if(e.key === "Escape") closeDetail(); });
$("search-input").addEventListener("input",renderRecords);
$("courier-filter").addEventListener("change",renderRecords);
$("export-button").addEventListener("click",() => {
  const lines = [["Tarikh","Masa","Total","Courier","Driver / Rider","Tracking Numbers"]];
  pickupRecords.forEach(r => lines.push([r.date,r.time,r.tracking.length,r.courier,r.rider,r.tracking.join(" | ")]));
  const csv = lines.map(row => row.map(value => '"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href=url; a.download="bella-park-pickup-records-demo.csv"; a.click(); URL.revokeObjectURL(url);
});
renderRecords();