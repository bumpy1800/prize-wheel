import {
  resolveSpin,
  segmentLayout,
  targetRotationDeg,
  normalizePrizes,
  defaultPrizes,
  percentsFromTotals,
  parseGroupedInt,
  formatGroupedInt,
  wrapLabelLines,
} from './wheel-logic.js';

/** @type {import('./wheel-logic.js').Prize[]} */
let prizes = defaultPrizes();
let spinning = false;
let currentRotation = 0;

const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spinBtn');
const winDialog = document.getElementById('winDialog');
const winName = document.getElementById('winName');
const statusEl = document.getElementById('status');
const adminEl = document.getElementById('admin');
const adminBody = document.getElementById('adminBody');
const adminMsg = document.getElementById('adminMsg');

const fetchJson = async (url, options) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
};

const loadPrizesFromServer = async () => {
  const data = await fetchJson('/api/prizes');
  prizes = normalizePrizes(data.prizes);
};

const persistPrizes = async () => {
  const data = await fetchJson('/api/prizes', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prizes }),
  });
  prizes = normalizePrizes(data.prizes);
};

const setStatus = (msg, warn = false) => {
  statusEl.textContent = msg;
  statusEl.classList.toggle('warn', warn);
};

const paintWheel = () => {
  const segments = segmentLayout(prizes);
  const { width, height } = canvas;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(cx, cy) - 4;

  ctx.clearRect(0, 0, width, height);

  if (segments.length === 0) {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#aaa';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('경품 없음', cx, cy);
    return;
  }

  // Canvas: 0 rad = east; 0° layout = north (top), clockwise
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;

  for (const seg of segments) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, toRad(seg.startDeg), toRad(seg.endDeg));
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const sweep = seg.endDeg - seg.startDeg;
    const mid = (seg.startDeg + seg.endDeg) / 2;
    const midRad = toRad(mid);
    const lr = r * 0.64;
    const lx = cx + Math.cos(midRad) * lr;
    const ly = cy + Math.sin(midRad) * lr;
    const sweepRad = (sweep * Math.PI) / 180;
    const maxW = Math.max(18, 2 * lr * Math.sin(sweepRad / 2) * 0.72);
    const maxH = r * 0.3;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r - 10, toRad(seg.startDeg), toRad(seg.endDeg));
    ctx.closePath();
    ctx.clip();

    ctx.translate(lx, ly);
    ctx.rotate(midRad + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let fontSize = 22;
    let lines = [];
    let lineH = fontSize * 1.15;
    while (fontSize >= 11) {
      ctx.font = `bold ${fontSize}px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
      lineH = fontSize * 1.15;
      const maxLines = Math.max(1, Math.floor(maxH / lineH));
      lines = wrapLabelLines(seg.name, maxW, (t) => ctx.measureText(t).width);
      const widest = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
      if (lines.length <= maxLines && widest <= maxW + 0.5) break;
      fontSize -= 1;
    }

    const fit = Math.max(1, Math.floor(maxH / lineH));
    const shown = lines.slice(0, fit);
    const totalH = (shown.length - 1) * lineH;
    shown.forEach((line, i) => {
      ctx.fillText(line, 0, -totalH / 2 + i * lineH);
    });
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 6;
  ctx.stroke();
};

const openWinModal = (name) => {
  winName.textContent = name;
  if (!winDialog.open) winDialog.showModal();
};

const closeWinModal = () => {
  if (winDialog.open) winDialog.close();
};

const SPIN_TRANSITION = 'transform 3.4s cubic-bezier(0.12, 0.75, 0.12, 1)';
let waitSpinFrame = 0;

const setWheelDeg = (deg, animate = false) => {
  currentRotation = deg;
  canvas.style.transition = animate ? SPIN_TRANSITION : 'none';
  canvas.style.transform = `rotate(${deg}deg)`;
};

const visualWheelDeg = () => {
  const m = new DOMMatrix(getComputedStyle(canvas).transform);
  let deg = Math.atan2(m.b, m.a) * (180 / Math.PI);
  if (deg < 0) deg += 360;
  return deg;
};

const startWaitSpin = () => {
  cancelAnimationFrame(waitSpinFrame);
  canvas.style.transition = 'none';
  const origin = currentRotation;
  const t0 = performance.now();
  const tick = (now) => {
    setWheelDeg(origin + ((now - t0) / 1000) * 540);
    waitSpinFrame = requestAnimationFrame(tick);
  };
  waitSpinFrame = requestAnimationFrame(tick);
};

const stopWaitSpin = () => {
  cancelAnimationFrame(waitSpinFrame);
  waitSpinFrame = 0;
  setWheelDeg(visualWheelDeg());
};

const refresh = () => {
  paintWheel();
  setWheelDeg(currentRotation, false);
};

const runSpin = async () => {
  if (spinning) return;

  spinning = true;
  spinBtn.disabled = true;
  setStatus('돌리는 중…');
  const layoutBefore = segmentLayout(prizes);
  startWaitSpin();

  let outcome;
  try {
    outcome = await fetchJson('/api/spin', { method: 'POST' });
  } catch (err) {
    stopWaitSpin();
    spinning = false;
    spinBtn.disabled = false;
    setStatus(Error.isError(err) ? err.message : '서버에 연결하지 못했습니다.', true);
    return;
  }

  stopWaitSpin();

  if (outcome.winnerId == null) {
    spinning = false;
    spinBtn.disabled = false;
    prizes = normalizePrizes(outcome.prizes || prizes);
    refresh();
    setStatus('남은 경품이 없습니다. 관리자에서 수량을 채워 주세요.', true);
    return;
  }

  const winSeg = layoutBefore.find((s) => s.id === outcome.winnerId);
  prizes = normalizePrizes(outcome.prizes);

  if (!winSeg) {
    spinning = false;
    spinBtn.disabled = false;
    refresh();
    openWinModal(outcome.winner?.name ?? '당첨');
    return;
  }

  const extraSpins = 4 + Math.floor(Math.random() * 2);
  const align = targetRotationDeg(winSeg, 0);
  const curMod = ((currentRotation % 360) + 360) % 360;
  let add = (align - curMod + 360) % 360;
  if (add < 20) add += 360;
  const finalRot = currentRotation + add + extraSpins * 360;

  void canvas.offsetWidth;
  setWheelDeg(finalRot, true);

  const onEnd = (ev) => {
    if (ev.propertyName && ev.propertyName !== 'transform') return;
    canvas.removeEventListener('transitionend', onEnd);
    spinning = false;
    spinBtn.disabled = false;
    const name = outcome.winner?.name ?? '당첨';
    openWinModal(name);
    setStatus('확인 후 다시 돌릴 수 있습니다.');
    paintWheel();
  };
  canvas.addEventListener('transitionend', onEnd);
};

/* —— Admin —— */
const isAdminHash = () => location.hash.replace(/^#/, '') === 'admin';

const openAdmin = () => {
  document.body.classList.add('admin-open');
  adminEl.hidden = false;
  if (!isAdminHash()) {
    history.replaceState(null, '', `${location.pathname}${location.search}#admin`);
  }
  renderAdminForm();
};

