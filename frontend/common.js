/* Tiện ích dùng chung cho app bệnh nhân và trang quản trị */
'use strict';

const SLOTS = { sang: 'Sáng', trua: 'Trưa', chieu: 'Chiều', toi: 'Tối', truoc_ngu: 'Trước khi ngủ' };
const SLOT_ORDER = ['sang', 'trua', 'chieu', 'toi', 'truoc_ngu'];
const SYMPTOMS = [
  'Buồn nôn',
  'Bủn rủn, vã mồ hôi, đói lả',
  'Chóng mặt',
  'Đau đầu',
  'Đi ngoài nhiều lần',
  'Nổi mẩn đỏ, ngứa ngáy',
  'Mệt mỏi',
  'Khác',
];
const SEVERITY = { nhe: 'Nhẹ', vua: 'Vừa', nang: 'Nặng' };
const SEVERITY_PATIENT = {
  nhe: 'Nhẹ (Hơi khó chịu, vẫn sinh hoạt bình thường)',
  vua: 'Vừa (Khá mệt, phải nghỉ ngơi)',
  nang: 'Nặng (Rất nghiêm trọng, cần gọi bác sĩ)',
};
const TOD = { fasting: 'Lúc đói', after_meal: 'Sau ăn' };
const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Tạo phần tử DOM an toàn (chỉ dùng textContent, không bao giờ innerHTML với dữ liệu người dùng). */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function vnToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(new Date()); // YYYY-MM-DD
}
function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}
function fmtLongToday() {
  return new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: VN_TZ,
  });
}

let _toastTimer;
function toast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-3 rounded-xl text-white font-semibold shadow-lg ' +
    (type === 'error' ? 'bg-red-600' : 'bg-teal-700');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden-view'), 3500);
}

function show(el, on) { el.classList.toggle('hidden-view', !on); }
function setError(el, msg) { el.textContent = msg || ''; show(el, !!msg); }

function renderLoadingError(errorMsg, detail = '') {
  const lv = document.getElementById('view-loading');
  if (!lv) return;
  lv.className = 'min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50';
  lv.innerHTML = `
    <div class="max-w-md w-full mx-auto p-6 bg-white border border-rose-200 rounded-3xl shadow-xl text-center fade-in">
      <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl font-black">⚠️</div>
      <h2 class="font-extrabold text-slate-800 text-lg mb-1.5">Không thể tải ứng dụng</h2>
      <p class="text-sm text-rose-600 font-semibold mb-2">${errorMsg || 'Đã xảy ra sự cố khi kết nối máy chủ.'}</p>
      ${detail ? `<p class="text-xs text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-xl text-left font-mono break-all">${detail}</p>` : ''}
      <div class="space-y-2 mt-4">
        <button onclick="location.reload()" class="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-md transition-all">Thử lại (Tải lại trang)</button>
        <p class="text-[11px] text-slate-400">Gợi ý: Nếu bạn dùng gói Render Free, máy chủ sẽ tự ngủ sau 15 phút và cần ~50 giây để khởi động lại.</p>
      </div>
    </div>
  `;
}

async function loadConfig() {
  const note = document.getElementById('loading-note');
  const timer = setTimeout(() => {
    if (note) {
      note.innerHTML = '⏳ Máy chủ Render đang khởi động (Cold Start có thể mất ~50 giây).<br>Vui lòng đợi trong giây lát…';
      note.classList.remove('hidden-view');
    }
  }, 3500);

  try {
    const res = await fetch('/api/config');
    clearTimeout(timer);
    if (!res.ok) throw new Error('Không thể tải cấu hình từ máy chủ (HTTP ' + res.status + ')');
    const cfg = await res.json();
    if (!cfg.supabase_key) throw new Error('Máy chủ chưa cấu hình SUPABASE_PUBLISHABLE_KEY');
    return cfg;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

function validateNewPassword(p1, p2) {
  if (p1.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
  if (p1 === '123456') return 'Không dùng mật khẩu mặc định 123456';
  if (p1 !== p2) return 'Hai mật khẩu không khớp';
  return '';
}
