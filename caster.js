// 1. تحميل مكتبة Google Cast
const script = document.createElement('script');
script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
document.head.appendChild(script);

let currentVideoId = null;

// 2. تهيئة إعدادات الكاست
window['__onGCastApiAvailable'] = function(isAvailable) {
    if (isAvailable) {
        cast.framework.CastContext.getInstance().setOptions({
            receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
        });
        console.log("📡 [Kick Ultimate] تم تهيئة Cast SDK بنجاح.");
    }
};

// 3. بناء الحاوية الأساسية للواجهة
function initCastUI(vId) {
    if (document.getElementById('kcp-cast-container')) return;

    const controlBar = document.querySelector('.flex.items-center.gap-2.self-end.py-0\\.5');
    if (!controlBar) return;

    const container = document.createElement('div');
    container.id = 'kcp-cast-container';
    container.className = 'kcp-cast-container';
    // إضافة الزر بجانب زر المشاهدة الخاص بك
    controlBar.prepend(container);

    renderInitialButton(vId, container);
}

// 4. عرض الزر الأساسي
function renderInitialButton(vId, container) {
    container.innerHTML = ''; 
    
    const castBtn = document.createElement('div');
    castBtn.className = 'kcp-cast-wrapper';
    castBtn.style.marginRight = "0";
    castBtn.innerHTML = `
        <svg class="kcp-cast-icon" viewBox="0 0 24 24">
            <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.92-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
        </svg>
    `;

    castBtn.onclick = () => showQualitySelector(vId, container);
    container.appendChild(castBtn);
}

// 5. دالة جلب الجودات
async function showQualitySelector(vId, container) {
    container.innerHTML = `<span style="color:#53fc18;font-size:13px;font-weight:bold;padding:0 8px;">⏳ جلب الجودات...</span>`;

    const masterUrl = await fetchKickM3u8Url(vId);
    if (!masterUrl) {
        container.innerHTML = `<span style="color:red;font-size:13px;padding:0 8px;">❌ خطأ بالرابط</span>`;
        setTimeout(() => renderInitialButton(vId, container), 3000);
        return;
    }

    const qualities = await fetchQualities(masterUrl);
    container.innerHTML = ''; 

    const select = document.createElement('select');
    select.className = 'kcp-quality-select';
    qualities.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.url;
        opt.innerText = q.label;
        select.appendChild(opt);
    });

    const startBtn = document.createElement('div');
    startBtn.className = 'kcp-cast-wrapper';
    startBtn.style.marginRight = "0";
    startBtn.style.background = "#53fc18"; 
    startBtn.style.border = "none";
    startBtn.innerHTML = `<span class="kcp-cast-text" style="color:black;">▶️ تأكيد</span>`;
    startBtn.onclick = () => {
        startCasting(select.value);
        renderInitialButton(vId, container); 
    };

    const cancelBtn = document.createElement('div');
    cancelBtn.className = 'kcp-cast-wrapper';
    cancelBtn.style.marginRight = "0";
    cancelBtn.style.padding = "4px 8px";
    cancelBtn.innerHTML = `<span class="kcp-cast-text">❌</span>`;
    cancelBtn.onclick = () => renderInitialButton(vId, container);

    container.appendChild(select);
    container.appendChild(startBtn);
    container.appendChild(cancelBtn);
}

async function fetchKickM3u8Url(videoId) {
    try {
        const response = await fetch(`https://kick.com/api/v1/video/${videoId}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data?.source || null;
    } catch (error) {
        return null;
    }
}

async function fetchQualities(masterUrl) {
    const defaultQuality = [{ label: 'تلقائي (Auto)', url: masterUrl }];
    try {
        const res = await fetch(masterUrl);
        const text = await res.text();
        
        if (!text.includes('#EXT-X-STREAM-INF')) return defaultQuality;

        const lines = text.split('\n');
        const qualities = [...defaultQuality];
        const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=')) {
                const resMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                const resolution = resMatch ? resMatch[1] : '';
                
                if (resolution) {
                    const height = resolution.split('x')[1] + 'p';
                    const playlistUrl = lines[i+1].trim();
                    const fullUrl = playlistUrl.startsWith('http') ? playlistUrl : baseUrl + playlistUrl;
                    qualities.push({ label: height, url: fullUrl });
                }
            }
        }
        return qualities;
    } catch(e) {
        return defaultQuality;
    }
}

async function startCasting(videoUrl) {
    const context = cast.framework.CastContext.getInstance();
    
    try {
        let session = context.getCurrentSession();
        if (!session) {
            await context.requestSession();
            session = context.getCurrentSession(); 
        }

        if (!session) return; 

        const mediaInfo = new chrome.cast.media.MediaInfo(videoUrl, 'application/x-mpegURL');
        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        
        const videoElement = document.querySelector('video');
        if (videoElement && videoElement.currentTime > 0) {
            request.currentTime = videoElement.currentTime;
        }

        await session.loadMedia(request);
        console.log("📺 [Kick Ultimate] تم بدء البث بنجاح!");
        
        if (videoElement && !videoElement.paused) {
            videoElement.pause(); 
        }

    } catch (err) {
        console.error("❌ [Kick Ultimate] خطأ:", err);
    }
}

const observer = new MutationObserver(() => {
    const match = window.location.pathname.match(/\/videos?\/([^\/]+)/);
    if (match) {
        const vId = match[1];
        if (vId !== currentVideoId) {
            currentVideoId = vId;
            const oldContainer = document.getElementById('kcp-cast-container');
            if (oldContainer) oldContainer.remove();
            initCastUI(vId);
        } else if (!document.getElementById('kcp-cast-container')) {
            initCastUI(vId);
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });