// نصوص اللغات
const i18n = {
    watched: chrome.i18n.getMessage("watched") || "تمت المشاهدة ✓",
    markAsWatched: chrome.i18n.getMessage("markAsWatched") || "تم مشاهدة البث"
};

let videoElement = null;
let currentVideoId = null;
let hasJumped = false; // قفل أمان لمنع حلقة التكرار

function parseDuration(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

// 1. الوظيفة الأساسية للمشغل
function handleVideoPlayer() {
    const match = window.location.pathname.match(/\/videos?\/([^\/]+)/);
    if (!match) return;

    const vId = match[1];

    // إذا انتقل المستخدم لفيديو جديد، نصفر حالة القفز
    if (vId !== currentVideoId) {
        currentVideoId = vId;
        hasJumped = false;
        console.log("🎥 تم رصد فيديو جديد، جاهز للعمل...");
    }

    videoElement = document.querySelector('video');
    if (!videoElement) {
        setTimeout(handleVideoPlayer, 1000);
        return;
    }

    // حقن الزر تحت الفيديو
    injectManualButton(vId);

    // محاولة القفز للوقت المحفوظ (مرة واحدة فقط)
    if (!hasJumped) {
        chrome.storage.local.get([vId], (res) => {
            const savedTime = res[vId];
            if (savedTime && savedTime < 999998 && savedTime > 5) {
                // ننتظر حتى يبدأ الفيديو فعلياً لتجنب التضارب مع المشغل
                const jumpOnce = () => {
                    if (videoElement.currentTime < savedTime) {
                        videoElement.currentTime = savedTime;
                        hasJumped = true;
                        console.log("🚀 قفزة ناجحة إلى الثامنة:", savedTime);
                        videoElement.removeEventListener('playing', jumpOnce);
                    }
                };
                videoElement.addEventListener('playing', jumpOnce);
            } else {
                hasJumped = true; // لا يوجد وقت أو الوقت يدوي، نعتبر القفزة تمت
            }
        });
    }

    // حفظ الوقت تلقائياً (بشرط عدم الصفر لتجنب الكتابة فوق الوقت المحفوظ عند التعليق)
    videoElement.ontimeupdate = () => {
        const now = Math.floor(videoElement.currentTime);
        if (now > 0 && now % 10 === 0 && hasJumped) { // حفظ كل 10 ثوانٍ لزيادة الأداء
            chrome.storage.local.get([vId], (res) => {
                if (res[vId] !== 999999) {
                    chrome.storage.local.set({ [vId]: now });
                }
            });
        }
    };
}

// 2. حقن الزر في صفحة البث
function injectManualButton(vId) {
    if (document.getElementById('kick-helper-btn')) return;

    // البحث عن صف الأزرار تحت الفيديو
    const actionRow = document.querySelector('.flex.items-center.gap-2.self-end.py-0\\.5');
    if (!actionRow) return;

    const btn = document.createElement('div');
    btn.id = 'kick-helper-btn';
    btn.style = "display:flex; align-items:center; gap:6px; background:#191b1f; padding:6px 12px; border-radius:6px; margin-right:10px; border:1px solid transparent; transition:0.3s; cursor:pointer;";
    btn.innerHTML = `<input type="checkbox" id="chk-${vId}" style="accent-color:#53fc18; cursor:pointer; width:16px; height:16px;"> 
                     <label for="chk-${vId}" style="color:white; font-weight:bold; cursor:pointer; font-size:13px; user-select:none;">${i18n.markAsWatched}</label>`;

    const chk = btn.querySelector('input');
    
    chrome.storage.local.get([vId], (res) => {
        if (res[vId] === 999999) {
            chk.checked = true;
            btn.style.borderColor = "#53fc18";
        }
    });

    btn.onclick = (e) => {
        if(e.target !== chk) chk.checked = !chk.checked;
        const val = chk.checked ? 999999 : 0;
        chrome.storage.local.set({ [vId]: val }, () => {
            btn.style.borderColor = chk.checked ? "#53fc18" : "transparent";
        });
    };

    actionRow.prepend(btn);
}

// 3. علامات "تمت المشاهدة" في القائمة
function markListVideos() {
    const cards = document.querySelectorAll('.group\\/card:not([data-processed])');
    cards.forEach(card => {
        const link = card.querySelector('a[href*="/video"]');
        if (!link) return;

        const vId = link.getAttribute('href').split('/').pop();
        const durationEl = link.querySelector('.top-1\\.5.left-1\\.5');
        
        if (durationEl) {
            chrome.storage.local.get([vId], (res) => {
                const saved = res[vId] || 0;
                const total = parseDuration(durationEl.innerText);
                
                if (saved === 999999 || (total > 0 && (saved / total) >= 0.9)) {
                    if (!link.querySelector('.watched-badge')) {
                        const badge = document.createElement('div');
                        badge.className = 'watched-badge';
                        badge.innerText = i18n.watched;
                        badge.style = "position:absolute; top:8px; right:8px; background:#53fc18; color:black; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; z-index:20; box-shadow:0 2px 5px rgba(0,0,0,0.5);";
                        link.appendChild(badge);
                        
                        const img = link.querySelector('img');
                        if (img) img.style.filter = "grayscale(0.5) brightness(0.5)";
                    }
                }
            });
        }
        card.setAttribute('data-processed', 'true');
    });
}

// المراقبة الذكية
const observer = new MutationObserver(() => {
    markListVideos();
    if (window.location.pathname.includes('/video')) {
        handleVideoPlayer();
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// تشغيل أولي
handleVideoPlayer();
markListVideos();