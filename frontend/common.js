/* Tiện ích dùng chung cho app bệnh nhân và trang quản trị */
'use strict';

const SLOTS = { sang: 'Sáng', trua: 'Trưa', chieu: 'Chiều', toi: 'Tối', truoc_ngu: 'Trước khi ngủ' };
const SLOT_ORDER = ['sang', 'trua', 'chieu', 'toi', 'truoc_ngu'];
const DEFAULT_SLOT_TIMES = {
  sang: '07:00',
  trua: '11:30',
  chieu: '16:30',
  toi: '19:00',
  truoc_ngu: '21:30',
};

function parsePrescriptionTimes(p) {
  const res = { times: {}, cleanInstruction: p && p.instruction ? p.instruction : '' };
  if (!p || !p.instruction) return res;
  const match = p.instruction.match(/\[TIMES:([^\]]+)\]/);
  if (match) {
    const list = match[1].split(',').map((t) => t.trim()).filter(Boolean);
    (p.frequency || []).forEach((slot, idx) => {
      if (list[idx]) res.times[slot] = list[idx];
    });
    res.cleanInstruction = p.instruction.replace(match[0], '').trim();
  }
  return res;
}

function getPrescriptionTime(p, slot) {
  const parsed = parsePrescriptionTimes(p);
  return parsed.times[slot] || DEFAULT_SLOT_TIMES[slot] || '07:00';
}

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
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoStr) {
  if (!isoStr) return 'Mới đây';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (e) {
    return String(isoStr);
  }
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
    try { localStorage.setItem('dtd_cached_config', JSON.stringify(cfg)); } catch (e) {}
    return cfg;
  } catch (err) {
    clearTimeout(timer);
    try {
      const cached = localStorage.getItem('dtd_cached_config');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    throw err;
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function validateNewPassword(p1, p2) {
  if (p1.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
  if (p1 === '123456') return 'Không dùng mật khẩu mặc định 123456';
  if (!/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1)) {
    return 'Mật khẩu phải bao gồm cả chữ cái và chữ số (ví dụ: Matkhau123)';
  }
  if (p1 !== p2) return 'Hai mật khẩu không khớp';
  return '';
}

/* --- TIỆN ÍCH NHẬN DIỆN GIỌNG NÓI (SPEECH-TO-TEXT TIẾNG VIỆT) --- */
function isSpeechSupported() {
  return typeof window !== 'undefined' && (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));
}

/** Chuyển đổi chuỗi tiếng Việt nói số sang số thực (ví dụ: 'sáu phẩy năm' -> 6.5, 'bảy chấm hai' -> 7.2, '5 chấm 8' -> 5.8). */
function parseVietnameseNumber(text) {
  if (!text) return null;
  text = text.toLowerCase().trim();

  // 1. Chuẩn hóa dạng "5 chấm 8" hoặc "5 phẩy 8" thành "5.8"
  text = text.replace(/(\d+)\s*(?:chấm|phẩy)\s*(\d+)/g, '$1.$2');

  // 2. Nếu đã có số thập phân trực tiếp dạng 6.5 hoặc 6,5
  const directFloat = text.match(/\b\d+[.,]\d+\b/);
  if (directFloat) {
    const n = parseFloat(directFloat[0].replace(',', '.'));
    if (!isNaN(n)) return n;
  }

  const wordMap = {
    'không': 0, 'khong': 0,
    'một': 1, 'mot': 1, 'mốt': 1,
    'hai': 2,
    'ba': 3,
    'bốn': 4, 'bon': 4, 'tư': 4,
    'năm': 5, 'nam': 5, 'lăm': 5,
    'sáu': 6, 'sau': 6,
    'bảy': 7, 'bay': 7, 'bẩy': 7,
    'tám': 8, 'tam': 8,
    'chín': 9, 'chin': 9,
    'mười': 10, 'muoi': 10,
  };

  function parsePart(str) {
    if (!str) return null;
    str = str.trim();
    const dMatch = str.match(/\b\d+\b/);
    if (dMatch) return parseInt(dMatch[0], 10);
    const words = str.split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    if (words.length === 1 && wordMap[words[0]] !== undefined) {
      return wordMap[words[0]];
    }
    // Ghép số tiếng Việt như "mười hai" -> 12, "hai mươi lăm" -> 25
    let total = 0;
    let temp = 0;
    for (const w of words) {
      if (wordMap[w] !== undefined) {
        temp += wordMap[w];
      } else if (w === 'mươi' || w === 'chục') {
        temp = (temp || 1) * 10;
        total += temp;
        temp = 0;
      } else if (w === 'trăm') {
        temp = (temp || 1) * 100;
        total += temp;
        temp = 0;
      }
    }
    return total + temp || null;
  }

  // Tách phần nguyên và phần thập phân qua từ khóa 'chấm', 'phẩy', '.', ','
  const parts = text.split(/\s*(?:chấm|phẩy|\.|\,)\s*/);
  if (parts.length >= 2) {
    const whole = parsePart(parts[0]);
    const frac = parsePart(parts[1]);
    if (whole !== null && frac !== null) {
      return parseFloat(`${whole}.${frac}`);
    }
  }

  const single = parsePart(text);
  if (single !== null) return single;
  return null;
}

/** Tự động nhận diện ngữ cảnh đường huyết (Lúc đói / Sau ăn) từ lời nói */
function detectSugarContext(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes('đói') || t.includes('sáng sớm') || t.includes('chưa ăn') || t.includes('trước ăn') || t.includes('nhịn ăn')) {
    return 'fasting';
  }
  if (t.includes('sau ăn') || t.includes('sau khi ăn') || t.includes('no') || t.includes('sau bữa') || t.includes('2 tiếng') || t.includes('2 giờ')) {
    return 'after_meal';
  }
  return null;
}

