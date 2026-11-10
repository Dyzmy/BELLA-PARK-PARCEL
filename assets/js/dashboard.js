// BELLA PARK - live Supabase dashboard. Public pages only receive masked tracking values.
const SUPABASE_URL = "https://xudgvklvdonsyjeendkj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Q7mDg46N_FP9_bPdrsRSLQ_sJY28ppU";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
let pickupRecords = [];
let activeDriver = null;
let activeMonthKey = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function localParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Asia/Kuala_Lumpur", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function localMonth(value) { const p=localParts(value); return p.year+"-"+p.month+"-01"; }
function localDateKey(value) { const p=localParts(value); return p.year+"-"+p.month+"-"+p.day; }
function formatDateKey(key) {
  const [y,m,d]=key.split("-").map(Number);
  return new Intl.DateTimeFormat("ms-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",year:"numeric"}).format(new Date(Date.UTC(y,m-1,d,12))).toUpperCase();
}
function formatTime(value) {
  return new Intl.DateTimeFormat("ms-MY",{timeZone:"Asia/Kuala_Lumpur",hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(value));
}
function monthTitle(key) {
  const [year,month]=key.split("-").map(Number);
  return new Intl.DateTimeFormat("ms-MY",{month:"long",year:"numeric"}).format(new Date(year,month-1,1)).toUpperCase();
}
function showMessage(message,isError=true) {
  $("auth-message").textContent=message;
  $("auth-message").classList.toggle("error",isError);
}
function setSignedIn(user) {
  $("auth-screen").hidden=true; $("dashboard-content").hidden=false;
  $("logout-button").hidden=false; $("connection-label").textContent=user.email||"STAFF SIGNED IN";
}
function setSignedOut() {
  $("auth-screen").hidden=false; $("dashboard-content").hidden=true;
  $("logout-button").hidden=true; $("connection-label").textContent="SECURE STAFF DASHBOARD";
}
async function loadDashboard() {
  const {data:profile,error:profileError}=await client.from("staff_profiles").select("display_name,role").single();
  if(profileError||!profile||!["admin","scanner","viewer"].includes(profile.role)) {
    await client.auth.signOut(); setSignedOut(); showMessage("Akaun ini tiada akses staf BELLA PARK. Hubungi pentadbir."); return;
  }
  const {data:sessions,error:sessionError}=await client.from("pickup_sessions")
    .select("id,courier,driver_name,picked_up_at,month_key").order("picked_up_at",{ascending:false}).limit(1000);
  if(sessionError) throw sessionError;
  const {data:parcels,error:parcelError}=await client.from("parcel_records_masked")
    .select("session_id,tracking_masked,created_at").limit(5000);
  if(parcelError) throw parcelError;
  const bySession=new Map();
  (parcels||[]).forEach(p=>{if(!bySession.has(p.session_id))bySession.set(p.session_id,[]);bySession.get(p.session_id).push(p.tracking_masked);});
  pickupRecords=(sessions||[]).map(s=>({
    id:s.id, timestamp:s.picked_up_at, dateKey:localDateKey(s.picked_up_at),
    month:localMonth(s.picked_up_at), time:formatTime(s.picked_up_at),
    hour:Number(localParts(s.picked_up_at).hour), minute:Number(localParts(s.picked_up_at).minute),
    courier:s.courier||"-", rider:(s.driver_name||"").trim()||"TIDAK DINYATAKAN",
    tracking:bySession.get(s.id)||[]
  }));
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit"}).format(new Date());
  const currentMonth=today+"-01";
  const drivers=[...new Set(pickupRecords.map(r=>r.rider))].sort((a,b)=>a.localeCompare(b));
  activeDriver=drivers[0]||null;
  const driverMonths=pickupRecords.filter(r=>r.rider===activeDriver).map(r=>r.month);
  activeMonthKey=driverMonths.includes(currentMonth)?currentMonth:[...new Set(driverMonths)].sort().reverse()[0]||currentMonth;
  $("year").textContent=localParts(new Date()).year;
  $("today-label").textContent=new Intl.DateTimeFormat("ms-MY",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"full"}).format(new Date()).toUpperCase();
  renderDrivers();
  renderMonthSummary();
  renderRecords();
}
function recordsForMonth(key) { return pickupRecords.filter(r=>r.rider===activeDriver&&r.month===key); }
function renderDrivers() {
  const drivers=[...new Set(pickupRecords.map(r=>r.rider))].sort((a,b)=>a.localeCompare(b));
  $("driver-summary").innerHTML=drivers.length?drivers.map(name=>{
    const rows=pickupRecords.filter(r=>r.rider===name);
    const total=rows.reduce((n,r)=>n+r.tracking.length,0);
    return `<button type="button" class="driver-card ${name===activeDriver?"active":""}" data-driver="${escapeHtml(name)}">
      <span class="driver-card-label">DRIVER / RIDER</span><strong>${escapeHtml(name)}</strong>
      <span class="driver-card-foot">${total.toLocaleString("ms-MY")} PARCEL · ${rows.length} PICKUP</span>
    </button>`;
  }).join(""):'<p class="month-empty">Belum ada rekod pickup.</p>';
  document.querySelectorAll("[data-driver]").forEach(button=>button.addEventListener("click",()=>{
    activeDriver=button.dataset.driver;
    const current=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit"}).format(new Date())+"-01";
    const keys=[...new Set(pickupRecords.filter(r=>r.rider===activeDriver).map(r=>r.month))].sort().reverse();
    activeMonthKey=keys.includes(current)?current:(keys[0]||current);
    renderDrivers(); renderMonthSummary(); renderRecords();
  }));
}
function renderMonthSummary() {
  const totalsByMonth=new Map();
  pickupRecords.filter(r=>r.rider===activeDriver).forEach(r=>{
    if(!totalsByMonth.has(r.month))totalsByMonth.set(r.month,{parcels:0,sessions:0});
    const item=totalsByMonth.get(r.month); item.parcels+=r.tracking.length; item.sessions++;
  });
  const months=[...totalsByMonth.keys()].sort().reverse();
  $("month-summary").innerHTML=months.length?months.map(key=>{
    const total=totalsByMonth.get(key);
    return `<button type="button" class="month-card ${key===activeMonthKey?"active":""}" data-month="${escapeHtml(key)}">
      <span class="month-card-title">${monthTitle(key)}</span><strong>${total.parcels.toLocaleString("ms-MY")}</strong>
      <span class="month-card-foot">PARCEL · ${total.sessions} PICKUP</span></button>`;
  }).join(""):'<p class="month-empty">Belum ada arkib untuk nama ini.</p>';
  document.querySelectorAll("[data-month]").forEach(button=>button.addEventListener("click",()=>{
    activeMonthKey=button.dataset.month; renderMonthSummary(); renderRecords();
  }));
  const selected=recordsForMonth(activeMonthKey);
  const total=selected.reduce((n,r)=>n+r.tracking.length,0);
  $("grand-total").textContent=total.toLocaleString("ms-MY");
  $("spx-total").textContent=selected.filter(r=>r.courier==="SPX").reduce((n,r)=>n+r.tracking.length,0).toLocaleString("ms-MY");
  $("jt-total").textContent=selected.filter(r=>r.courier==="J&T").reduce((n,r)=>n+r.tracking.length,0).toLocaleString("ms-MY");
  $("ninja-total").textContent=selected.filter(r=>r.courier==="NINJA").reduce((n,r)=>n+r.tracking.length,0).toLocaleString("ms-MY");
  document.querySelector(".total-card .stat-label").textContent="TOTAL PARCEL · "+(activeDriver||"DRIVER")+" · "+monthTitle(activeMonthKey);
  document.querySelector(".total-card .stat-foot").textContent="Jumlah parcel individu bagi bulan dipilih";
  $("archive-driver-title").textContent=activeDriver||"Pilih driver";
}
function renderRecords() {
  const records=recordsForMonth(activeMonthKey);
  const [year,month]=activeMonthKey.split("-").map(Number);
  const daysInMonth=new Date(year,month,0).getDate();
  const query=$("search-input").value.trim().toLowerCase();
  const courierFilter=$("courier-filter").value;
  const rows=[];
  for(let day=1;day<=daysInMonth;day++){
    const key=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
    const dayRecords=records.filter(r=>r.dateKey===key);
    const visible=dayRecords.filter(r=>(courierFilter==="ALL"||r.courier===courierFilter)&&
      [r.dateKey,r.time,r.courier,r.rider,...r.tracking].join(" ").toLowerCase().includes(query));
    if(query||courierFilter!=="ALL"){if(!visible.length)continue;}
    const pagi=dayRecords.filter(r=>r.hour<14);
    const petang=dayRecords.filter(r=>r.hour>=14&&r.hour<=17);
    const luar=dayRecords.filter(r=>r.hour>17);
    const pagiTotal=pagi.reduce((n,r)=>n+r.tracking.length,0);
    const petangTotal=petang.reduce((n,r)=>n+r.tracking.length,0);
    const total=dayRecords.reduce((n,r)=>n+r.tracking.length,0);
    const couriers=[...new Set(dayRecords.map(r=>r.courier))].join(", ");
    const detailIds=dayRecords.map(r=>r.id).join(",");
    rows.push(`<tr><td>${formatDateKey(key)}</td>
      <td>${pagi.length?`<button class="total-link" type="button" data-records="${escapeHtml(pagi.map(r=>r.id).join(","))}">${pagiTotal.toLocaleString("ms-MY")}#</button>`:""}</td>
      <td>${petang.length?`<button class="total-link" type="button" data-records="${escapeHtml(petang.map(r=>r.id).join(","))}">${petangTotal.toLocaleString("ms-MY")}#</button>`:""}</td>
      <td>${escapeHtml(couriers)}${luar.length?`<small class="outside-hours">Luar waktu: ${luar.reduce((n,r)=>n+r.tracking.length,0)}#</small>`:""}</td>
      <td><strong>${total?total.toLocaleString("ms-MY")+"#":""}</strong></td></tr>`);
  }
  $("records-body").innerHTML=rows.length?rows.join(""):'<tr><td class="empty-row" colspan="5">Tiada rekod sepadan.</td></tr>';
  document.querySelectorAll("[data-records]").forEach(button=>button.addEventListener("click",()=>showDetails(button.dataset.records.split(","))));
}
function showDetails(ids) {
  const selected=pickupRecords.filter(r=>ids.includes(r.id));
  if(!selected.length)return;
  const allTracking=selected.flatMap(r=>r.tracking);
  $("modal-title").textContent="Tracking Parcel";
  $("detail-meta").innerHTML=[["DRIVER / RIDER",activeDriver],["TARIKH",formatDateKey(selected[0].dateKey)],["SESI",selected.map(r=>r.time).join(", ")],["COURIER",[...new Set(selected.map(r=>r.courier))].join(", ")],["TOTAL",allTracking.length+" parcel"]]
    .map(([label,value])=>`<div class="meta-item"><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`).join("");
  $("tracking-count").textContent=allTracking.length+" tracking (masked)";
  $("tracking-list").innerHTML=allTracking.map(t=>`<li>${escapeHtml(t)}</li>`).join("");
  $("detail-modal").classList.add("open"); $("detail-modal").setAttribute("aria-hidden","false");
}
function closeDetail(){ $("detail-modal").classList.remove("open"); $("detail-modal").setAttribute("aria-hidden","true"); }
$("close-modal").addEventListener("click",closeDetail);
$("detail-modal").addEventListener("click",e=>{if(e.target===$("detail-modal"))closeDetail();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail();});
$("search-input").addEventListener("input",renderRecords);
$("courier-filter").addEventListener("change",renderRecords);
$("export-button").addEventListener("click",()=>{
  const lines=[["Driver / Rider","Bulan","Tarikh","Pagi","Petang","Courier","Jumlah"]];
  const [year,month]=activeMonthKey.split("-").map(Number);
  const days=new Date(year,month,0).getDate();
  for(let d=1;d<=days;d++){
    const key=year+"-"+String(month).padStart(2,"0")+"-"+String(d).padStart(2,"0");
    const rs=recordsForMonth(activeMonthKey).filter(r=>r.dateKey===key);
    const morning=rs.filter(r=>r.hour<14).reduce((n,r)=>n+r.tracking.length,0);
    const afternoon=rs.filter(r=>r.hour>=14&&r.hour<=17).reduce((n,r)=>n+r.tracking.length,0);
    lines.push([activeDriver,activeMonthKey,key,morning||"",afternoon||rs.filter(r=>!(r.hour*60+r.minute>=540&&r.hour*60+r.minute<=780)&&!(r.hour*60+r.minute>=840&&r.hour*60+r.minute<=1050)).reduce((n,r)=>n+r.tracking.length,0)||"",[...new Set(rs.map(r=>r.courier))].join(", "),rs.reduce((n,r)=>n+r.tracking.length,0)||""]);
  }
  const csv=lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="bella-park-"+String(activeDriver||"driver").replace(/[^a-z0-9]/gi,"-")+"-"+activeMonthKey+".csv";a.click();URL.revokeObjectURL(url);
});
$("login-form").addEventListener("submit",async event=>{
  event.preventDefault();const button=$("login-submit");button.disabled=true;button.textContent="SEDANG LOG MASUK...";showMessage("",false);
  const {data,error}=await client.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});
  button.disabled=false;button.textContent="LOG MASUK";
  if(error){showMessage("Log masuk gagal. Semak email dan password.");return;}
  try{setSignedIn(data.user);await loadDashboard();}
  catch(err){await client.auth.signOut();setSignedOut();showMessage("Gagal membaca database: "+(err.message||"Semak akses Supabase."));}
});
$("logout-button").addEventListener("click",async()=>{await client.auth.signOut();setSignedOut();});
(async function init(){
  $("year").textContent=new Date().getFullYear();
  const {data:{session}}=await client.auth.getSession();
  if(!session){setSignedOut();return;}
  try{setSignedIn(session.user);await loadDashboard();}
  catch(err){await client.auth.signOut();setSignedOut();showMessage("Sambungan database gagal: "+(err.message||"Cuba lagi."));}
})();