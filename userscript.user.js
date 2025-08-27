// ==UserScript==
// @name         X/Twitter Auto Action (Fluent UI)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Glassmorphism UI with enhanced blur effects, compact layout, and smooth interactions.
// @author       maro
// @match        https://twitter.com/*
// @match        https://x.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM.addValueChangeListener
// @grant        GM.removeValueChangeListener
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;
    let actionCount = 0;
    let postCount = 0;
    let currentView = 'main'; // 'main' or 'analytics'

    // Analytics functions
    function getDateKey(date = new Date()) {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    function getWeekKey(date = new Date()) {
        const year = date.getFullYear();
        const week = Math.ceil((((date - new Date(year, 0, 1)) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7);
        return `${year}-W${week.toString().padStart(2, '0')}`;
    }

    function getMonthKey(date = new Date()) {
        return date.toISOString().slice(0, 7); // YYYY-MM
    }

    function recordAction(mode) {
        if (!config.analytics) config.analytics = { daily: {}, weekly: {}, monthly: {} };

        const today = getDateKey();
        const thisWeek = getWeekKey();
        const thisMonth = getMonthKey();

        // Initialize if needed
        if (!config.analytics.daily[today]) config.analytics.daily[today] = {};
        if (!config.analytics.weekly[thisWeek]) config.analytics.weekly[thisWeek] = {};
        if (!config.analytics.monthly[thisMonth]) config.analytics.monthly[thisMonth] = {};

        // Increment counters
        config.analytics.daily[today][mode] = (config.analytics.daily[today][mode] || 0) + 1;
        config.analytics.weekly[thisWeek][mode] = (config.analytics.weekly[thisWeek][mode] || 0) + 1;
        config.analytics.monthly[thisMonth][mode] = (config.analytics.monthly[thisMonth][mode] || 0) + 1;

        // Clean old data (keep last 30 days, 12 weeks, 12 months)
        cleanOldAnalytics();
    }

    function cleanOldAnalytics() {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
        const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

        // Clean daily data
        Object.keys(config.analytics.daily).forEach(dateKey => {
            if (new Date(dateKey) < thirtyDaysAgo) {
                delete config.analytics.daily[dateKey];
            }
        });

        // Clean weekly data
        Object.keys(config.analytics.weekly).forEach(weekKey => {
            const [year, week] = weekKey.split('-W');
            const weekDate = new Date(parseInt(year), 0, 1 + (parseInt(week) - 1) * 7);
            if (weekDate < twelveWeeksAgo) {
                delete config.analytics.weekly[weekKey];
            }
        });

        // Clean monthly data
        Object.keys(config.analytics.monthly).forEach(monthKey => {
            if (new Date(monthKey + '-01') < twelveMonthsAgo) {
                delete config.analytics.monthly[monthKey];
            }
        });
    }

    // --- CONFIGURATION ---
    let configDefaults = {
        scrollDelay: 500,
        actionDelay: 1000,
        maxActions: 25,
        randomDelay: true,
        smoothScroll: true,
        scrollDirection: 'down',
        ignoreReplies: false,
        mode: 'like',
        selectedModes: ['like'],
        likesPerBatch: 3,
        focusMode: false,
        countByPosts: false,
        stopOnOriginal: true,
        excludedUsers: ['krishma', 'krishmaa098'],
        apiKeys: ['GM_oVbizUifRmCy901JR7iiKLVXNZSbh4eLSre6iApsJln1gadycHxio9ofb8Kb9'],
        disableLikeAfterAIReply: false,
        analytics: {
            daily: {},
            weekly: {},
            monthly: {}
        }
    };

    const CONFIG_STORAGE_KEY = 'auto_x_config_v1';
    function loadSavedConfig(){
        try{
            const s = GM_getValue(CONFIG_STORAGE_KEY, null);
            if (s && typeof s === 'object') return s;
        }catch(e){}
        return null;
    }
    function saveConfig(o){
        try{ GM_setValue(CONFIG_STORAGE_KEY, o); }catch(e){}
    }
    function vxHasClassic(){
        try{ return typeof GM_getValue === 'function' || typeof GM_setValue === 'function'; }catch(e){ return false }
    }
    function vxHasModern(){
        try{ return (typeof GM !== 'undefined') && (typeof GM.getValue === 'function' || typeof GM.setValue === 'function'); }catch(e){ return false }
    }
    function plainClone(o){
        try{ return JSON.parse(JSON.stringify(o)); }catch(e){ try{ return Object.assign({}, o); }catch(_) { return o; } }
    }
    function loadSavedConfigSync(){
        try{
            const s = GM_getValue(CONFIG_STORAGE_KEY, null);
            if (s && typeof s === 'object') return s;
        }catch(e){}
        return null;
    }
    async function loadSavedConfigAsyncInto(target){
        try{
            if (!vxHasModern()) return;
            const s = await GM.getValue(CONFIG_STORAGE_KEY, null);
            if (s && typeof s === 'object') {
                Object.assign(target, s);
                try{ if (typeof updateStatus === 'function') updateStatus(); }catch(_){}
            }
        }catch(_){}
    }
    function makeConfigProxy(target, onMutate){
        const cache = new WeakMap();
        const wrap = (val)=>{
            if (!val || (typeof val !== 'object')) return val;
            if (cache.has(val)) return cache.get(val);
            const handler = {
                get(obj, prop, recv){
                    const v = Reflect.get(obj, prop, recv);
                    if (Array.isArray(obj)){
                        const mutators = ['push','pop','shift','unshift','splice','sort','reverse','fill','copyWithin'];
                        if (typeof v === 'function' && mutators.includes(prop)){
                            return function(...args){ const res = v.apply(obj, args); try{ onMutate(); }catch(_){} return res; };
                        }
                    }
                    return wrap(v);
                },
                set(obj, prop, value){
                    const ok = Reflect.set(obj, prop, value);
                    try{ onMutate(); }catch(_){}
                    return ok;
                },
                deleteProperty(obj, prop){
                    const ok = Reflect.deleteProperty(obj, prop);
                    try{ onMutate(); }catch(_){}
                    return ok;
                }
            };
            const prox = new Proxy(val, handler);
            cache.set(val, prox);
            return prox;
        };
        return wrap(target);
    }

    let __suppressPersist = false;
    let config = (()=>{
        const base = { ...configDefaults };
        const savedSync = loadSavedConfigSync();
        if (savedSync) Object.assign(base, savedSync);
        const persist = ()=>{ if (__suppressPersist) return; const snap = plainClone(base); try{ snap.__rev = Date.now(); }catch(_){} try{ if (typeof GM_setValue === 'function') GM_setValue(CONFIG_STORAGE_KEY, snap); else if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') GM.setValue(CONFIG_STORAGE_KEY, snap); }catch(_){} };
        const proxied = makeConfigProxy(base, persist);
        setInterval(persist, 10000);
        if (!vxHasClassic() && vxHasModern()) { loadSavedConfigAsyncInto(proxied); }
        return proxied;
    })();

    // Cross-tab live sync: listen for external changes to the config key and merge
    let __configChangeListenerId = null;
    function __mergeIncomingConfig(newCfg){
        if (!newCfg || typeof newCfg !== 'object') return;
        const keys = new Set([...Object.keys(config), ...Object.keys(newCfg)]);
        __suppressPersist = true;
        try{ keys.forEach(k=>{ config[k] = newCfg[k]; }); } finally { __suppressPersist = false; }
        try { if (typeof updateStatus === 'function') updateStatus(); } catch(_) {}
        try {
            const map = {
                'likes-per-batch': 'likesPerBatch',
                'max-actions': 'maxActions',
                'action-delay': 'actionDelay',
                'scroll-delay': 'scrollDelay',
                'random-delay': 'randomDelay',
                'smooth-scroll': 'smoothScroll',
                'scroll-direction': 'scrollDirection',
                'count-by-posts': 'countByPosts',
                'stop-on-original': 'stopOnOriginal',
                'ignore-replies': 'ignoreReplies',
                'disable-like-after-ai-reply': 'disableLikeAfterAIReply'
            };
            Object.entries(map).forEach(([id,key])=>{
                const el = document.getElementById(id);
                if (!el) return;
                if (el.tagName === 'INPUT' && el.type === 'checkbox') el.checked = !!config[key];
                else if (el.tagName === 'INPUT') el.value = config[key];
                else if (el.tagName === 'SELECT') el.value = String(config[key]);
            });
        } catch(_) {}
    }
    (function __installConfigListener(){
        try{
            if (typeof GM_addValueChangeListener === 'function') {
                __configChangeListenerId = GM_addValueChangeListener(CONFIG_STORAGE_KEY, (name, oldVal, newVal, remote)=>{
                    if (!remote) return; __mergeIncomingConfig(newVal);
                });
                return;
            }
        }catch(_){}
        try{
            if (typeof GM !== 'undefined' && typeof GM.addValueChangeListener === 'function') {
                __configChangeListenerId = GM.addValueChangeListener(CONFIG_STORAGE_KEY, (name, oldVal, newVal, remote)=>{
                    if (!remote) return; __mergeIncomingConfig(newVal);
                });
            }
        }catch(_){}
        window.addEventListener('beforeunload', ()=>{
            try{
                if (typeof GM_removeValueChangeListener === 'function' && __configChangeListenerId) GM_removeValueChangeListener(__configChangeListenerId);
            }catch(_){}
            try{
                if (typeof GM !== 'undefined' && typeof GM.removeValueChangeListener === 'function' && __configChangeListenerId) GM.removeValueChangeListener(__configChangeListenerId);
            }catch(_){}
        });
    })();

    // --- CORE LOGIC ---
    function getRandomDelay(base) { if (!config.randomDelay) return base; return base + Math.random() * 500; }
    function findLikeButtons() {
        const btns = document.querySelectorAll('[data-testid="like"]:not([data-auto-actioned])');
        const availableButtons = Array.from(btns).filter(b => {
            const rect = b.getBoundingClientRect();
            if (rect.height === 0) return false;

                const tweet = b.closest('article') || b.closest('[data-testid="tweet"]');
                if (config.ignoreReplies && tweet && tweet.textContent.includes('Replying to')) {
                    return false;
                }

            return true;
        });
        console.log(`Found ${availableButtons.length} like buttons`);
        return availableButtons;
    }
    function findUnlikeButtons() {
        const btns = document.querySelectorAll('[data-testid="unlike"]:not([data-auto-actioned])');
        const availableButtons = Array.from(btns).filter(b => {
            const rect = b.getBoundingClientRect();
            return rect.height > 0;
        });
        console.log(`Found ${availableButtons.length} unlike buttons`);
        return availableButtons;
    }
    function findUnretweetButtons() {
        const btns = document.querySelectorAll('[data-testid="unretweet"]:not([data-auto-actioned])');
        const availableButtons = Array.from(btns).filter(b => {
            const rect = b.getBoundingClientRect();
            return rect.height > 0;
        });
        console.log(`Found ${availableButtons.length} unretweet buttons`);
        return availableButtons;
    }
    function findBookmarkButtons() {
        const btns = document.querySelectorAll('[data-testid="bookmark"]:not([data-auto-actioned])');
        const availableButtons = Array.from(btns).filter(b => {
            const rect = b.getBoundingClientRect();
            if (rect.height === 0) return false;
            const tweet = b.closest('article') || b.closest('[data-testid="tweet"]');
            if (config.ignoreReplies && tweet && tweet.textContent.includes('Replying to')) return false;
            return true;
        });
        console.log(`Found ${availableButtons.length} bookmark buttons`);
        return availableButtons;
    }
    function findUnbookmarkButtons() {
        const btns = document.querySelectorAll('[data-testid="removeBookmark"]:not([data-auto-actioned])');
        const availableButtons = Array.from(btns).filter(b => {
            const rect = b.getBoundingClientRect();
            return rect.height > 0;
        });
        console.log(`Found ${availableButtons.length} unbookmark buttons`);
        return availableButtons;
    }
    let recentReplies=[];
    function normText(s){return (s||'').toLowerCase().replace(/\s+/g,' ').trim();}
    function normalizeHandle(s){return (s||'').toLowerCase().replace(/^@/, '');}
    function findReplyButtons(){
        const btns=document.querySelectorAll('[data-testid="reply"]:not([data-auto-actioned])');
        const available=Array.from(btns).filter(b=>{
            const r=b.getBoundingClientRect();
            if(r.height===0) return false;
            const tweet=b.closest('article')||b.closest('[data-testid="tweet"]');
            if(config.ignoreReplies && tweet && tweet.textContent.includes('Replying to')) return false;
            const prof=getProfileUserFromUrl();
            if(prof){
                const author=getTweetAuthorHandle(tweet);
                if(author && author.toLowerCase()===prof.toLowerCase()) return false;
            }
            const author=getTweetAuthorHandle(tweet);
            if(author && config.excludedUsers && config.excludedUsers.length > 0) {
                const authorNorm = normalizeHandle(author);
                console.log(`Reply button - Checking author: "${author}" (${authorNorm}) against excluded users:`, config.excludedUsers);
                if(config.excludedUsers.some(user => authorNorm === normalizeHandle(user))) {
                    console.log(`Filtering out reply button for excluded user: ${author}`);
                    return false;
                }
            }
            return true;
        });
        console.log(`Found ${available.length} reply buttons`);
        return available;
    }
    function getProfileUserFromUrl(){
        try{
            const m=location.pathname.match(/^\/([^\/]+)\/with_replies/);
            if(m&&m[1]) return decodeURIComponent(m[1]);
        }catch(e){}
        return '';
    }
    function getTweetAuthorHandle(article){
        if(!article) return '';
        const a=article.querySelector('[data-testid="User-Name"] a[href^="/"]');
        if(!a) return '';
        try{ const p=new URL(a.href,location.origin).pathname.split('/').filter(Boolean); return p[0]||'';}catch(e){ return '' }
    }
    function findRetweetButtons() { const btns=document.querySelectorAll('[data-testid="retweet"]:not([data-auto-actioned])'); return Array.from(btns).filter(b=>{if(b.closest('article')?.querySelector('[data-testid="unretweet"]'))return false;const r=b.getBoundingClientRect();return r.height>0;}); }
    function clickLikeButton(button) { if(!button||button.getAttribute('data-auto-actioned'))return;try{button.click();button.setAttribute('data-auto-actioned','true');actionCount++;recordAction('like');console.log(`❤️ Liked post ${actionCount}/${config.maxActions}`);updateStatus();}catch(e){console.error('❌ Error liking:',e);}}
    function clickUnlikeButton(button) { if(!button||button.getAttribute('data-auto-actioned'))return;try{button.click();button.setAttribute('data-auto-actioned','true');actionCount++;recordAction('unlike');console.log(`💔 Unliked post ${actionCount}/${config.maxActions}`);updateStatus();}catch(e){console.error('❌ Error unliking:',e);}}
    async function clickRetweetButton(button) { if(!button||button.getAttribute('data-auto-actioned'))return;try{button.setAttribute('data-auto-actioned','true');button.click();await new Promise(r=>setTimeout(r,250));const c=document.querySelector('[data-testid="retweetConfirm"]');if(c){c.click();actionCount++;recordAction('retweet');console.log(`🔁 Retweeted post ${actionCount}/${config.maxActions}`);updateStatus();}else{console.warn('No retweet confirm.');document.body.click();}}catch(e){console.error('❌ Error retweeting:',e);}}
    async function clickUnretweetButton(button) { if(!button||button.getAttribute('data-auto-actioned'))return;try{button.setAttribute('data-auto-actioned','true');button.click();await new Promise(r=>setTimeout(r,250));const c=document.querySelector('[data-testid="unretweetConfirm"]');if(c){c.click();actionCount++;recordAction('unretweet');console.log(`🔄 Unretweeted post ${actionCount}/${config.maxActions}`);updateStatus();}else{console.warn('No unretweet confirm.');document.body.click();}}catch(e){console.error('❌ Error unretweeting:',e);}}
    function clickBookmarkButton(button) { if(!button||button.getAttribute('data-auto-actioned'))return;try{button.click();button.setAttribute('data-auto-actioned','true');actionCount++;recordAction('bookmark');console.log(`🔖 Bookmarked post ${actionCount}/${config.maxActions}`);updateStatus();}catch(e){console.error('❌ Error bookmarking:',e);}}
    function clickUnbookmarkButton(button) { if(!button||button.getAttribute('data-auto-actioned'))return;try{button.click();button.setAttribute('data-auto-actioned','true');actionCount++;recordAction('unbookmark');console.log(`🗑️ Unbookmarked post ${actionCount}/${config.maxActions}`);updateStatus();}catch(e){console.error('❌ Error unbookmarking:',e);}}
    async function clickReplyAndSend(button){ if(!button||button.getAttribute('data-auto-actioned')) return false; button.setAttribute('data-auto-actioned','true'); try{ const article=button.closest('article, [data-testid="tweet"]'); const tweet=extractTweetText(article); if(!tweet){console.warn('No tweet text'); button.removeAttribute('data-auto-actioned'); return false;} const lang=detectTweetLang(article); button.click(); const dlg=await waitForReplyDialog(6000); if(!dlg){console.warn('Reply dialog not found'); button.removeAttribute('data-auto-actioned'); return false;} const box=await (async()=>{const start=Date.now(); while(Date.now()-start<6000){ const b=findComposerInDialog(dlg); if(b) return b; await wait(120);} return null})(); if(!box){console.warn('Composer not found'); button.removeAttribute('data-auto-actioned'); return false;} let reply=await generateAIReply(tweet,lang, recentReplies.slice(-20)); if(!reply){ try{ if(box) box.textContent=''; }catch(_){} console.warn('AI reply failed'); button.removeAttribute('data-auto-actioned'); return false;} let rnorm=normText(reply); let regen=0; while(recentReplies.includes(rnorm) && regen<2){ reply=await generateAIReply(tweet,lang, recentReplies.slice(-20).concat([rnorm])); if(!reply) break; rnorm=normText(reply); regen++; } if(!reply){ console.warn('AI reply failed after dedup'); button.removeAttribute('data-auto-actioned'); return false;} const ok=insertTextIntoEditable(box,reply); if(!ok){ console.warn('Insert failed'); button.removeAttribute('data-auto-actioned'); return false;} try{ box.dispatchEvent(new InputEvent('input',{bubbles:true})); }catch(e){} try{ box.focus(); }catch(e){} let tries=0; let clicked=false; while(tries<20 && !clicked){ if(clickReplySendInDialog(dlg)){ clicked=true; break;} pressKeyboardSend(box); await wait(120); tries++; } if(!clicked){ console.warn('Send control not clickable'); button.removeAttribute('data-auto-actioned'); return false;} const sent=await waitForSendCompletion(7000); if(!sent){ console.warn('Send did not complete'); button.removeAttribute('data-auto-actioned'); return false;} if(rnorm){ recentReplies.push(rnorm); if(recentReplies.length>30) recentReplies=recentReplies.slice(-30);} actionCount++; console.log(`💬 Replied ${actionCount}/${config.maxActions}`); updateStatus(); const d=Number(config.actionDelay||0); if(d>0){ await wait(d);} return true; } catch(e){ console.error('❌ Error replying:',e); button.removeAttribute('data-auto-actioned'); return false; } }
    function scrollDown() { const dir = config.scrollDirection === 'up' ? -1 : 1; window.scrollBy({ top: dir * window.innerHeight * 1.2, behavior: config.smoothScroll ? 'smooth' : 'auto' }); }
    function getVisibleArticles(){ const arts=document.querySelectorAll('article, [data-testid="tweet"]'); return Array.from(arts).filter(a=>{ const r=a.getBoundingClientRect(); return r.height>0; }); }
    function getForwardArticles(){
        const dirDown = (config.scrollDirection !== 'up');
        const arts = document.querySelectorAll('article, [data-testid="tweet"]');
        let arr = Array.from(arts).filter(a=>{
            if (a.getAttribute('data-auto-post-processed')) return false;
            const r=a.getBoundingClientRect();
            if (r.height<=0) return false;
            const visible = dirDown ? (r.top >= 0) : (r.bottom <= window.innerHeight);
            if (!visible) return false;

            const author=getTweetAuthorHandle(a);
            if(author && config.excludedUsers && config.excludedUsers.length > 0) {
                const authorNorm = normalizeHandle(author);
                console.log(`Checking author: "${author}" (${authorNorm}) against excluded users:`, config.excludedUsers);
                if(config.excludedUsers.some(user => authorNorm === normalizeHandle(user))) {
                    console.log(`Filtering out post by excluded user: ${author}`);
                    return false;
                }
            }

            return true;
        });
        arr.sort((a,b)=>{
            const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
            return dirDown ? (ra.top - rb.top) : (rb.bottom - ra.bottom);
        });
        return arr;
    }
    function findButtonInArticle(article,testid){ const btn=article.querySelector(`[data-testid="${testid}"]:not([data-auto-actioned])`); if(!btn) return null; const r=btn.getBoundingClientRect(); return r.height>0 ? btn : null; }
    function scrollArticleIntoView(article){ try{ article.scrollIntoView({ behavior: (config.smoothScroll? 'smooth':'auto'), block: 'center', inline: 'nearest' }); }catch(e){} }
    function isRetweet(article){ if(!article) return false; return !!(article.querySelector('[data-testid="socialContext"]') || article.textContent.includes('Retweeted') || article.querySelector('svg[data-testid="retweet"]')?.closest('[data-testid="socialContext"]') || article.querySelector('[aria-label*="Reposted"]') || article.querySelector('[aria-label*="Retweeted"]')); }
    async function runActionLoop() {
        const currentCount = config.countByPosts ? postCount : actionCount;
        if (!isRunning || currentCount >= config.maxActions) {
            stopAction();
            return;
        }

        const selectedModes = config.selectedModes || [config.mode || 'like'];
        let allActionButtons = [];

        for (const mode of selectedModes) {
            let modeButtons;
            if (mode === 'like') {
                modeButtons = findLikeButtons();
            } else if (mode === 'unlike') {
                modeButtons = findUnlikeButtons();
            } else if (mode === 'retweet') {
                modeButtons = findRetweetButtons();
            } else if (mode === 'unretweet') {
                modeButtons = findUnretweetButtons();
            } else if (mode === 'reply') {
                modeButtons = findReplyButtons();
            } else if (mode === 'bookmark') {
                modeButtons = findBookmarkButtons();
            } else if (mode === 'unbookmark') {
                modeButtons = findUnbookmarkButtons();
            }
            if (modeButtons && modeButtons.length > 0) {
                modeButtons.forEach(btn => {
                    if (!btn.dataset.actionMode) btn.dataset.actionMode = mode;
                });
                allActionButtons.push(...modeButtons);
            }
        }

        const actionButtons = allActionButtons;

        // stopOnOriginal for non-countByPosts: proactively stop on the first visible original post
        if (!config.countByPosts && config.stopOnOriginal) {
            const arts = getForwardArticles();
            const target = arts.find(a => !isRetweet(a));
            if (target) {
                try {
                    scrollArticleIntoView(target);
                    await wait(config.smoothScroll ? 250 : 50);
                    let acted = false;
                    const retries = 8;
                    const shortWait = 120;
                    for (let i = 0; i < retries && !acted; i++) {
                        if (config.mode === 'like') {
                            let b = findButtonInArticle(target, 'like');
                            if (b) { clickLikeButton(b); acted = true; }
                            else {
                                const ub = findButtonInArticle(target, 'unlike');
                                if (ub) { acted = true; }
                            }
                        } else if (config.mode === 'unlike') {
                            const b = findButtonInArticle(target, 'unlike');
                            if (b) { clickUnlikeButton(b); acted = true; }
                        } else if (config.mode === 'retweet') {
                            const b = findButtonInArticle(target, 'retweet');
                            if (b) { await clickRetweetButton(b); acted = true; }
                        } else if (config.mode === 'unretweet') {
                            const b = findButtonInArticle(target, 'unretweet');
                            if (b) { await clickUnretweetButton(b); acted = true; }
                        } else if (config.mode === 'reply') {
                            const b = findButtonInArticle(target, 'reply');
                            if (b) { acted = await clickReplyAndSend(b); }
                        } else if (config.mode === 'bookmark') {
                            const b = findButtonInArticle(target, 'bookmark');
                            if (b) { clickBookmarkButton(b); acted = true; }
                        } else if (config.mode === 'unbookmark') {
                            const b = findButtonInArticle(target, 'removeBookmark');
                            if (b) { clickUnbookmarkButton(b); acted = true; }
                        }
                        if (!acted) { await wait(shortWait); }
                    }
                    if (acted) { stopAction(); return; }
                } catch (e) {
                    console.warn('stopOnOriginal pre-check failed', e);
                }
            }
        }

        // Count-by-posts: drive by visible articles, not available action buttons
        if (config.countByPosts) {
            const arts=getForwardArticles();
            console.log(`getForwardArticles returned ${arts.length} articles after filtering`);
            if (arts.length===0) {
                scrollDown();
                setTimeout(()=>{ if(isRunning) runActionLoop(); }, getRandomDelay(config.scrollDelay));
                return;
            }
            const remaining=config.maxActions - postCount;
            const batchSize=Math.min(config.likesPerBatch, remaining, arts.length);
            const batchArts=arts.slice(0,batchSize);
            console.log(`Processing ${batchArts.length} posts (count-by-posts)`);
            for (const art of batchArts){
                if (!isRunning) break;
                let actionPerformed = false;
                try{
                    scrollArticleIntoView(art);
                    await wait(config.smoothScroll ? 250 : 50);
                    art.setAttribute('data-auto-post-processed','true');
                    if (config.stopOnOriginal && !isRetweet(art)) {
                        const retries = 8;
                        const shortWait = 120;
                        for (let i = 0; i < retries && !actionPerformed; i++) {
                            const selectedModes = config.selectedModes || [config.mode || 'like'];
                            for (const mode of selectedModes) {
                                if (mode==='like'){
                                    let b=findButtonInArticle(art,'like');
                                    if (b) { clickLikeButton(b); actionPerformed = true; }
                                    else {
                                        const ub=findButtonInArticle(art,'unlike');
                                        if (ub) { actionPerformed = true; }
                                    }
                                } else if (mode==='unlike'){
                                    const b=findButtonInArticle(art,'unlike'); if (b) { clickUnlikeButton(b); actionPerformed = true; }
                                } else if (mode==='retweet'){
                                    const b=findButtonInArticle(art,'retweet'); if (b) { await clickRetweetButton(b); actionPerformed = true; }
                                } else if (mode==='unretweet'){
                                    const b=findButtonInArticle(art,'unretweet'); if (b) { await clickUnretweetButton(b); actionPerformed = true; }
                                } else if (mode==='reply'){
                                    const b=findButtonInArticle(art,'reply'); if (b) { const success = await clickReplyAndSend(b); actionPerformed = success; }
                                } else if (mode==='bookmark'){
                                    const b=findButtonInArticle(art,'bookmark'); if (b) { clickBookmarkButton(b); actionPerformed = true; }
                                } else if (mode==='unbookmark'){
                                    const b=findButtonInArticle(art,'removeBookmark'); if (b) { clickUnbookmarkButton(b); actionPerformed = true; }
                                }
                            }
                            if (!actionPerformed) { await wait(shortWait); }
                        }
                        if (actionPerformed) { postCount++; updateStatus(); stopAction(); return; }
                    }
                    const selectedModes = config.selectedModes || [config.mode || 'like'];
                    for (const mode of selectedModes) {
                        if (mode==='like'){
                            const b=findButtonInArticle(art,'like'); if (b) { clickLikeButton(b); actionPerformed = true; }
                        } else if (mode==='unlike'){
                            const b=findButtonInArticle(art,'unlike'); if (b) { clickUnlikeButton(b); actionPerformed = true; }
                        } else if (mode==='retweet'){
                            const b=findButtonInArticle(art,'retweet'); if (b) { await clickRetweetButton(b); actionPerformed = true; }
                        } else if (mode==='unretweet'){
                            const b=findButtonInArticle(art,'unretweet'); if (b) { await clickUnretweetButton(b); actionPerformed = true; }
                        } else if (mode==='reply'){
                            const b=findButtonInArticle(art,'reply'); if (b) { const success = await clickReplyAndSend(b); actionPerformed = success; }
                        } else if (mode==='bookmark'){
                            const b=findButtonInArticle(art,'bookmark'); if (b) { clickBookmarkButton(b); actionPerformed = true; }
                        } else if (mode==='unbookmark'){
                            const b=findButtonInArticle(art,'removeBookmark'); if (b) { clickUnbookmarkButton(b); actionPerformed = true; }
                        }
                    }
                }catch(e){ console.warn('post processing error',e); }
                postCount++; updateStatus();
                if (postCount>=config.maxActions){ console.log(`Reached post limit ${postCount}/${config.maxActions}, stopping.`); stopAction(); return; }
            }
            setTimeout(()=>{ if(isRunning) runActionLoop(); }, getRandomDelay(config.actionDelay));
            return;
        }

        if (actionButtons.length === 0) {
            console.log(`... No new posts to ${config.mode}, scrolling...`);
            scrollDown();
            setTimeout(() => {
                if (isRunning) runActionLoop();
            }, getRandomDelay(config.scrollDelay));
            return;
        }

        const currentCount2 = config.countByPosts ? postCount : actionCount;
        const remainingActions = config.maxActions - currentCount2;
        const targetBatchSize = Math.min(config.likesPerBatch, remainingActions);

        // If we don't have enough buttons for the full batch, scroll and wait for more
        if (config.focusMode && actionButtons.length < targetBatchSize) {
            console.log(`Only ${actionButtons.length} buttons available, need ${targetBatchSize}. Scrolling for more (focus mode enabled)...`);
            scrollDown();
            setTimeout(() => {
                if (isRunning) runActionLoop();
            }, getRandomDelay(config.scrollDelay));
            return;
        }

        const batchButtons = actionButtons.slice(0, Math.min(targetBatchSize, actionButtons.length));

        console.log(`Processing batch of ${batchButtons.length} buttons (requested: ${config.likesPerBatch}${config.focusMode ? ', focus ON' : ', focus OFF'})`);

        for (const button of batchButtons) {
            if (!isRunning) break;

            const mode = button.dataset.actionMode;
            const article = button.closest('article, [data-testid="tweet"]');

            if (config.stopOnOriginal && article && !isRetweet(article)) {
                await performActionOnButton(button, mode);
                if (config.countByPosts) { postCount++; updateStatus(); }
                stopAction();
                return;
            }

            await performActionOnButton(button, mode);

            if (config.countByPosts) {
                postCount++;
                updateStatus();
                if (postCount >= config.maxActions) {
                    console.log(`Reached post limit ${postCount}/${config.maxActions}, stopping.`);
                    stopAction();
                    return;
                }
            }
        }

        setTimeout(() => {
            if (isRunning) runActionLoop();
        }, getRandomDelay(config.actionDelay));
    }
    async function performActionOnButton(button, mode) {
        if (!button || !mode) return false;
        try {
            switch (mode) {
                case 'like':
                    clickLikeButton(button);
                    return true;
                case 'unlike':
                    clickUnlikeButton(button);
                    return true;
                case 'retweet':
                    await clickRetweetButton(button);
                    return true;
                case 'unretweet':
                    await clickUnretweetButton(button);
                    return true;
                case 'reply':
                    return await clickReplyAndSend(button);
                case 'bookmark':
                    clickBookmarkButton(button);
                    return true;
                case 'unbookmark':
                    clickUnbookmarkButton(button);
                    return true;
                default:
                    console.warn(`Unknown action mode: ${mode}`);
                    return false;
            }
        } catch (e) {
            console.error(`Error performing ${mode} action:`, e);
            return false;
        }
    }
    function toggleAction() { isRunning ? stopAction() : startAction(); }
    function startAction() { if(isRunning)return;isRunning=true;actionCount=0;postCount=0;const modes=config.selectedModes||[config.mode||'like'];console.log(`🚀 Auto-action started with modes: ${modes.join(', ')}!`);updateStatus();runActionLoop(); }
    function stopAction() { if(!isRunning)return;isRunning=false;const modes=config.selectedModes||[config.mode||'like'];console.log(`🛑 Auto-action stopped (was running: ${modes.join(', ')}).`);updateStatus(); }
    function setMode(newMode) { if(isRunning){console.warn("Cannot change mode while running.");return;}config.mode=newMode;config.selectedModes=[newMode];console.log(`Mode switched to: ${newMode}`);updateStatus();}
    function toggleModeSelection(mode) { if(isRunning){console.warn("Cannot change modes while running.");return;} if(!config.selectedModes) config.selectedModes=[config.mode||'like']; const idx=config.selectedModes.indexOf(mode); if(idx>=0) { config.selectedModes.splice(idx,1); if(config.selectedModes.length===0) config.selectedModes=['like']; } else { config.selectedModes.push(mode); } config.mode=config.selectedModes[0]; console.log(`Selected modes: ${config.selectedModes.join(', ')}`); updateStatus(); }
    function getTopVisibleArticle(){const arts=document.querySelectorAll('article, [data-testid="tweet"]');let best=null,top=Infinity;arts.forEach(a=>{const r=a.getBoundingClientRect();if(r.height>0&&r.top>=0&&r.top<top){best=a;top=r.top}});return best}
    function extractTweetText(article){if(!article)return'';const spans=article.querySelectorAll('[data-testid="tweetText"] span');if(spans.length>0){return Array.from(spans).map(s=>s.textContent).join(' ').trim()}return(article.textContent||'').trim()}
    function openReplyForArticle(article){const btn=article?.querySelector('[data-testid="reply"]');if(btn){btn.click();return true}return false}
    function wait(ms){return new Promise(r=>setTimeout(r,ms))}
    async function waitForReplyDialog(timeoutMs=6000){
        const start=Date.now();
        while(Date.now()-start<timeoutMs){
            const dlgs=Array.from(document.querySelectorAll('div[role="dialog"]'));
            const dlg=dlgs.reverse().find(d=>{const r=d.getBoundingClientRect();return r.width>0&&r.height>0});
            if(dlg) return dlg;
            await wait(120)
        }
        return null
    }
    function findComposerInDialog(dlg){
        if(!dlg) return null;
        const cands=dlg.querySelectorAll('[data-testid^="tweetTextarea"] div[contenteditable="true"], div[role="textbox"][contenteditable="true"]');
        return Array.from(cands).find(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0})||null;
    }
    function findSendInDialog(dlg){
        if(!dlg) return null;
        return dlg.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
    }
    function insertTextIntoEditable(el,text){
        if(!el||!el.isConnected) return false;
        try{ el.click(); el.focus(); }catch(e){}
        const sel=window.getSelection();
        const range=document.createRange();
        try{ if(!el.isConnected) return false; range.selectNodeContents(el); range.collapse(false);}catch(e){}
        try{ sel.removeAllRanges(); if(el.isConnected) sel.addRange(range);}catch(e){}
        let ok=false;
        try{ ok=document.execCommand('insertText',false,text);}catch(e){ok=false}
        if(!ok){
            try{
                if(!el.isConnected) return false;
                const tn=document.createTextNode(text);
                const r=(window.getSelection().rangeCount?window.getSelection().getRangeAt(0):range);
                r.insertNode(tn);
                range.setStartAfter(tn);
                range.setEndAfter(tn);
                sel.removeAllRanges(); if(el.isConnected) sel.addRange(range);
                ok=true;
            }catch(e){ try{ el.textContent=text; ok=true;}catch(_){} }
        }
        try{ const ev=new InputEvent('input',{bubbles:true}); el.dispatchEvent(ev);}catch(e){}
        try{ const ev2=new Event('change',{bubbles:true}); el.dispatchEvent(ev2);}catch(e){}
        return ok;
    }
    function gmPostJson(url, body){return new Promise((resolve,reject)=>{GM_xmlhttpRequest({method:'POST',url,headers:{'Content-Type':'application/json'},data:JSON.stringify(body),onload:(res)=>{try{const data=JSON.parse(res.responseText);resolve({status:res.status,data})}catch(e){reject(e)}},onerror:(e)=>reject(e)});})}
    async function gmPostJsonWithRetry(url, body, retries=5, baseDelay=900){let attempt=0;while(attempt<=retries){try{const res=await gmPostJson(url,body);if(res&&res.status>=200&&res.status<300){return res}if(res&&(res.status===429||(res.status>=500&&res.status<600))){const d=baseDelay*Math.pow(2,attempt)+Math.random()*250;console.warn('Gemini status',res.status,'retry',attempt+1,'in',Math.round(d),'ms');await wait(d);attempt++;continue}return res}catch(e){if(attempt>=retries){throw e}const d=baseDelay*Math.pow(2,attempt)+Math.random()*250;console.warn('Gemini error retry',attempt+1,'in',Math.round(d),'ms');await wait(d);attempt++}}}
    function detectTweetLang(article){const el=article?.querySelector('[data-testid="tweetText"] [lang], [lang]');return el?el.getAttribute('lang'):(navigator.language||'en');}
    async function generateAIReply(tweetText,lang,avoid){const models=['gemini-2.5-flash-lite','gemini-2.5-flash'];const tgt=lang||'same as tweet';const allowed='💀 🙏 😭 🥀';const avoidList=(Array.isArray(avoid)?avoid:[]).filter(Boolean);let extra=avoidList.length?(' do not reply with exactly any of these lines, and if similar then rephrase to be different: '+avoidList.map(a=>'"'+a+'"').join(', ')+'.') : '';const prompt='reply in this exact language: '+tgt+'. write all lowercase. be respectful, kind, and supportive but with gen z casual vibes. keep it short. 1 sentence if possible, max 3. no hashtags, no mentions, no quotes. avoid using emojis unless absolutely necessary for context, and if used, only from this set: '+allowed+'. never use other emojis. put emoji at end only if used.'+extra+'\nTweet: '+tweetText;const body={contents:[{role:'user',parts:[{text:prompt}]}]};for(const key of config.apiKeys){console.log(`Trying API key: ${key.substring(0,20)}...`);for(const model of models){try{const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(key);const res=await gmPostJson(url,body);if(res&&res.status>=200&&res.status<300){const parts=res.data?.candidates?.[0]?.content?.parts;let text=parts?.map(p=>p.text).join('')||'';text=text.trim().replace(/^[\"'""]+|[\"'""]+$/g,'').toLowerCase();if(text) return text}else{console.warn(`API key ${key.substring(0,20)}... model ${model} failed with status:`,res?.status)}}catch(e){console.warn(`API key ${key.substring(0,20)}... model ${model} error:`,e?.message||String(e))}}}window.__lastAiError='all API keys and models failed';return null}
    function clickReplySendInDialog(dlg){
        const btn=findSendInDialog(dlg);
        if(!btn) return false;
        if(btn.disabled||btn.getAttribute('aria-disabled')==='true') return false;
        try{btn.click();}catch(e){return false}
        return true;
    }
    function pressKeyboardSend(target){
        try{ target.focus(); }catch(e){}
        try{ const kd=new KeyboardEvent('keydown',{key:'Enter',bubbles:true}); const ku=new KeyboardEvent('keyup',{key:'Enter',bubbles:true}); target.dispatchEvent(kd); target.dispatchEvent(ku);}catch(e){}
        try{ const kd=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,ctrlKey:true}); const ku=new KeyboardEvent('keyup',{key:'Enter',bubbles:true,ctrlKey:true}); target.dispatchEvent(kd); target.dispatchEvent(ku);}catch(e){}
    }
    async function waitForSendCompletion(timeoutMs=6000){ const start=Date.now(); while(Date.now()-start<timeoutMs){ const dlgs=Array.from(document.querySelectorAll('div[role="dialog"]')); const open=dlgs.some(d=>{const r=d.getBoundingClientRect();return r.width>0&&r.height>0}); if(!open) return true; await wait(150);} return false }
    function closeReplyDialog(){
        const dlg=document.querySelector('div[role="dialog"]');
        if(!dlg) return;
        let x=dlg.querySelector('[data-testid="app-bar-close"], [aria-label="Close"], [aria-label="close"]');
        if(x){ try{x.click();}catch(e){} return; }
        try{ const kd=new KeyboardEvent('keydown',{key:'Escape',bubbles:true}); const ku=new KeyboardEvent('keyup',{key:'Escape',bubbles:true}); document.dispatchEvent(kd); document.dispatchEvent(ku);}catch(e){}
    }
    async function aiReplyFlow(){const article=getTopVisibleArticle();if(!article){alert('No tweet detected');return}const tweet=extractTweetText(article);if(!tweet){alert('Could not read tweet');return}const lang=detectTweetLang(article);const reply=await generateAIReply(tweet,lang);if(!reply){alert('AI failed: '+(window.__lastAiError||'please try again later'));return}const opened=openReplyForArticle(article);if(!opened){alert('Reply button not found');return}await wait(300);const box=await waitForComposer();if(!box){alert('Composer not found');return}insertTextIntoEditable(box,reply);await wait(250);clickReplySend()}
    async function replyCurrentPostWithAI(){
        try {
            return true;
    } catch(e) {
        console.error('Reply error:',e);
        return false;
    }
}

    // --- GLASSMORPHISM UI REDESIGN ---
    function createControlPanel() {
        const styles = `
            :root {
                --glass-bg: rgba(10, 10, 15, 0.16);
                --glass-border: rgba(255, 255, 255, 0.06);
                --glass-text: #ffffff;
                --glass-text-dim: rgba(255, 255, 255, 0.65);
                --accent-primary: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06));
                --accent-success: linear-gradient(135deg, rgba(34,197,94,0.85), rgba(16,185,129,0.85));
                --accent-warning: linear-gradient(135deg, rgba(110,100,70,0.45), rgba(88,72,56,0.45));
                --accent-danger: linear-gradient(135deg, rgba(110,72,80,0.45), rgba(88,56,62,0.45));
                --glow-primary: rgba(0, 0, 0, 0.25);
                --glow-success: rgba(34, 197, 94, 0.4);
                --shadow-glass: 0 12px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
            }

            * { box-sizing: border-box; }

            #autoaction-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 320px;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 16px;
                box-shadow: var(--shadow-glass);
                color: var(--glass-text);
                font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 13px;
                z-index: 999999;
                backdrop-filter: blur(40px) saturate(180%);
                -webkit-backdrop-filter: blur(40px) saturate(180%);
                opacity: 0;
                transition: opacity 0.25s ease, box-shadow 0.25s ease, backdrop-filter 0.25s ease;
            }

            #autoaction-panel.fluent-init {
                transform: none;
                opacity: 1;
            }

            #autoaction-panel.dragging {
                transition: none !important;
                cursor: grabbing;
            }

            #autoaction-panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                cursor: grab;
                user-select: none;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
                border-radius: 16px 16px 0 0;
                backdrop-filter: blur(20px);
                touch-action: none;
            }

            #autoaction-panel-header h2 {
                display: flex;
                align-items: center;
                gap: 12px;
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: var(--glass-text);
                text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
            }

            #autoaction-header-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                border-radius: 8px;
                background: var(--accent-primary);
                box-shadow: 0 4px 8px var(--glow-primary);
                transition: all 0.3s ease;
            }

            #autoaction-header-icon svg {
                width: 18px;
                height: 18px;
                color: white;
                filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.3));
            }

            .status-container {
                display: flex;
                align-items: center;
                gap: 8px;
            }


            #autoaction-panel-body {
                padding: 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-height: 1000px;
                overflow: hidden;
                transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
            }

            #autoaction-panel.collapsed #autoaction-panel-body {
                max-height: 0;
                padding: 0 20px;
                opacity: 0;
            }

            .autoaction-mode-switcher {
                position: relative;
                display: flex;
                flex-wrap: wrap;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 16px;
                padding: 6px;
                gap: 4px;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }


            .autoaction-mode-btn {
                position: relative;
                z-index: 2;
                background: transparent;
                border: 1px solid transparent;
                color: var(--glass-text-dim);
                cursor: pointer;
                font-weight: 600;
                font-size: 11px;
                padding: 8px 6px;
                border-radius: 10px;
                transition: all 0.3s ease;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                flex: 1;
                min-width: calc(25% - 6px);
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .autoaction-mode-btn.selected {
                background: var(--accent-primary);
                color: var(--glass-text);
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 0 15px var(--glow-primary);
                transform: translateY(-1px);
                text-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
            }

            .autoaction-mode-btn:hover:not(.selected) {
                color: var(--glass-text);
                background: rgba(255, 255, 255, 0.08);
                transform: translateY(-1px);
                text-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
            }

            .autoaction-mode-btn.selected:hover {
                filter: brightness(1.1);
                transform: translateY(-2px);
            }

            .counter-section {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                backdrop-filter: blur(20px);
            }

            .counter-display {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .counter-text {
                font-size: 13px;
                font-weight: 500;
                color: var(--glass-text);
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
            }

            .counter-numbers {
                font-size: 16px;
                font-weight: 700;
                color: var(--glass-text);
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }

            #autoaction-progress-bar-container {
                width: 100%;
                height: 6px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                overflow: hidden;
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            #autoaction-progress-bar {
                height: 100%;
                background: var(--accent-success);
                border-radius: 12px;
                transition: width 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                width: 0%;
                box-shadow: 0 0 12px var(--glow-success);
                position: relative;
            }

            #autoaction-progress-bar::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
                animation: shimmer 2s infinite;
            }

            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }

            #autoaction-toggle-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 80%;
                margin: 0 auto;
                padding: 10px 14px;
                border: none;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                background: linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(79, 70, 229, 0.15));
                color: var(--glass-text);
                border: 1px solid rgba(147, 51, 234, 0.3);
                backdrop-filter: blur(25px) saturate(180%);
                text-shadow: 0 0 10px rgba(147, 51, 234, 0.3);
            }

            #autoaction-toggle-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.1);
            }

            #autoaction-toggle-btn:active {
                transform: translateY(-1px) scale(1.01);
            }

            #autoaction-settings-section {
                margin-top: 12px;
            }

            #autoaction-settings-header {
                display: flex;
                align-items: center;
                cursor: pointer;
                padding: 10px 12px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 12px;
                transition: all 0.3s ease;
                user-select: none;
                backdrop-filter: blur(15px);
            }

            #autoaction-settings-header:hover {
                background: rgba(255, 255, 255, 0.06);
                border-color: rgba(255, 255, 255, 0.12);
                transform: none;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }

            #autoaction-settings-header svg {
                width: 18px;
                height: 18px;
                color: var(--glass-text-dim);
                transition: all 0.3s ease;
                filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.1));
            }

            #autoaction-settings-header span {
                margin-left: 12px;
                font-weight: 500;
                color: var(--glass-text);
                text-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
            }

            #autoaction-chevron {
                margin-left: auto !important;
                margin-right: 0 !important;
            }

            #autoaction-settings-header.expanded #autoaction-chevron {
                transform: rotate(180deg);
            }

            #autoaction-settings-content {
                max-height: 0;
                overflow: hidden;
                opacity: 0;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                background: rgba(255, 255, 255, 0.02);
                border-radius: 0 0 16px 16px;
                margin-top: 0;
                padding: 0 14px;
                backdrop-filter: blur(15px);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-top: 1px solid rgba(255, 255, 255, 0.03);
                overscroll-behavior: contain;
            }

            #autoaction-settings-content.expanded {
                max-height: 320px;
                overflow-y: auto;
                opacity: 1;
                padding: 14px 12px 12px 12px;
                overscroll-behavior: contain;
            }

            #autoaction-settings-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px 16px;
            }

            .autoaction-setting {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                padding: 8px 0;
                gap: 6px;
            }

            .autoaction-setting label {
                font-size: 11px;
                font-weight: 500;
                color: var(--glass-text);
                text-shadow: 0 0 8px rgba(255, 255, 255, 0.1);
            }

            .autoaction-setting input[type="number"],
            .autoaction-setting select {
                width: 100%;
                max-width: 120px;
                text-align: center;
            }

            .autoaction-setting:last-child {
                border-bottom: none;
            }

            .autoaction-setting input[type="number"],
            .autoaction-setting select {
                background: rgba(255, 255, 255, 0.05);
                color: var(--glass-text);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 8px 10px;
                font-size: 12px;
                width: 72px;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
                text-shadow: 0 0 5px rgba(255, 255, 255, 0.1);
                text-align: center;
            }

            .autoaction-setting select {
                width: 96px;
                appearance: none;
                -webkit-appearance: none;
                -moz-appearance: none;
                padding-right: 28px;
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
                background-repeat: no-repeat;
                background-position: right 8px center;
                background-size: 14px 14px;
                color-scheme: dark;
            }

            /* Hide legacy arrow in old Edge/IE */
            #autoaction-panel select::-ms-expand { display: none; }

            /* Stronger Fluent feel on hover/focus */
            #autoaction-panel select:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.18);
            }

            #autoaction-panel select:focus {
                outline: none;
                border-color: rgba(102, 126, 234, 0.6);
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15), 0 0 12px rgba(102, 126, 234, 0.3);
                background: rgba(255, 255, 255, 0.08);
            }

            /* Dark dropdown list where supported */
            #autoaction-panel select, #autoaction-panel option {
                background-color: rgba(20, 20, 28, 0.96);
                color: var(--glass-text);
            }

            /* Fluent custom select */
            .fluent-select {
                position: relative;
                width: 96px;
            }
            .fluent-select-button {
                width: 100%;
                background: rgba(255, 255, 255, 0.05);
                color: var(--glass-text);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 8px 28px 8px 10px;
                font-size: 12px;
                line-height: 1;
                cursor: pointer;
                text-align: center;
                backdrop-filter: blur(10px);
                transition: all 0.2s ease;
                position: relative;
            }
            .fluent-select-button:after {
                content: '';
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                width: 14px; height: 14px;
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
                background-size: 14px 14px;
                background-repeat: no-repeat;
            }
            .fluent-select-button:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); }
            .fluent-select-button:focus { outline: none; border-color: rgba(102,126,234,0.6); box-shadow: 0 0 0 3px rgba(102,126,234,0.15), 0 0 12px rgba(102,126,234,0.3); background: rgba(255,255,255,0.08); }
            .fluent-select-menu {
                position: absolute;
                left: 0;
                right: 0;
                top: calc(100% + 6px);
                background: rgba(20, 20, 28, 0.96);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 10px;
                box-shadow: 0 12px 24px rgba(0,0,0,0.35);
                backdrop-filter: blur(14px);
                z-index: 1000000;
                padding: 6px;
                display: none;
            }
            .fluent-select.open .fluent-select-menu { display: block; }
            .fluent-select-item {
                padding: 8px 10px;
                font-size: 12px;
                color: var(--glass-text);
                border-radius: 8px;
                cursor: pointer;
                text-align: center;
                transition: background 0.15s ease;
            }
            .fluent-select-item:hover { background: rgba(255,255,255,0.08); }

            .autoaction-setting input[type="number"]:focus,
            .autoaction-setting select:focus {
                outline: none;
                border-color: rgba(102, 126, 234, 0.6);
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15), 0 0 12px rgba(102, 126, 234, 0.3);
                background: rgba(255, 255, 255, 0.08);
            }

            .autoaction-checkbox-container {
                position: relative;
            }

            .autoaction-setting input[type="checkbox"] {
                appearance: none;
                width: 44px;
                height: 24px;
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 15px;
                position: relative;
                cursor: pointer;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                backdrop-filter: blur(10px);
            }

            .autoaction-setting input[type="checkbox"]:checked {
                background: var(--accent-primary);
                border-color: transparent;
                box-shadow: 0 0 15px var(--glow-primary);
            }

            .autoaction-setting input[type="checkbox"]::before {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 16px;
                height: 16px;
                background: linear-gradient(135deg, #ffffff, #f0f0f0);
                border-radius: 50%;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            }

            .autoaction-setting input[type="checkbox"]:checked::before {
                transform: translateX(20px);
                box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
            }

            .autoaction-mini-checkbox {
                appearance: none;
                width: 18px;
                height: 18px;
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                cursor: pointer;
                position: relative;
                transition: all 0.3s ease;
                backdrop-filter: blur(8px);
            }

            .autoaction-mini-checkbox:checked {
                background: var(--accent-primary);
                border-color: transparent;
                box-shadow: 0 0 12px var(--glow-primary);
            }

            .autoaction-mini-checkbox:checked::after {
                content: '✓';
                position: absolute;
                top: 0px;
                left: 2px;
                color: white;
                font-size: 11px;
                font-weight: bold;
                text-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
                animation: checkPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }

            @keyframes checkPop {
                0% { transform: scale(0) rotate(45deg); }
                50% { transform: scale(1.2) rotate(0deg); }
                100% { transform: scale(1) rotate(0deg); }
            }

            #autoaction-ai-section {
                margin-top: 8px;
            }

            #generate-reply-btn {
                width: 100%;
                padding: 14px 24px;
                border: none;
                border-radius: 18px;
                background: var(--accent-primary);
                color: white;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                text-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }

            #generate-reply-btn:hover {
                transform: translateY(-2px) scale(1.02);
                box-shadow: 0 10px 30px rgba(247, 112, 154, 0.5);
                filter: brightness(1.1);
            }

            #autoaction-status-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: var(--accent-danger);
                transition: all 0.3s ease;
                box-shadow: 0 0 8px rgba(240, 147, 251, 0.4);
            }

            #autoaction-status-dot.running {
                background: var(--accent-success);
                animation: pulse-glow 2s infinite;
                box-shadow: 0 0 15px var(--glow-success);
            }

            @keyframes pulse-glow {
                0%, 100% { transform: scale(1); box-shadow: 0 0 15px var(--glow-success); }
                50% { transform: scale(1.1); box-shadow: 0 0 25px var(--glow-success); }
            }

            #autoaction-status-text {
                font-size: 13px;
                font-weight: 500;
                color: var(--glass-text-dim);
                text-shadow: 0 0 6px rgba(255, 255, 255, 0.1);
            }

            #autoaction-collapse-indicator {
                font-size: 16px;
                color: var(--glass-text-dim);
                transition: all 0.3s ease;
                cursor: pointer;
                padding: 6px;
                border-radius: 8px;
                backdrop-filter: blur(5px);
            }

            #autoaction-collapse-indicator:hover {
                background: rgba(255, 255, 255, 0.08);
                color: var(--glass-text);
                transform: scale(1.1);
            }

            #autoaction-ai-section {
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 8px;
            }

            #generate-reply-btn {
                font-size: 12px;
                padding: 6px 10px;
                border-radius: 8px;
                background: var(--accent-primary);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: var(--glass-text);
                box-shadow: none;
                transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
            }

            #generate-reply-btn:hover {
                box-shadow: none;
                background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.08));
                border-color: rgba(255, 255, 255, 0.18);
                transform: translateY(-1px);
            }

            /* Analytics Panel Styles */
            .analytics-simple-panel {
                padding: 16px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 12px;
                margin-bottom: 12px;
            }

            .analytics-simple-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .analytics-back-simple {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: var(--glass-text);
                cursor: pointer;
                padding: 8px 12px;
                font-size: 12px;
                transition: all 0.2s ease;
            }

            .analytics-back-simple:hover {
                background: rgba(255, 255, 255, 0.08);
            }

            .analytics-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
            }

            .analytics-back-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: var(--glass-text);
                cursor: pointer;
                padding: 8px;
                transition: all 0.2s ease;
            }

            .analytics-back-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .analytics-time-switcher {
                display: flex;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 12px;
                padding: 4px;
                gap: 2px;
                margin-bottom: 16px;
            }

            .analytics-time-btn {
                flex: 1;
                background: transparent;
                border: none;
                color: var(--glass-text-dim);
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                padding: 8px 12px;
                border-radius: 8px;
                transition: all 0.2s ease;
            }

            .analytics-time-btn.active {
                background: var(--accent-primary);
                color: var(--glass-text);
                box-shadow: 0 0 12px var(--glow-primary);
            }

            .analytics-simple-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 8px;
                margin-bottom: 16px;
            }

            .analytics-simple-card {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 8px;
                text-align: center;
                font-size: 11px;
            }

            .analytics-simple-icon {
                font-size: 16px;
                margin-bottom: 4px;
            }

            .analytics-simple-value {
                font-size: 16px;
                font-weight: 700;
                color: var(--glass-text);
                margin-bottom: 2px;
            }

            .analytics-simple-label {
                font-size: 9px;
                color: var(--glass-text-dim);
                text-transform: uppercase;
            }

            .analytics-simple-total {
                text-align: center;
                margin-bottom: 12px;
                padding: 8px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 8px;
            }

            .analytics-simple-total-value {
                font-size: 20px;
                font-weight: 700;
                color: var(--glass-text);
            }

            .analytics-simple-total-label {
                font-size: 10px;
                color: var(--glass-text-dim);
                margin-top: 2px;
            }

            .analytics-stats-section {
                margin-bottom: 12px;
            }

            .analytics-stats-title {
                font-size: 11px;
                font-weight: 600;
                color: var(--glass-text);
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .analytics-detailed-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
                margin-bottom: 8px;
            }

            .analytics-detail-item {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 6px;
                padding: 6px 8px;
                text-align: center;
                font-size: 10px;
            }

            .analytics-detail-value {
                font-size: 12px;
                font-weight: 600;
                color: var(--glass-text);
                margin-bottom: 2px;
            }

            .analytics-detail-label {
                font-size: 8px;
                color: var(--glass-text-dim);
                text-transform: uppercase;
            }

            .analytics-comparison {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 6px;
                padding: 6px 8px;
                margin-bottom: 8px;
                font-size: 10px;
            }

            .analytics-trend {
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 600;
            }

            .analytics-trend.up {
                color: #10b981;
            }

            .analytics-trend.down {
                color: #ef4444;
            }

            .analytics-trend.neutral {
                color: var(--glass-text-dim);
            }

            .analytics-stat-icon {
                font-size: 18px;
                margin-bottom: 8px;
            }

            .analytics-stat-value {
                font-size: 18px;
                font-weight: 700;
                color: var(--glass-text);
                margin-bottom: 4px;
            }

            .analytics-stat-label {
                font-size: 10px;
                color: var(--glass-text-dim);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .analytics-summary {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 12px;
            }

            .analytics-summary-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--glass-text);
                margin-bottom: 12px;
                text-align: center;
            }

            .analytics-total {
                text-align: center;
                margin-bottom: 16px;
            }

            .analytics-total-value {
                font-size: 24px;
                font-weight: 700;
                color: var(--glass-text);
                text-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
            }

            .analytics-total-label {
                font-size: 12px;
                color: var(--glass-text-dim);
                margin-top: 4px;
            }

            /* Analytics Launch Button */
            #analytics-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                padding: 12px 16px;
                min-height: 44px;
                box-sizing: border-box;
                border-radius: 10px;
                background: var(--accent-primary);
                color: var(--glass-text);
                border: 1px solid rgba(255,255,255,0.2);
                cursor: pointer;
                font-weight: 700;
                font-size: 14px;
                line-height: 1.2;
                white-space: normal;
                gap: 8px;
            }
            #analytics-btn:hover {
                border-color: rgba(255,255,255,0.3);
                background: linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.10));
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        const panel = document.createElement('div');
        panel.id = 'autoaction-panel';
        panel.innerHTML = `
            <div id="autoaction-panel-header">
                <h2>
                    <span id="autoaction-header-icon"></span>
                    <span id="autoaction-title">Auto Actions</span>
                </h2>
                <div class="status-container">
                    <span id="autoaction-status-dot"></span>
                    <span id="autoaction-status-text">Stopped</span>
                    <span id="autoaction-collapse-indicator">▼</span>
                </div>
            </div>
            <div id="autoaction-panel-body">
                <div class="main-content" id="main-content">
                <div class="autoaction-mode-switcher" id="mode-switcher">
                    <button class="autoaction-mode-btn" id="mode-btn-like">Like</button>
                    <button class="autoaction-mode-btn" id="mode-btn-unlike">Unlike</button>
                    <button class="autoaction-mode-btn" id="mode-btn-retweet">Retweet</button>
                    <button class="autoaction-mode-btn" id="mode-btn-unretweet">Unretweet</button>
                    <button class="autoaction-mode-btn" id="mode-btn-reply">Reply</button>
                    <button class="autoaction-mode-btn" id="mode-btn-bookmark">Bookmark</button>
                    <button class="autoaction-mode-btn" id="mode-btn-unbookmark">Unbookmark</button>
                </div>

                <div class="counter-section">
                    <div class="counter-display">
                        <span class="counter-text">
                            <span id="autoaction-count-label">Actions</span>
                        </span>
                        <span class="counter-numbers">
                            <span id="autoaction-count">0</span> / <span id="autoaction-max-count">${config.maxActions}</span>
                        </span>
                    </div>
                    <div id="autoaction-progress-bar-container">
                        <div id="autoaction-progress-bar"></div>
                    </div>
                </div>

                <button id="autoaction-toggle-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M8 5v14l11-7z"></path>
                    </svg>
                    Start
                </button>

                <div id="autoaction-ai-section">
                    <button id="generate-reply-btn">Reply with AI</button>
                </div>

                <div id="autoaction-settings-section">
                    <div id="autoaction-settings-header">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                            <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17-.59-1.69-.98l-2.49 1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"></path>
                    </svg>
                    <span>Settings</span>
                    <span id="autoaction-chevron">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path>
                        </svg>
                    </span>
                </div>

                <div id="autoaction-settings-content">
                    <div id="autoaction-settings-grid">
                        <div class="autoaction-setting">
                            <label>Likes Per Batch</label>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <input type="checkbox" id="focus-toggle" class="autoaction-mini-checkbox" title="Toggle Focus" ${config.focusMode ? 'checked' : ''}>
                                <input type="number" id="likes-per-batch" value="${config.likesPerBatch}" min="1" max="10" style="width:60px;">
                            </div>
                        </div>
                        <div class="autoaction-setting">
                            <label for="max-actions">Max Actions</label>
                            <input type="number" id="max-actions" value="${config.maxActions}" min="1" max="1000" step="1">
                        </div>
                        <div class="autoaction-setting">
                            <label for="action-delay">Action Delay (ms)</label>
                            <input type="number" id="action-delay" value="${config.actionDelay}" min="100" step="50">
                        </div>
                        <div class="autoaction-setting">
                            <label for="scroll-delay">Scroll Delay (ms)</label>
                            <input type="number" id="scroll-delay" value="${config.scrollDelay}" min="500" step="100">
                        </div>
                        <div class="autoaction-setting">
                            <label for="random-delay">Randomize Delays</label>
                            <input type="checkbox" id="random-delay" ${config.randomDelay ? 'checked' : ''}>
                        </div>
                        <div class="autoaction-setting">
                            <label for="smooth-scroll">Smooth Scroll</label>
                            <input type="checkbox" id="smooth-scroll" ${config.smoothScroll ? 'checked' : ''}>
                        </div>
                        <div class="autoaction-setting">
                            <label for="scroll-direction">Scroll Direction</label>
                            <select id="scroll-direction">
                                <option value="down" ${config.scrollDirection === 'down' ? 'selected' : ''}>Down</option>
                                <option value="up" ${config.scrollDirection === 'up' ? 'selected' : ''}>Up</option>
                            </select>
                        </div>
                        <div class="autoaction-setting">
                            <label for="count-by-posts">Count by Posts</label>
                            <input type="checkbox" id="count-by-posts" ${config.countByPosts ? 'checked' : ''}>
                        </div>
                        <div class="autoaction-setting">
                            <label for="stop-on-original">Stop on Original Post</label>
                            <input type="checkbox" id="stop-on-original" ${config.stopOnOriginal ? 'checked' : ''}>
                        </div>
                        <div class="autoaction-setting">
                            <label for="ignore-replies">Ignore Replies</label>
                            <input type="checkbox" id="ignore-replies" ${config.ignoreReplies ? 'checked' : ''}>
                        </div>
                        <div class="autoaction-setting">
                            <label for="disable-like-after-ai-reply">Disable Like after AI Reply</label>
                            <input type="checkbox" id="disable-like-after-ai-reply" ${config.disableLikeAfterAIReply ? 'checked' : ''}>
                        </div>
                        <div class="autoaction-setting" style="grid-column: 1 / -1;">
                            <button id="analytics-btn">📊 View Analytics</button>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        try {
            panel.classList.remove('collapsed');
            const body = panel.querySelector('#autoaction-panel-body');
            if (body) body.style.display = 'flex';
        } catch(_) {}
        document.getElementById('autoaction-toggle-btn').addEventListener('click', toggleAction);
        document.getElementById('mode-btn-like').addEventListener('click', () => toggleModeSelection('like'));
        document.getElementById('mode-btn-unlike').addEventListener('click', () => toggleModeSelection('unlike'));
        document.getElementById('mode-btn-retweet').addEventListener('click', () => toggleModeSelection('retweet'));
        document.getElementById('mode-btn-unretweet').addEventListener('click', () => toggleModeSelection('unretweet'));
        document.getElementById('mode-btn-reply').addEventListener('click', () => toggleModeSelection('reply'));
        document.getElementById('autoaction-settings-header').addEventListener('click', (e) => { const s=e.currentTarget.closest('#autoaction-settings-section');s.querySelector('#autoaction-settings-content').classList.toggle('expanded');s.querySelector('#autoaction-settings-header').classList.toggle('expanded'); });
        document.getElementById('likes-per-batch').addEventListener('input', e => config.likesPerBatch = parseInt(e.target.value, 10));
        document.getElementById('max-actions').addEventListener('input', e => { config.maxActions = parseInt(e.target.value, 10); updateStatus(); });
        document.getElementById('action-delay').addEventListener('input', e => config.actionDelay = parseInt(e.target.value, 10));
        document.getElementById('scroll-delay').addEventListener('input', e => config.scrollDelay = parseInt(e.target.value, 10));
        document.getElementById('random-delay').addEventListener('change', e => config.randomDelay = e.target.checked);
        document.getElementById('smooth-scroll').addEventListener('change', e => config.smoothScroll = e.target.checked);
        document.getElementById('scroll-direction').addEventListener('change', e => config.scrollDirection = e.target.value);
        const sdSelect = document.getElementById('scroll-direction');
        if (sdSelect) {
            sdSelect.style.position = 'absolute';
            sdSelect.style.pointerEvents = 'none';
            sdSelect.style.opacity = '0';
            const wrapper = document.createElement('div');
            wrapper.className = 'fluent-select';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fluent-select-button';
            btn.textContent = sdSelect.options[sdSelect.selectedIndex]?.text || '';
            const menu = document.createElement('div');
            menu.className = 'fluent-select-menu';
            Array.from(sdSelect.options).forEach(opt => {
                const item = document.createElement('div');
                item.className = 'fluent-select-item';
                item.dataset.value = opt.value;
                item.textContent = opt.text;
                item.addEventListener('click', () => {
                    sdSelect.value = opt.value;
                    btn.textContent = opt.text;
                    sdSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    wrapper.classList.remove('open');
                });
                menu.appendChild(item);
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                wrapper.classList.toggle('open');
            });
            document.addEventListener('click', () => { wrapper.classList.remove('open'); });
            wrapper.appendChild(btn);
            wrapper.appendChild(menu);
            sdSelect.parentElement.appendChild(wrapper);
        }
        document.getElementById('mode-btn-bookmark').addEventListener('click', () => toggleModeSelection('bookmark'));
        document.getElementById('mode-btn-unbookmark').addEventListener('click', () => toggleModeSelection('unbookmark'));
        const countByPostsEl = document.getElementById('count-by-posts');
        if (countByPostsEl) {
            countByPostsEl.addEventListener('change', e => { config.countByPosts = e.target.checked; updateStatus(); });
        }
        document.getElementById('ignore-replies').addEventListener('change', e => config.ignoreReplies = e.target.checked);
        document.getElementById('stop-on-original').addEventListener('change', e => config.stopOnOriginal = e.target.checked);
        const disableLikeAfterAIReplyEl = document.getElementById('disable-like-after-ai-reply');
        if (disableLikeAfterAIReplyEl) {
            disableLikeAfterAIReplyEl.addEventListener('change', e => { config.disableLikeAfterAIReply = e.target.checked; });
        }
        const focusToggleInput = document.getElementById('focus-toggle');
        focusToggleInput.addEventListener('change', e => {
            config.focusMode = e.target.checked;
        });
        focusToggleInput.checked = config.focusMode;
        const settingsContentEl = document.getElementById('autoaction-settings-content');
        if (settingsContentEl) {
            settingsContentEl.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                settingsContentEl.scrollTop += e.deltaY;
            }, { passive: false });
        }
        makeDraggable(panel);
        document.getElementById('autoaction-collapse-indicator').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            panel.classList.toggle('collapsed');
        });
        setTimeout(() => {
            panel.classList.add('fluent-init');
        }, 100);
        updateStatus();
        document.getElementById('generate-reply-btn').addEventListener('click', replyCurrentPostWithAI);
        document.getElementById('analytics-btn').addEventListener('click', showAnalytics);
    }

    function updateStatus() {
        const statusDot = document.getElementById('autoaction-status-dot');
        const statusText = document.getElementById('autoaction-status-text');
        const countEl = document.getElementById('autoaction-count');
        const progressBar = document.getElementById('autoaction-progress-bar');
        const toggleBtn = document.getElementById('autoaction-toggle-btn');
        const settingsInputs = document.querySelectorAll('#autoaction-settings-content input, .autoaction-mode-btn');
        const titleEl = document.getElementById('autoaction-title');
        const iconEl = document.getElementById('autoaction-header-icon');
        const modeSwitcher = document.getElementById('mode-switcher');

        if (!statusDot) return;

        const svg_play = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 22v-20l18 10-18 10z"></path></svg>`;
        const svg_pause = `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`;
        const svg_heart = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;
        const svg_heart_broken = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path><path d="M12 9L8 5v6l4-2z" fill="white"></path></svg>`;
        const svg_retweet = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"></path></svg>`;
        const svg_unretweet = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"></path><path d="M16 8l-2 2-2-2L10 10l4 4 4-4-2-2z" fill="white"></path></svg>`;
        const svg_reply = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M21 6h-2v9H7l-4 4V6c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2z"></path></svg>`;
        const svg_bookmark = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"></path></svg>`;
        const svg_unbookmark = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"></path><path d="M7 7l10 10" stroke="white" stroke-width="2"></path></svg>`;

        const selectedModes = config.selectedModes || [config.mode || 'like'];
        const modeText = selectedModes.length > 1 ? `Multi (${selectedModes.length})` : selectedModes[0].charAt(0).toUpperCase() + selectedModes[0].slice(1);

        titleEl.textContent = `Auto ${modeText}`;

        const modeIcons = {
            'like': svg_heart,
            'unlike': svg_heart_broken,
            'retweet': svg_retweet,
            'unretweet': svg_unretweet,
            'reply': svg_reply,
            'bookmark': svg_bookmark,
            'unbookmark': svg_unbookmark
        };

        iconEl.innerHTML = selectedModes.length > 1 ? svg_heart : (modeIcons[selectedModes[0]] || svg_heart);

        const countLabel = config.countByPosts ? 'Posts' : (selectedModes.length > 1 ? 'Actions' : (selectedModes[0] === 'reply' ? 'Replies' : `${selectedModes[0].charAt(0).toUpperCase() + selectedModes[0].slice(1)}s`));
        document.getElementById('autoaction-count-label').textContent = countLabel;

        // Update visual selection state for mode buttons
        const modeButtons = document.querySelectorAll('.autoaction-mode-btn');
        modeButtons.forEach(btn => {
            const mode = btn.id.replace('mode-btn-', '');
            btn.classList.toggle('selected', selectedModes.includes(mode));
        });


        statusDot.classList.toggle('running', isRunning);

        if (isRunning) {
            statusText.textContent = 'Running';
            toggleBtn.innerHTML = `${svg_pause} Stop`;
            toggleBtn.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 127, 0.15))';
            toggleBtn.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            settingsInputs.forEach(input => input.disabled = true);
        } else {
            statusText.textContent = 'Stopped';
            toggleBtn.innerHTML = `${svg_play} Start`;
            toggleBtn.style.background = 'linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(79, 70, 229, 0.15))';
            toggleBtn.style.border = '1px solid rgba(147, 51, 234, 0.3)';
            settingsInputs.forEach(input => input.disabled = false);
        }

        const displayCount = config.countByPosts ? postCount : actionCount;
        countEl.textContent = displayCount;

        // Update max count display
        const maxCountEl = document.getElementById('autoaction-max-count');
        if (maxCountEl) maxCountEl.textContent = config.maxActions;

        const progressPercentage = Math.min((displayCount / config.maxActions) * 100, 100);
        progressBar.style.width = `${progressPercentage}%`;
    }

    function showAnalytics() {
        currentView = 'analytics';
        const panel = document.getElementById('autoaction-panel');
        const body = document.getElementById('autoaction-panel-body');
        if (panel) panel.classList.remove('collapsed');
        if (body) {
            body.style.display = 'flex';
            body.style.maxHeight = '1000px';
            body.style.opacity = '1';
            body.style.padding = '14px';
        }

        renderSimpleAnalytics('daily');
        try { console.log('[analytics] showAnalytics -> rendered simple analytics'); } catch(_) {}
    }

    // Make functions globally accessible
    window.showAnalytics = showAnalytics;

    function showMainView() {
        currentView = 'main';
        const panel = document.getElementById('autoaction-panel');
        const body = document.getElementById('autoaction-panel-body');
        if (panel) panel.classList.remove('collapsed');
        if (body) {
            body.style.display = 'flex';
            body.style.maxHeight = '1000px';
            body.style.opacity = '1';
            body.style.padding = '14px';
        }

        renderMainContent();
        try { console.log('[analytics] showMainView -> rendered main content'); } catch(_) {}
    }

    // Make functions globally accessible
    window.showMainView = showMainView;

    function renderMainContent() {
        const mainHtml = `
                <div class="autoaction-mode-switcher" id="mode-switcher">
                    <button class="autoaction-mode-btn" id="mode-btn-like">Like</button>
                    <button class="autoaction-mode-btn" id="mode-btn-unlike">Unlike</button>
                    <button class="autoaction-mode-btn" id="mode-btn-retweet">Retweet</button>
                    <button class="autoaction-mode-btn" id="mode-btn-unretweet">Unretweet</button>
                    <button class="autoaction-mode-btn" id="mode-btn-reply">Reply</button>
                    <button class="autoaction-mode-btn" id="mode-btn-bookmark">Bookmark</button>
                    <button class="autoaction-mode-btn" id="mode-btn-unbookmark">Unbookmark</button>
                </div>

                <div class="counter-section">
                    <div class="counter-display">
                        <span class="counter-text">
                            <span id="autoaction-count-label">Actions</span>
                        </span>
                        <span class="counter-numbers">
                            <span id="autoaction-count">0</span> / <span id="autoaction-max-count">${config.maxActions}</span>
                        </span>
                    </div>
                    <div id="autoaction-progress-bar-container">
                        <div id="autoaction-progress-bar"></div>
                    </div>
                </div>

                <button id="autoaction-toggle-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M8 5v14l11-7z"></path>
                    </svg>
                    Start
                </button>

                <div id="autoaction-ai-section">
                    <button id="generate-reply-btn">Reply with AI</button>
                </div>

                <div id="autoaction-settings-section">
                    <div id="autoaction-settings-header">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                            <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17-.59-1.69-.98l-2.49 1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"></path>
                        </svg>
                        <span>Settings</span>
                        <span id="autoaction-chevron">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path>
                            </svg>
                        </span>
                    </div>

                    <div id="autoaction-settings-content">
                        <div id="autoaction-settings-grid">
                            <div class="autoaction-setting">
                                <label>Likes Per Batch</label>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input type="checkbox" id="focus-toggle" class="autoaction-mini-checkbox" title="Toggle Focus" ${config.focusMode ? 'checked' : ''}>
                                    <input type="number" id="likes-per-batch" value="${config.likesPerBatch}" min="1" max="10" style="width:60px;">
                                </div>
                            </div>
                            <div class="autoaction-setting">
                                <label for="max-actions">Max Actions</label>
                                <input type="number" id="max-actions" value="${config.maxActions}" min="1" max="1000" step="1">
                            </div>
                            <div class="autoaction-setting">
                                <label for="action-delay">Action Delay (ms)</label>
                                <input type="number" id="action-delay" value="${config.actionDelay}" min="100" step="50">
                            </div>
                            <div class="autoaction-setting">
                                <label for="scroll-delay">Scroll Delay (ms)</label>
                                <input type="number" id="scroll-delay" value="${config.scrollDelay}" min="500" step="100">
                            </div>
                            <div class="autoaction-setting">
                                <label for="random-delay">Randomize Delays</label>
                                <input type="checkbox" id="random-delay" ${config.randomDelay ? 'checked' : ''}>
                            </div>
                            <div class="autoaction-setting">
                                <label for="smooth-scroll">Smooth Scroll</label>
                                <input type="checkbox" id="smooth-scroll" ${config.smoothScroll ? 'checked' : ''}>
                            </div>
                            <div class="autoaction-setting">
                                <label for="scroll-direction">Scroll Direction</label>
                                <select id="scroll-direction">
                                    <option value="down" ${config.scrollDirection === 'down' ? 'selected' : ''}>Down</option>
                                    <option value="up" ${config.scrollDirection === 'up' ? 'selected' : ''}>Up</option>
                                </select>
                            </div>
                            <div class="autoaction-setting">
                                <label for="count-by-posts">Count by Posts</label>
                                <input type="checkbox" id="count-by-posts" ${config.countByPosts ? 'checked' : ''}>
                            </div>
                            <div class="autoaction-setting">
                                <label for="stop-on-original">Stop on Original Post</label>
                                <input type="checkbox" id="stop-on-original" ${config.stopOnOriginal ? 'checked' : ''}>
                            </div>
                            <div class="autoaction-setting">
                                <label for="ignore-replies">Ignore Replies</label>
                                <input type="checkbox" id="ignore-replies" ${config.ignoreReplies ? 'checked' : ''}>
                            </div>
                            <div class="autoaction-setting">
                                <label for="disable-like-after-ai-reply">Disable Like after AI Reply</label>
                                <input type="checkbox" id="disable-like-after-ai-reply" ${config.disableLikeAfterAIReply ? 'checked' : ''}>
                            </div>
                            <div class="autoaction-setting" style="grid-column: 1 / -1;">
                                <button id="analytics-btn">📊 View Analytics</button>
                            </div>
                        </div>
                    </div>
                </div>
        `;

        const body = document.getElementById('autoaction-panel-body');
        if (body) {
            body.innerHTML = mainHtml;
        }

        // Re-attach event listeners for main content
        setTimeout(() => {
            try {
                document.getElementById('autoaction-toggle-btn')?.addEventListener('click', toggleAction);
                document.getElementById('mode-btn-like')?.addEventListener('click', () => toggleModeSelection('like'));
                document.getElementById('mode-btn-unlike')?.addEventListener('click', () => toggleModeSelection('unlike'));
                document.getElementById('mode-btn-retweet')?.addEventListener('click', () => toggleModeSelection('retweet'));
                document.getElementById('mode-btn-unretweet')?.addEventListener('click', () => toggleModeSelection('unretweet'));
                document.getElementById('mode-btn-reply')?.addEventListener('click', () => toggleModeSelection('reply'));
                document.getElementById('mode-btn-bookmark')?.addEventListener('click', () => toggleModeSelection('bookmark'));
                document.getElementById('mode-btn-unbookmark')?.addEventListener('click', () => toggleModeSelection('unbookmark'));
                document.getElementById('analytics-btn')?.addEventListener('click', showAnalytics);
                document.getElementById('generate-reply-btn')?.addEventListener('click', replyCurrentPostWithAI);

                document.getElementById('autoaction-settings-header')?.addEventListener('click', (e) => {
                    const s = e.currentTarget.closest('#autoaction-settings-section');
                    s.querySelector('#autoaction-settings-content').classList.toggle('expanded');
                    s.querySelector('#autoaction-settings-header').classList.toggle('expanded');
                });

                // Settings inputs
                document.getElementById('likes-per-batch')?.addEventListener('input', e => config.likesPerBatch = parseInt(e.target.value, 10));
                document.getElementById('max-actions')?.addEventListener('input', e => {
                    config.maxActions = parseInt(e.target.value, 10);
                    const maxCountEl = document.getElementById('autoaction-max-count');
                    if (maxCountEl) maxCountEl.textContent = config.maxActions;
                    updateStatus();
                });
                document.getElementById('action-delay')?.addEventListener('input', e => config.actionDelay = parseInt(e.target.value, 10));
                document.getElementById('scroll-delay')?.addEventListener('input', e => config.scrollDelay = parseInt(e.target.value, 10));
                document.getElementById('random-delay')?.addEventListener('change', e => config.randomDelay = e.target.checked);
                document.getElementById('smooth-scroll')?.addEventListener('change', e => config.smoothScroll = e.target.checked);
                document.getElementById('scroll-direction')?.addEventListener('change', e => config.scrollDirection = e.target.value);
                document.getElementById('count-by-posts')?.addEventListener('change', e => { config.countByPosts = e.target.checked; updateStatus(); });
                document.getElementById('ignore-replies')?.addEventListener('change', e => config.ignoreReplies = e.target.checked);
                document.getElementById('stop-on-original')?.addEventListener('change', e => config.stopOnOriginal = e.target.checked);
                document.getElementById('disable-like-after-ai-reply')?.addEventListener('change', e => config.disableLikeAfterAIReply = e.target.checked);
                document.getElementById('focus-toggle')?.addEventListener('change', e => config.focusMode = e.target.checked);

                updateStatus();
            } catch(e) {
                console.warn('[main] Event listener setup failed:', e);
            }
        }, 100);
    }

    function renderSimpleAnalytics(period) {
        if (!config.analytics) {
            config.analytics = { daily: {}, weekly: {}, monthly: {} };
        }

        const data = config.analytics[period] || {};
        const modeIcons = {
            'like': '❤️', 'unlike': '💔', 'retweet': '🔁', 'unretweet': '🔄',
            'reply': '💬', 'bookmark': '🔖', 'unbookmark': '🗑️'
        };
        const modeLabels = {
            'like': 'Likes', 'unlike': 'Unlikes', 'retweet': 'Retweets',
            'unretweet': 'Unretweets', 'reply': 'Replies', 'bookmark': 'Bookmarks', 'unbookmark': 'Unbookmarks'
        };

        let currentData = {};
        let previousData = {};
        let totalActions = 0;
        let periodLabel = 'today';
        let comparisonLabel = 'yesterday';

        if (period === 'daily') {
            const today = getDateKey();
            const yesterday = getDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
            currentData = data[today] || {};
            previousData = data[yesterday] || {};
            periodLabel = 'today';
            comparisonLabel = 'yesterday';
        } else if (period === 'weekly') {
            const thisWeek = getWeekKey();
            const lastWeek = getWeekKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
            currentData = data[thisWeek] || {};
            previousData = data[lastWeek] || {};
            periodLabel = 'this week';
            comparisonLabel = 'last week';
        } else if (period === 'monthly') {
            const thisMonth = getMonthKey();
            const lastMonth = getMonthKey(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
            currentData = data[thisMonth] || {};
            previousData = data[lastMonth] || {};
            periodLabel = 'this month';
            comparisonLabel = 'last month';
        }

        Object.values(currentData).forEach(count => totalActions += count);
        const previousTotal = Object.values(previousData).reduce((sum, count) => sum + count, 0);

        // Calculate statistics
        const activeActions = Object.keys(currentData).filter(key => currentData[key] > 0).length;
        const mostUsedAction = Object.keys(currentData).reduce((a, b) => (currentData[a] || 0) > (currentData[b] || 0) ? a : b, 'like');
        const averagePerAction = activeActions > 0 ? Math.round(totalActions / activeActions * 10) / 10 : 0;

        // Calculate trend
        const trend = totalActions > previousTotal ? 'up' : totalActions < previousTotal ? 'down' : 'neutral';
        const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
        const trendPercent = previousTotal > 0 ? Math.round(((totalActions - previousTotal) / previousTotal) * 100) : 0;

        let cardsHtml = '';
        Object.keys(modeLabels).forEach(mode => {
            const count = currentData[mode] || 0;
            if (count > 0) {
                cardsHtml += `
                    <div class="analytics-simple-card">
                        <div class="analytics-simple-icon">${modeIcons[mode]}</div>
                        <div class="analytics-simple-value">${count}</div>
                        <div class="analytics-simple-label">${modeLabels[mode]}</div>
                    </div>
                `;
            }
        });

        if (!cardsHtml) {
            cardsHtml = '<div style="grid-column: 1 / -1; text-align: center; color: var(--glass-text-dim); padding: 20px;">No data available for this period</div>';
        }

        const analyticsHtml = `
            <div class="analytics-simple-panel">
                <div class="analytics-simple-header">
                    <button class="analytics-back-simple" id="analytics-back-btn">← Back</button>
                    <span style="font-weight: 600; color: var(--glass-text);">📊 Analytics</span>
                </div>

                <div class="analytics-simple-total">
                    <div class="analytics-simple-total-value">${totalActions}</div>
                    <div class="analytics-simple-total-label">actions ${periodLabel}</div>
                </div>

                ${totalActions > 0 ? `
                <div class="analytics-comparison">
                    <span>vs ${comparisonLabel}</span>
                    <div class="analytics-trend ${trend}">
                        <span>${trendIcon}</span>
                        <span>${trendPercent !== 0 ? Math.abs(trendPercent) + '%' : 'same'}</span>
                    </div>
                </div>

                <div class="analytics-stats-section">
                    <div class="analytics-stats-title">Statistics</div>
                    <div class="analytics-detailed-grid">
                        <div class="analytics-detail-item">
                            <div class="analytics-detail-value">${activeActions}</div>
                            <div class="analytics-detail-label">Active Modes</div>
                        </div>
                        <div class="analytics-detail-item">
                            <div class="analytics-detail-value">${averagePerAction}</div>
                            <div class="analytics-detail-label">Avg per Mode</div>
                        </div>
                        <div class="analytics-detail-item">
                            <div class="analytics-detail-value">${modeLabels[mostUsedAction] || 'None'}</div>
                            <div class="analytics-detail-label">Most Used</div>
                        </div>
                        <div class="analytics-detail-item">
                            <div class="analytics-detail-value">${previousTotal}</div>
                            <div class="analytics-detail-label">${comparisonLabel}</div>
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="analytics-stats-section">
                    <div class="analytics-stats-title">Action Breakdown</div>
                    <div class="analytics-simple-grid">
                        ${cardsHtml}
                    </div>
                </div>

                <div style="display: flex; gap: 4px; justify-content: center; margin-top: 8px;">
                    <button class="analytics-back-simple" id="analytics-period-daily" data-period="daily" style="${period === 'daily' ? 'background: var(--accent-primary);' : ''}">Today</button>
                    <button class="analytics-back-simple" id="analytics-period-weekly" data-period="weekly" style="${period === 'weekly' ? 'background: var(--accent-primary);' : ''}">Week</button>
                    <button class="analytics-back-simple" id="analytics-period-monthly" data-period="monthly" style="${period === 'monthly' ? 'background: var(--accent-primary);' : ''}">Month</button>
                </div>
            </div>
        `;

        const body = document.getElementById('autoaction-panel-body');
        if (body) {
            body.innerHTML = analyticsHtml;

            // Add event listeners after DOM insertion
            setTimeout(() => {
                const backBtn = document.getElementById('analytics-back-btn');
                if (backBtn) backBtn.addEventListener('click', showMainView);

                const periodBtns = document.querySelectorAll('[id^="analytics-period-"]');
                periodBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const targetPeriod = e.target.dataset.period;
                        renderSimpleAnalytics(targetPeriod);
                    });
                });
            }, 10);
        }

        try { console.log('[analytics] renderSimpleAnalytics', { period, totalActions, cardsCount: Object.keys(currentData).length, trend, trendPercent }); } catch(_) {}
    }

    // Make function globally accessible
    window.renderSimpleAnalytics = renderSimpleAnalytics;

    try {
        window.__analyticsDebug = {
            show: ()=>{ try{ console.log('[analytics] debug: show()'); }catch(_){}; showAnalytics(); },
            main: ()=>{ try{ console.log('[analytics] debug: main()'); }catch(_){}; showMainView(); },
            render: (p='daily')=>{ try{ console.log('[analytics] debug: render()', p); }catch(_){}; renderSimpleAnalytics(p); },
            data: ()=>({ ...config.analytics })
        };
    } catch(_) {}


    function makeDraggable(element) {
        const header = element.querySelector('#autoaction-panel-header');
        if (!header) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startOffsetX = 0;
        let startOffsetY = 0;
        let baseLeft = 0;
        let baseTop = 0;
        let activePointerId = null;

        function getCurrentOffsets() {
            const tx = parseFloat(element.dataset.tx || '0') || 0;
            const ty = parseFloat(element.dataset.ty || '0') || 0;
            return { tx, ty };
        }

        function setOffsets(tx, ty) {
            element.dataset.tx = String(tx);
            element.dataset.ty = String(ty);
            element.style.transform = `translate(${tx}px, ${ty}px)`;
        }

        function onPointerDown(e) {
            if (e.target.closest('#autoaction-collapse-indicator') || e.target.closest('.status-container')) return;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            const { tx, ty } = getCurrentOffsets();
            baseLeft = rect.left - tx;
            baseTop = rect.top - ty;
            startOffsetX = tx;
            startOffsetY = ty;
            isDragging = true;
            element.classList.add('dragging');
            header.style.cursor = 'grabbing';
            header.setPointerCapture(activePointerId);
        }

        function onPointerMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const rect = element.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const margin = 8;
            const minL = margin - baseLeft;
            const maxL = (window.innerWidth - width - margin) - baseLeft;
            const minT = margin - baseTop;
            const maxT = (window.innerHeight - height - margin) - baseTop;

            let nextX = startOffsetX + dx;
            let nextY = startOffsetY + dy;
            if (nextX < minL) nextX = minL;
            if (nextX > maxL) nextX = maxL;
            if (nextY < minT) nextY = minT;
            if (nextY > maxT) nextY = maxT;

            setOffsets(nextX, nextY);
        }

        function onPointerUp() {
            if (!isDragging) return;
            isDragging = false;
            element.classList.remove('dragging');
            header.style.cursor = 'grab';
            if (activePointerId != null) header.releasePointerCapture(activePointerId);
            activePointerId = null;
        }

        header.addEventListener('pointerdown', onPointerDown);
        header.addEventListener('pointermove', onPointerMove);
        header.addEventListener('pointerup', onPointerUp);
        header.addEventListener('pointercancel', onPointerUp);
    }

    // --- INITIALIZATION ---
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', createControlPanel); } else { createControlPanel(); }
    document.addEventListener('keydown', (e) => {
	  if (e.key === '`') {
	    e.preventDefault();
	    toggleAction();
	  }
	});
})();