/** Tự động trích xuất các triệu chứng thuốc được nhắc đến trong lời nói */
function detectSymptomsFromSpeech(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  const map = [
    { name: 'Buồn nôn', keys: ['buồn nôn', 'nôn nao', 'muốn nôn', 'mắc nôn', 'nôn ói', 'nôn'] },
    { name: 'Bủn rủn, vã mồ hôi, đói lả', keys: ['bủn rủn', 'vã mồ hôi', 'đói lả', 'toát mồ hôi', 'run tay', 'run chân', 'đói cồn cào'] },
    { name: 'Chóng mặt', keys: ['chóng mặt', 'hoa mắt', 'choáng váng', 'chao đảo', 'xây xẩm', 'choáng'] },
    { name: 'Đau đầu', keys: ['đau đầu', 'nhức đầu', 'buốt đầu'] },
    { name: 'Đi ngoài nhiều lần', keys: ['đi ngoài', 'tiêu chảy', 'táo bón', 'đau bụng', 'đi phân lỏng', 'đi lỏng'] },
    { name: 'Nổi mẩn đỏ, ngứa ngáy', keys: ['mẩn đỏ', 'ngứa ngáy', 'dị ứng', 'phát ban', 'nổi ngứa', 'ngứa', 'mề đay'] },
    { name: 'Mệt mỏi', keys: ['mệt mỏi', 'uể oải', 'đuối sức', 'kiệt sức', 'người mệt', 'mệt'] },
  ];
  const detected = [];
  for (const item of map) {
    if (item.keys.some((k) => t.includes(k))) {
      detected.push(item.name);
    }
  }
  return detected;
}