const closeAdmin = () => {
  document.body.classList.remove('admin-open');
  adminEl.hidden = true;
  if (isAdminHash()) {
    history.replaceState(null, '', `${location.pathname}${location.search}#play`);
  }
  adminMsg.textContent = '';
};

const renderAdminForm = () => {
  adminBody.replaceChildren(
    ...prizes.map((p, index) => {
      const tr = document.createElement('tr');
      tr.dataset.index = String(index);

      const nameTd = document.createElement('td');
      nameTd.className = 'name-cell';
      const nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.dataset.field = 'name';
      nameIn.value = p.name;
      nameTd.append(nameIn);

      const shareTd = document.createElement('td');
      const shareIn = document.createElement('input');
      shareIn.type = 'number';
      shareIn.dataset.field = 'share';
      shareIn.min = '0';
      shareIn.step = '1';
      shareIn.value = String(p.share);
      shareTd.append(shareIn);

      const totalTd = document.createElement('td');
      const totalIn = document.createElement('input');
      totalIn.type = 'text';
      totalIn.inputMode = 'numeric';
      totalIn.autocomplete = 'off';
      totalIn.dataset.field = 'total';
      totalIn.className = 'grouped-int';
      totalIn.value = formatGroupedInt(p.total);
      totalIn.addEventListener('input', () => {
        formatTotalInput(totalIn);
        fillFromTotals();
      });
      totalTd.append(totalIn);

      const remTd = document.createElement('td');
      const remIn = document.createElement('input');
      remIn.type = 'number';
      remIn.dataset.field = 'remaining';
      remIn.min = '0';
      remIn.step = '1';
      remIn.readOnly = true;
      remIn.tabIndex = -1;
      remIn.classList.add('readonly');
      remIn.value = String(p.remaining);
      remTd.append(remIn);

      const colorTd = document.createElement('td');
      const colorIn = document.createElement('input');
      colorIn.type = 'color';
      colorIn.dataset.field = 'color';
      colorIn.value = p.color || '#888888';
      colorTd.append(colorIn);

      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'row-del';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => {
        prizes = prizes.filter((_, i) => i !== index);
        refresh();
        renderAdminForm();
      });
      delTd.append(delBtn);

      tr.append(nameTd, shareTd, totalTd, remTd, colorTd, delTd);
      return tr;
    }),
  );
};

const formatTotalInput = (input) => {
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const digitsBefore = raw.slice(0, caret).replaceAll(/\D/g, '').length;
  const digits = raw.replaceAll(/\D/g, '');
  const formatted = digits === '' ? '' : formatGroupedInt(digits);
  input.value = formatted;
  let pos = 0;
  let seen = 0;
  while (pos < formatted.length && seen < digitsBefore) {
    if (/\d/.test(formatted[pos])) seen += 1;
    pos += 1;
  }
  input.setSelectionRange(pos, pos);
};

