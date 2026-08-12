import {
  resolveSpin,
  segmentLayout,
  targetRotationDeg,
  normalizePrizes,
  defaultPrizes,
} from './wheel-logic.js';

const STORAGE_KEY = 'prize-wheel:v1';

const loadPrizesFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrizes();
    return normalizePrizes(JSON.parse(raw));
  } catch {
    return defaultPrizes();
  }
};

/** @type {import('./wheel-logic.js').Prize[]} */
let prizes = loadPrizesFromStorage();
let spinning = false;
let currentRotation = 0;

const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spinBtn');
const resultText = document.getElementById('resultText');
const statusEl = document.getElementById('status');
const stockRows = document.getElementById('stockRows');
const adminEl = document.getElementById('admin');
const adminBody = document.getElementById('adminBody');
const adminMsg = document.getElementById('adminMsg');

const savePrizes = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prizes));
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

    const mid = (seg.startDeg + seg.endDeg) / 2;
    const midRad = toRad(mid);
    const lr = r * 0.62;
    const lx = cx + Math.cos(midRad) * lr;
    const ly = cy + Math.sin(midRad) * lr;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(midRad + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = seg.remaining <= 0 ? `${seg.name} (소진)` : seg.name;
    const maxW = r * 0.42;
    let text = label;
    if (ctx.measureText(text).width > maxW) {
      while (text.length > 1 && ctx.measureText(`${text}…`).width > maxW) {
        text = text.slice(0, -1);
      }
      text = `${text}…`;
    }
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 6;
  ctx.stroke();
};

const renderStock = () => {
  stockRows.replaceChildren(
    ...prizes.map((p) => {
      const row = document.createElement('div');
      row.className = `stock-row${p.remaining <= 0 ? ' sold-out' : ''}`;
      const left = document.createElement('span');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color || '#888';
      left.append(dot, document.createTextNode(p.name));
      const right = document.createElement('span');
      right.textContent =
        p.remaining <= 0 ? '소진' : `${p.remaining} / ${p.total}`;
      row.append(left, right);
      return row;
    }),
  );
};

const showResult = (name, isEmpty = false) => {
  resultText.textContent = name;
  resultText.classList.toggle('empty', isEmpty);
  resultText.classList.remove('win-pop');
  void resultText.offsetWidth;
  if (!isEmpty) resultText.classList.add('win-pop');
};

const refresh = () => {
  paintWheel();
  renderStock();
  canvas.style.transform = `rotate(${currentRotation}deg)`;
};

const runSpin = () => {
  if (spinning) return;

  const layoutBefore = segmentLayout(prizes);
  const outcome = resolveSpin(prizes);
  if (outcome.winnerId == null) {
    setStatus('남은 경품이 없습니다. 관리자에서 수량을 채워 주세요.', true);
    showResult('소진', true);
    return;
  }

  const winSeg = layoutBefore.find((s) => s.id === outcome.winnerId);
  if (!winSeg) {
    setStatus('경품 영역을 찾을 수 없습니다.', true);
    return;
  }

  spinning = true;
  spinBtn.disabled = true;
  setStatus('돌리는 중…');
  showResult('…', true);

  prizes = outcome.prizes;
  savePrizes();
  renderStock();

  const extraSpins = 5 + Math.floor(Math.random() * 3);
  const align = targetRotationDeg(winSeg, 0);
  const curMod = ((currentRotation % 360) + 360) % 360;
  let add = (align - curMod + 360) % 360;
  if (add < 20) add += 360;
  const finalRot = currentRotation + add + extraSpins * 360;

  canvas.style.transition = 'none';
  canvas.style.transform = `rotate(${currentRotation}deg)`;
  void canvas.offsetWidth;
  canvas.style.transition = 'transform 4.2s cubic-bezier(0.12, 0.75, 0.12, 1)';
  canvas.style.transform = `rotate(${finalRot}deg)`;
  currentRotation = finalRot;

  const onEnd = (ev) => {
    if (ev.propertyName && ev.propertyName !== 'transform') return;
    canvas.removeEventListener('transitionend', onEnd);
    spinning = false;
    spinBtn.disabled = false;
    const name = outcome.winner?.name ?? '당첨';
    showResult(name, false);
    setStatus(`🎉 ${name} 당첨! 다시 돌릴 수 있습니다.`);
    paintWheel();
    renderStock();
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
      totalIn.type = 'number';
      totalIn.dataset.field = 'total';
      totalIn.min = '0';
      totalIn.step = '1';
      totalIn.value = String(p.total);
      totalTd.append(totalIn);

      const remTd = document.createElement('td');
      const remIn = document.createElement('input');
      remIn.type = 'number';
      remIn.dataset.field = 'remaining';
      remIn.min = '0';
      remIn.step = '1';
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
        savePrizes();
        refresh();
        renderAdminForm();
      });
      delTd.append(delBtn);

      tr.append(nameTd, shareTd, totalTd, remTd, colorTd, delTd);
      return tr;
    }),
  );
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
        total: Number(get('total').value),
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
const onKey = (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('admin-open')) {
    closeAdmin();
    return;
  }
  if (e.key === 'a' || e.key === 'A') {
    const now = Date.now();
    aTaps = aTaps.filter((t) => now - t < 1000);
    aTaps.push(now);
    if (aTaps.length >= 3) {
      aTaps = [];
      openAdmin();
    }
  }
};

export const __test = {
  getPrizes: () => prizes.map((p) => ({ ...p })),
  setPrizes: (next) => {
    prizes = normalizePrizes(next);
    savePrizes();
    refresh();
  },
  resolveSpin,
  runSpin,
  openAdmin,
  closeAdmin,
  STORAGE_KEY,
};

spinBtn.addEventListener('click', runSpin);

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
  savePrizes();
  refresh();
  renderAdminForm();
});

document.getElementById('saveAdmin').addEventListener('click', () => {
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
  savePrizes();
  currentRotation = currentRotation % 360;
  refresh();
  renderAdminForm();
  adminMsg.classList.remove('error');
  adminMsg.textContent = '저장되었습니다.';
  setStatus('설정이 반영되었습니다.');
});

document.getElementById('resetStock').addEventListener('click', () => {
  const form = readAdminForm();
  prizes = form.map((p) => ({ ...p, remaining: p.total }));
  savePrizes();
  refresh();
  renderAdminForm();
  adminMsg.classList.remove('error');
  adminMsg.textContent = '남은 수량을 총 수량으로 맞췄습니다.';
});

document.getElementById('resetDefaults').addEventListener('click', () => {
  prizes = defaultPrizes();
  savePrizes();
  currentRotation = 0;
  refresh();
  renderAdminForm();
  adminMsg.classList.remove('error');
  adminMsg.textContent = '기본 경품으로 복원했습니다.';
});

document.getElementById('closeAdmin').addEventListener('click', closeAdmin);
window.addEventListener('hashchange', syncAdminHash);
window.addEventListener('keydown', onKey);

refresh();
syncAdminHash();
showResult('준비', true);
setStatus('돌리기 버튼을 눌러 주세요.');