/** Trình điều khiển kết nối nút bấm nói với ô nhập liệu */
let _activeVoiceRecognition = null;
function setupVoiceButton({
  buttonEl,
  inputEl,
  mode = 'append', // 'append' | 'replace' | 'number'
  statusEl = null,
  onResult = null, // callback(finalText, interimText)
  onParsed = null, // callback(resultObj)
}) {
  if (!buttonEl) return;
  const originalHtml = buttonEl.innerHTML;

  function stopCurrent() {
    if (_activeVoiceRecognition) {
      try { _activeVoiceRecognition.stop(); } catch (e) {}
      _activeVoiceRecognition = null;
    }
    buttonEl.classList.remove('is-recording');
    buttonEl.innerHTML = originalHtml;
  }

  buttonEl.addEventListener('click', (e) => {
    e.preventDefault();

    if (!isSpeechSupported()) {
      toast('Trình duyệt chưa hỗ trợ nhận diện giọng nói trực tiếp. Bạn có thể bấm vào bàn phím và chọn nút Micro để nói.', 'error');
      return;
    }

    // Nếu đang ghi âm thì bấm lại để dừng
    if (buttonEl.classList.contains('is-recording')) {
      stopCurrent();
      return;
    }

    // Dừng phiên đang chạy ở nút khác nếu có
    stopCurrent();

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
      _activeVoiceRecognition = recognition;
      buttonEl.classList.add('is-recording');
      buttonEl.innerHTML = `<span class="voice-wave"><i class="voice-wave-bar"></i><i class="voice-wave-bar"></i><i class="voice-wave-bar"></i></span><span>Đang nghe…</span>`;
      if (statusEl) {
        statusEl.textContent = '🔴 Đang nghe bạn nói... (Bấm nút để dừng)';
        show(statusEl, true);
      }
      if (navigator.vibrate) navigator.vibrate(40);
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      const currentText = (finalTranscript + ' ' + interim).trim();

      if (mode === 'number') {
        const val = parseVietnameseNumber(currentText);
        if (inputEl && val !== null && val > 0 && val <= 50) {
          inputEl.value = val;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (statusEl) {
          statusEl.textContent = `🎙️ "${currentText}"` + (val ? ` → ${val} mmol/L` : '');
        }
      } else if (inputEl) {
        if (statusEl) {
          statusEl.textContent = `🎙️ Đang nghe: "${currentText}"`;
        }
      }

      if (onResult) onResult(finalTranscript.trim(), interim.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        toast('Chưa cấp quyền Micro cho trình duyệt. Vui lòng cho phép quyền micro để nói.', 'error');
      } else if (event.error === 'no-speech') {
        toast('Không nghe thấy tiếng nói. Hãy thử bấm lại và nói to hơn nhé.', 'error');
      } else if (event.error !== 'aborted') {
        toast('Lỗi nhận diện giọng nói: ' + event.error, 'error');
      }
    };

    recognition.onend = () => {
      _activeVoiceRecognition = null;
      buttonEl.classList.remove('is-recording');
      buttonEl.innerHTML = originalHtml;
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

      const text = finalTranscript.trim();
      if (text) {
        if (mode === 'number') {
          const num = parseVietnameseNumber(text);
          const sugarContext = detectSugarContext(text);
          if (inputEl && num !== null && num > 0 && num <= 50) {
            inputEl.value = num;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            toast(`✓ Đã nhận diện số đo: ${num} mmol/L` + (sugarContext ? ` (${sugarContext === 'fasting' ? 'Lúc đói' : 'Sau ăn'})` : ''));
          } else if (inputEl && !inputEl.value) {
            toast(`Không nhận diện được số đo từ "${text}". Vui lòng thử lại.`, 'error');
          }
          if (onParsed) onParsed({ text, number: num, context: sugarContext });
        } else if (mode === 'append' && inputEl) {
          const old = inputEl.value.trim();
          inputEl.value = old ? (old + '. ' + text.charAt(0).toUpperCase() + text.slice(1)) : (text.charAt(0).toUpperCase() + text.slice(1));
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          toast('✓ Đã điền xong nội dung bạn nói');
          if (onParsed) onParsed({ text });
        } else if (mode === 'replace' && inputEl) {
          inputEl.value = text.charAt(0).toUpperCase() + text.slice(1);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          toast('✓ Đã điền xong nội dung bạn nói');
          if (onParsed) onParsed({ text });
        }
      }

      if (statusEl) {
        setTimeout(() => show(statusEl, false), 2500);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      stopCurrent();
    }
  });
}

