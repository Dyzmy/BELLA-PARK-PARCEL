// BELLA PARK - live Supabase dashboard. Public pages only receive masked tracking values.
const SUPABASE_URL = "https://xudgvklvdonsyjeendkj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Q7mDg46N_FP9_bPdrsRSLQ_sJY28ppU";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
let pickupRecords = [];
let activeMonthKey = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function formatDate(value) {
  return new Intl.DateTimeFormat("ms-MY",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(value)).toUpperCase();
}
function formatTime(value) {
  return new Intl.DateTimeFormat("ms-MY",{hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(value));
}
function showMessage(message, isError = true) {
  $("auth-message").textContent = message;
  $("auth-message").classList.toggle("error", isError);
}
function setSignedIn(user) {
  $("auth-screen").hidden = true;
  $("dashboard-content").hidden = false;
  $("logout-button").hidden = false;
  $("connection-label").textContent = user.email || "STAFF SIGNED IN";
}
function setSignedOut() {
  $("auth-screen").hidden = false;
  $("dashboard-content").hidden = true;
  $("logout-button").hidden = true;
  $("connection-label").textContent = "SECURE STAFF DASHBOARD";
}
async function loadDashboard() {
  const { data: profile, error: profileError } = await client
    .from("staff_profiles").select("display_name,role").single();
  if (profileError || !profile || !["admin","scanner","viewer"].includes(profile.role)) {
    await client.auth.signOut();
    setSignedOut();
    showMessage("Akaun ini tiada akses staf BELLA PARK. Hubungi pentadbir.");
    return;
  }

  const { data: sessions, error: sessionError } = await client
    .from("pickup_sessions")
    .select("id,courier,driver_name,picked_up_at,month_key")
    .order("picked_up_at", {ascending:false})
    .limit(1000);
  if (sessionError) throw sessionError;

  const { data: parcels, error: parcelError } = await client
    .from("parcel_records_masked")
    .select("session_id,tracking_masked,created_at")
    .limit(5000);
  if (parcelError) throw parcelError;

  const bySession = new Map();
  (parcels || []).forEach(p => {
    if (!bySession.has(p.session_id)) bySession.set(p.session_id, []);
    bySession.get(p.session_id).push(p.tracking_masked);
  });
  pickupRecords = (sessions || []).map(s => ({
    id:s.id, date:formatDate(s.picked_up_at), time:formatTime(s.picked_up_at),
    courier:s.courier, rider:s.driver_name, tracking:bySession.get(s.id) || [],
    month:s.month_key
  }));

  const currentMonth = new Date().toISOString().slice(0,7)+"-01";
  const monthKeys = [...new Set(pickupRecords.map(r=>r.month))].sort().reverse();
  activeMonthKey = monthKeys.includes(currentMonth) ? currentMonth : (monthKeys[0] || currentMonth);
  $("year").textContent = new Date().getFullYear();
  $("today-label").textContent = formatDate(new Date());
  renderMonthSummary();
  renderRecords();
}
function monthTitle(key) {
  const [year,month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("ms-MY",{month:"long",year:"numeric"})
    .format(new Date(year,month-1,1)).toUpperCase();
}
function recordsForMonth(key) {
  return pickupRecords.filter(r=>r.month===key);
}
function renderMonthSummary() {
  const totalsByMonth = new Map();
  pickupRecords.forEach(r => {
    if (!totalsByMonth.has(r.month)) totalsByMonth.set(r.month,{parcels:0,sessions:0});
    const item=totalsByMonth.get(r.month);
    item.parcels += r.tracking.length;
    item.sessions += 1;
  });
  const months=[...totalsByMonth.keys()].sort().reverse();
  $("month-summary").innerHTML = months.length ? months.map(key => {
    const total=totalsByMonth.get(key);
    return `<button type="button" class="month-card ${key===activeMonthKey?"active":""}" data-month="${escapeHtml(key)}">
      <span class="month-card-title">${monthTitle(key)}</span>
      <strong>${total.parcels.toLocaleString("ms-MY")}</strong>
      <span class="month-card-foot">PARCEL · ${total.sessions} PICKUP</span>
    </button>`;
  }).join("") : '<p class="month-empty">Belum ada rekod bulanan.</p>';
  document.querySelectorAll("[data-month]").forEach(button => button.addEventListener("click",()=>{
    activeMonthKey=button.dataset.month;
    renderMonthSummary();
    renderRecords();
  }));
  const selected=recordsForMonth(activeMonthKey);
  const total=selected.reduce((n,r)=>n+r.tracking.length,0);
  $("grand-total").textContent=total.toLocaleString("ms-MY");
  $("spx-total").textContent=selected.filter(r=>r.courier==="SPX").reduce((n,r)=>n+r.tracking.length,0).toLocaleString("ms-MY");
  $("jt-total").textContent=selected.filter(r=>r.courier==="J&T").reduce((n,r)=>n+r.tracking.length,0).toLocaleString("ms-MY");
  $("ninja-total").textContent=selected.filter(r=>r.courier==="NINJA").reduce((n,r)=>n+r.tracking.length,0).toLocaleString("ms-MY");
  document.querySelector(".total-card .stat-label").textContent="TOTAL PARCEL · "+monthTitle(activeMonthKey);
  document.querySelector(".total-card .stat-foot").textContent="Jumlah keseluruhan bagi bulan dipilih";
}
function renderRecords() {
  const query = $("search-input").value.trim().toLowerCase();
  const courier = $("courier-filter").value;
  const rows = pickupRecords.filter(r =>
    (courier === "ALL" || r.courier === courier) &&
    [r.date,r.time,r.courier,r.rider,...r.tracking].join(" ").toLowerCase().includes(query)
  );
  $("records-body").innerHTML = rows.length ? rows.map(r => `<tr>
    <td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.time)}</td>
    <td><button class="total-link" type="button" data-record="${escapeHtml(r.id)}">${r.tracking.length}#</button></td>
    <td><span class="courier-pill">${escapeHtml(r.courier)}</span></td>
    <td>${escapeHtml(r.rider)}</td><td><span class="status-pill">● DISIMPAN</span></td>
  </tr>`).join("") : '<tr><td class="empty-row" colspan="6">Tiada rekod pickup dalam database.</td></tr>';
  document.querySelectorAll("[data-record]").forEach(button =>
    button.addEventListener("click", () => showDetail(button.dataset.record)));
}
function showDetail(id) {
  const r = pickupRecords.find(item => item.id === id);
  if (!r) return;
  $("detail-meta").innerHTML = [
    ["TARIKH",r.date],["MASA",r.time],["COURIER",r.courier],
    ["DRIVER / RIDER",r.rider],["TOTAL",r.tracking.length+" parcel"],["BULAN",r.month]
  ].map(([label,value]) => `<div class="meta-item"><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`).join("");
  $("tracking-count").textContent = r.tracking.length+" tracking (masked)";
  $("tracking-list").innerHTML = r.tracking.map(t => `<li>${escapeHtml(t)}</li>`).join("");
  $("detail-modal").classList.add("open");
  $("detail-modal").setAttribute("aria-hidden","false");
}
function closeDetail() {
  $("detail-modal").classList.remove("open");
  $("detail-modal").setAttribute("aria-hidden","true");
}
$("close-modal").addEventListener("click",closeDetail);
$("detail-modal").addEventListener("click",e => { if(e.target === $("detail-modal")) closeDetail(); });
document.addEventListener("keydown",e => { if(e.key === "Escape") closeDetail(); });
$("search-input").addEventListener("input",renderRecords);
$("courier-filter").addEventListener("change",renderRecords);
$("export-button").addEventListener("click",() => {
  const lines = [["Tarikh","Masa","Total","Courier","Driver / Rider","Tracking (masked)"]];
  pickupRecords.forEach(r => lines.push([r.date,r.time,r.tracking.length,r.courier,r.rider,r.tracking.join(" | ")]));
  const csv = lines.map(row => row.map(value => '"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href=url; a.download="bella-park-pickup-records-"+activeMonthKey+".csv"; a.click(); URL.revokeObjectURL(url);
});
$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("login-submit");
  button.disabled = true; button.textContent = "SEDANG LOG MASUK...";
  showMessage("", false);
  const { data, error } = await client.auth.signInWithPassword({
    email:$("login-email").value.trim(), password:$("login-password").value
  });
  button.disabled = false; button.textContent = "LOG MASUK";
  if (error) { showMessage("Log masuk gagal. Semak email dan password."); return; }
  try { setSignedIn(data.user); await loadDashboard(); }
  catch (err) {
    await client.auth.signOut(); setSignedOut();
    showMessage("Gagal membaca database: "+(err.message || "Semak akses Supabase."));
  }
});
$("logout-button").addEventListener("click", async () => { await client.auth.signOut(); setSignedOut(); });
(async function init() {
  $("year").textContent = new Date().getFullYear();
  const { data:{session} } = await client.auth.getSession();
  if (!session) { setSignedOut(); return; }
  try { setSignedIn(session.user); await loadDashboard(); }
  catch (err) { await client.auth.signOut(); setSignedOut(); showMessage("Sambungan database gagal: "+(err.message || "Cuba lagi.")); }
})();