const fillFromTotals = () => {
  const rows = [...adminBody.querySelectorAll('tr')];
  if (rows.length === 0) return;
  const totals = rows.map((tr) => {
    const totalIn = tr.querySelector('[data-field="total"]');
    const remIn = tr.querySelector('[data-field="remaining"]');
    const total = parseGroupedInt(totalIn.value);
    remIn.value = String(total);
    return total;
  });
  const percents = percentsFromTotals(totals);
  rows.forEach((tr, i) => {
    tr.querySelector('[data-field="share"]').value = String(percents[i] ?? 0);
  });
};

const readAdminForm = () => {
  const rows = [...adminBody.querySelectorAll('tr')];
  return normalizePrizes(
    rows.map((tr, i) => {
      const get = (f) => tr.querySelector(`[data-field="${f}"]`);
      return {
        id: prizes[i]?.id || `p${i + 1}-${Date.now()}`,
        name: get('name').value,
        share: Number(get('share').value),
        total: parseGroupedInt(get('total').value),
        remaining: Number(get('remaining').value),
        color: get('color').value,
      };
    }),
  );
};

const syncAdminHash = () => {
  if (isAdminHash()) openAdmin();
  else if (document.body.classList.contains('admin-open')) closeAdmin();
};

let aTaps = [];
let lastAdminTapAt = 0;

const isTypingField = (el) => {
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const noteAdminTap = () => {
  const now = Date.now();
  if (now - lastAdminTapAt < 40) return;
  lastAdminTapAt = now;
  aTaps = aTaps.filter((t) => now - t < 1000);
  aTaps.push(now);
  if (aTaps.length >= 3) {
    aTaps = [];
    openAdmin();
  }
};

const isAdminHotkey = (e) =>
  e.code === 'KeyA' || e.key === 'a' || e.key === 'A' || e.key === 'ㅁ';

const onKey = (e) => {
  if (e.key === 'Escape') {
    if (winDialog.open) return;
    if (document.body.classList.contains('admin-open')) closeAdmin();
    return;
  }
  if (isTypingField(e.target)) return;
  if (isAdminHotkey(e)) noteAdminTap();
};

const onComposeTap = (e) => {
  if (isTypingField(e.target)) return;
  const data = e.data ?? '';
  if (data.endsWith('ㅁ')) noteAdminTap();
};

export const __test = {
  getPrizes: () => prizes.map((p) => ({ ...p })),
  setPrizes: (next) => {
    prizes = normalizePrizes(next);
    refresh();
  },
  resolveSpin,
  runSpin,
  openAdmin,
  closeAdmin,
};

spinBtn.addEventListener('click', runSpin);
document.getElementById('winClose').addEventListener('click', closeWinModal);
winDialog.addEventListener('click', (e) => {
  if (e.target === winDialog) closeWinModal();
});

document.getElementById('addPrize').addEventListener('click', () => {
  prizes = [
    ...readAdminForm(),
    {
      id: `p${Date.now()}`,
      name: '새 경품',
      share: 10,
      total: 10,
      remaining: 10,
      color: '#9b59b6',
    },
  ];
  refresh();
  renderAdminForm();
});

document.getElementById('saveAdmin').addEventListener('click', async () => {
  prizes = readAdminForm();
  if (prizes.length === 0) {
    adminMsg.textContent = '경품이 하나 이상 필요합니다.';
    adminMsg.classList.add('error');
    return;
  }
  const shareSum = prizes.reduce((s, p) => s + p.share, 0);
  if (!(shareSum > 0)) {
    adminMsg.textContent = '비중(%) 합이 0보다 커야 합니다.';
    adminMsg.classList.add('error');
    return;
  }
  try {
    await persistPrizes();
    setWheelDeg(((currentRotation % 360) + 360) % 360, false);
    refresh();
    renderAdminForm();
    adminMsg.classList.remove('error');
    adminMsg.textContent = '저장되었습니다.';
    setStatus('설정이 반영되었습니다.');
  } catch (err) {
    adminMsg.classList.add('error');
    adminMsg.textContent = Error.isError(err) ? err.message : '저장에 실패했습니다.';
  }
});

document.getElementById('resetDefaults').addEventListener('click', async () => {
  prizes = defaultPrizes();
  try {
    await persistPrizes();
    setWheelDeg(0, false);
    refresh();
    renderAdminForm();
    adminMsg.classList.remove('error');
    adminMsg.textContent = '기본 경품으로 복원했습니다.';
  } catch (err) {
    adminMsg.classList.add('error');
    adminMsg.textContent = Error.isError(err) ? err.message : '복원에 실패했습니다.';
  }
});

document.getElementById('closeAdmin').addEventListener('click', closeAdmin);
window.addEventListener('hashchange', syncAdminHash);
window.addEventListener('keydown', onKey);
window.addEventListener('compositionupdate', onComposeTap);

refresh();
syncAdminHash();
setStatus('불러오는 중…');
loadPrizesFromServer()
  .then(() => {
    refresh();
    if (document.body.classList.contains('admin-open')) renderAdminForm();
    setStatus('돌리기 버튼을 눌러 주세요.');
  })
  .catch((err) => {
    setStatus(Error.isError(err) ? err.message : '서버에 연결하지 못했습니다.', true);
  });
