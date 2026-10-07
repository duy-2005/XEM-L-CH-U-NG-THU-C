/* Tiện ích dùng chung cho app bệnh nhân và trang quản trị */
'use strict';

const SLOTS = { sang: 'Sáng', trua: 'Trưa', chieu: 'Chiều', toi: 'Tối', truoc_ngu: 'Trước khi ngủ' };
const SLOT_ORDER = ['sang', 'trua', 'chieu', 'toi', 'truoc_ngu'];
const SYMPTOMS = ['Buồn nôn', 'Hạ đường huyết', 'Chóng mặt', 'Đau đầu', 'Tiêu chảy', 'Phát ban', 'Mệt mỏi', 'Khác'];
const SEVERITY = { nhe: 'Nhẹ', vua: 'Vừa', nang: 'Nặng' };
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

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Không tải được cấu hình');
  const cfg = await res.json();
  if (!cfg.supabase_key) throw new Error('Chưa cấu hình SUPABASE_PUBLISHABLE_KEY');
  return cfg;
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
