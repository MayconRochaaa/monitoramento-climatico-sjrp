// frontend/js/script.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuração da API Base URL ---
    let API_BASE_URL;
    const originalApplyFiltersBtnHTML = '<i class="fas fa-filter mr-2"></i> Aplicar Filtros';
    const originalSubscribeBtnHTML = '<i class="fas fa-envelope-open-text mr-2"></i> Subscrever Agora';

    // Verifica se o script está rodando em um ambiente de desenvolvimento local
    // Condições: hostname é localhost, 127.0.0.1, ou o protocolo é file:
    if (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'file:'
    ) {
        API_BASE_URL = 'http://localhost:3000/api';
    } else {
        // ATENÇÃO: Substitua pelo URL real do seu backend em produção
        API_BASE_URL = 'https://seu-backend-de-producao.com/api'; // Exemplo: substitua!
    }
    console.log('API Base URL configurada para:', API_BASE_URL);
    console.log('Hostname atual:', window.location.hostname);
    console.log('Protocolo atual:', window.location.protocol);


    // Elementos da DOM
    const menuBtn = document.getElementById('menuBtn');
    const filtersSidebar = document.getElementById('filtersSidebar');
    const currentYearEl = document.getElementById('currentYear');
    const dateRangeFilterInput = document.getElementById('dateRangeFilter');
    const cityFilterHeader = document.getElementById('cityFilterHeader');
    const cityFilterContainer = document.getElementById('cityFilterContainer');
    const alertTypeFilterHeader = document.getElementById('alertTypeFilterHeader');
    const alertTypeFilterContainer = document.getElementById('alertTypeFilterContainer');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const alertsListContainer = document.getElementById('alertsList');
    const alertsListLoadingEl = document.getElementById('alertsListLoading');
    const alertsListEmptyEl = document.getElementById('alertsListEmpty');
    const showAllAlertsLink = document.getElementById('showAllAlertsLink');
    const mapPlaceholder = document.getElementById('mapPlaceholder');

    const currentWeatherCard = document.getElementById('currentWeatherCard');
    const currentWeatherCitySelectEl = document.getElementById('currentWeatherCitySelect');
    const currentWeatherCityNameEl = document.getElementById('currentWeatherCityName');
    const weatherIconEl = document.getElementById('weatherIcon');
    const temperatureEl = document.getElementById('temperature');
    const weatherDescriptionEl = document.getElementById('weatherDescription');
    const feelsLikeEl = document.getElementById('feelsLike');
    const humidityEl = document.getElementById('humidity');
    const pressureEl = document.getElementById('pressure');
    const windSpeedEl = document.getElementById('windSpeed');
    const sunriseTimeEl = document.getElementById('sunriseTime');
    const sunsetTimeEl = document.getElementById('sunsetTime');
    const rainLastHourEl = document.getElementById('rainLastHour');
    const lastUpdatedTimeEl = document.getElementById('lastUpdatedTime');
    const currentWeatherDataEl = document.getElementById('currentWeatherData');
    const currentWeatherErrorEl = document.getElementById('currentWeatherError');
    const currentWeatherLoadingEl = document.getElementById('currentWeatherLoading');

    const weatherForecastSectionEl = document.getElementById('weatherForecastSection');
    const forecastDaysContainerEl = document.getElementById('forecastDays');
    const forecastErrorEl = document.getElementById('forecastError');
    const forecastLoadingEl = document.getElementById('forecastLoading');

    const openSubscriptionDrawerBtn = document.getElementById('openSubscriptionDrawerBtn');
    const subscriptionDrawerEl = document.getElementById('subscriptionDrawer');
    const drawerOverlayEl = document.getElementById('drawerOverlay');
    const closeSubscriptionDrawerBtn = document.getElementById('closeSubscriptionDrawerBtn');
    const subscriptionEmailInput = document.getElementById('subscriptionEmail');
    const subscriptionCityCheckboxesContainer = document.getElementById('subscriptionCityCheckboxes');
    const subscribeBtn = document.getElementById('subscribeBtn');
    const subscriptionFeedbackEl = document.getElementById('subscriptionFeedback');

    let mapInstance = null;
    let alertMarkersClusterGroup = null;
    let datePicker = null;
    let baseCityMarkers = {};

    let allCitiesData = []; // Inicializado como array vazio
    let allAlertTypesData = []; // Inicializado como array vazio
    let currentDisplayedAlerts = [];

    // --- Funções de Indicador de Carregamento ---
    function showButtonLoadingState(buttonElement, loadingText = 'Carregando...') {
        if (buttonElement) {
            buttonElement.disabled = true;
            buttonElement.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> ${loadingText}`;
        }
    }

    function resetButtonState(buttonElement, originalHTML) {
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.innerHTML = originalHTML;
        }
    }

    function showElementLoading(element, show = true) {
        if (element) {
            element.classList.toggle('hidden', !show);
        }
    }
    function showElementError(element, message, show = true) {
        if(element) {
            element.textContent = message;
            element.classList.toggle('hidden', !show);
        }
    }

    // --- Funções de Data ---
    const formatDate = (dateObject) => {
        if (!dateObject) return null;
        if (typeof dayjs === 'function' && dateObject instanceof dayjs) {
            return dateObject.format('DD/MM/YYYY');
        }
        const d = new Date(dateObject.getTime());
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };
    const parseDisplayDate = (dateString) => {
        if (!dateString) return null;
        const parts = dateString.split('/');
        if (parts.length === 3) {
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
        return null;
    };
    const formatDateForAPI = (dateObject) => {
        if (!dateObject) return null;
        const d = new Date(dateObject.getTime());
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // --- Funções do Mapa ---
    function createCityAlertsPopupContent(cityId, cityName) {
        const alertsForCity = currentDisplayedAlerts.filter(alert => alert.cityId === cityId);
        if (alertsForCity.length === 0) {
            return `<b>${cityName}</b><br>Nenhum alerta ativo com os filtros atuais.`;
        }
        let content = `<div style="max-height: 150px; overflow-y: auto; padding-right: 5px;"><b class="text-base">${cityName}</b><hr class="my-1">`;
        content += '<ul class="list-none p-0 m-0">';
        alertsForCity.sort((a, b) => parseDisplayDate(a.date) - parseDisplayDate(b.date));
        alertsForCity.forEach(alert => {
            const alertTypeInfo = allAlertTypesData.find(type => type.id === alert.typeId) || {}; // Usa allAlertTypesData
            content += `<li class="mb-1.5 text-xs">
                            <strong style="color: ${alertTypeInfo.colorClass === 'alert-card-red' ? '#ef4444' : (alertTypeInfo.colorClass === 'alert-card-yellow' ? '#f59e0b' : '#3b82f6')};">${alert.type}</strong> (${alert.date})<br>
                            <span class="text-gray-600">${alert.description || 'Sem descrição detalhada.'}</span>
                        </li>`;
        });
        content += '</ul></div>';
        return content;
    }
    function initMap(citiesToMark = []) { // citiesToMark pode ser vazio se allCitiesData falhar
        if (mapPlaceholder && !mapInstance) {
            if (mapPlaceholder.clientHeight === 0) { mapPlaceholder.style.height = '400px'; }
            mapPlaceholder.textContent = '';
            mapPlaceholder.classList.remove('flex', 'items-center', 'justify-center');
            const mesoregiaoSJRPCenter = [-20.5000, -49.7000];
            mapInstance = L.map(mapPlaceholder).setView(mesoregiaoSJRPCenter, 8);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                maxZoom: 18,
            }).addTo(mapInstance);
            baseCityMarkers = {};
            citiesToMark.forEach(city => {
                if(city.coords) {
                    const marker = L.marker(city.coords, { opacity: 0.7, title: city.name })
                        .addTo(mapInstance)
                        .on('click', function(e) {
                            if (this.getPopup()) { this.unbindPopup(); }
                            this.bindPopup(createCityAlertsPopupContent(city.id, city.name)).openPopup();
                        });
                    baseCityMarkers[city.id] = marker;
                }
            });
            alertMarkersClusterGroup = L.markerClusterGroup({
                spiderfyOnMaxZoom: false, zoomToBoundsOnClick: false, disableClusteringAtZoom: 13
            });
            alertMarkersClusterGroup.on('clusterclick', function (a) {
                const childMarkers = a.layer.getAllChildMarkers();
                if (childMarkers.length > 0) {
                    const firstMarkerData = childMarkers[0].options.customData;
                    if (firstMarkerData && firstMarkerData.cityId) {
                        const popupContent = createCityAlertsPopupContent(firstMarkerData.cityId, firstMarkerData.cityName);
                        L.popup().setLatLng(a.layer.getLatLng()).setContent(popupContent).openOn(mapInstance);
                    } else { mapInstance.setView(a.layer.getLatLng(), mapInstance.getZoom() + 1); }
                }
            });
            mapInstance.addLayer(alertMarkersClusterGroup);
            mapInstance.whenReady(() => { setTimeout(() => { mapInstance.invalidateSize(); }, 100); });
        }
    }
    function updateBaseCityMarkersOpacity(selectedCityIds = []) {
        if (!allCitiesData || allCitiesData.length === 0) return; // Proteção adicional
        const defaultOpacity = 0.7; const lowOpacity = 0.2;
        allCitiesData.forEach(city => {
            const marker = baseCityMarkers[city.id];
            if (marker) {
                if (selectedCityIds.length === 0) { marker.setOpacity(defaultOpacity); }
                else { marker.setOpacity(selectedCityIds.includes(city.id) ? defaultOpacity : lowOpacity); }
            }
        });
    }
    function updateMapAlerts(alertsToDisplay) {
        if (!mapInstance || !alertMarkersClusterGroup) return;
        alertMarkersClusterGroup.clearLayers();
        alertsToDisplay.forEach(alertData => {
            if (alertData.coords) {
                const alertTypeInfo = allAlertTypesData.find(type => type.id === alertData.typeId) || { icon: 'fas fa-info-circle', colorClass: 'alert-card-blue' }; // Usa allAlertTypesData
                let markerColor = 'blue';
                if (alertTypeInfo.colorClass === 'alert-card-red') markerColor = '#ef4444';
                else if (alertTypeInfo.colorClass === 'alert-card-yellow') markerColor = '#f59e0b';
                else if (alertTypeInfo.colorClass === 'alert-card-blue') markerColor = '#3b82f6';
                const iconHtml = `<i class="${alertTypeInfo.icon || 'fas fa-map-marker-alt'}" style="color: ${markerColor}; font-size: 28px; -webkit-text-stroke: 1.5px white; text-stroke: 1.5px white; text-shadow: 0 0 3px rgba(0,0,0,0.5);"></i>`;
                const customIcon = L.divIcon({ html: iconHtml, className: 'custom-leaflet-alert-div-icon', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
                const marker = L.marker(alertData.coords, {
                    icon: customIcon, title: `${alertData.city} - ${alertData.type}`,
                    customData: { cityId: alertData.cityId, cityName: alertData.city }
                }).on('click', function(e) {
                    if (this.getPopup()) { this.unbindPopup(); }
                    this.bindPopup(createCityAlertsPopupContent(alertData.cityId, alertData.city)).openPopup();
                    L.DomEvent.stopPropagation(e);
                });
                alertMarkersClusterGroup.addLayer(marker);
            }
        });
    }

    // --- Funções para Filtros Acordeão e Checkboxes ---
    function setupAccordion(headerElement, containerElement) {
        if (!headerElement || !containerElement) return;
        const icon = headerElement.querySelector('i.fas.accordion-icon');
        headerElement.addEventListener('click', () => {
            const isHidden = containerElement.classList.contains('hidden');
            containerElement.classList.toggle('hidden', !isHidden);
            if (icon) {
                icon.classList.toggle('fa-chevron-down', isHidden);
                icon.classList.toggle('fa-chevron-up', !isHidden);
            }
        });
    }
    function populateCheckboxes(containerElement, items, groupName, isSubscription = false) {
        if (!containerElement) {
            console.error(`Contêiner para ${groupName} (subscrição: ${isSubscription}) não encontrado.`);
            return;
        }
        containerElement.innerHTML = ''; // Limpa o placeholder de carregamento ou mensagens antigas
        if (!items || items.length === 0) {
            containerElement.innerHTML = `<p class="text-xs text-gray-500 p-2">Nenhuma opção disponível.</p>`;
            return;
        }
        items.forEach(item => {
            const div = document.createElement('div'); div.className = 'flex items-center';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
            const currentGroupName = isSubscription ? `sub-${groupName}` : groupName;
            checkbox.id = `${currentGroupName}-${item.id}`;
            checkbox.name = currentGroupName;
            checkbox.value = item.id;
            checkbox.className = 'h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500';
            const label = document.createElement('label'); label.htmlFor = `${currentGroupName}-${item.id}`; label.textContent = item.name; label.className = 'ml-2 block text-sm text-gray-900 cursor-pointer';
            div.appendChild(checkbox); div.appendChild(label); containerElement.appendChild(div);
        });
    }
    function getSelectedCheckboxValues(groupName) {
        const selectedValues = [];
        const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
        checkboxes.forEach(checkbox => { selectedValues.push(checkbox.value); });
        return selectedValues;
    }

    // --- Funções de Exibição de Alertas ---
    function createAlertCard(alertData) {
        const alertTypeInfo = allAlertTypesData.find(type => type.id === alertData.typeId) || { icon: 'fas fa-info-circle', colorClass: 'alert-card-blue' }; // Usa allAlertTypesData
        const card = document.createElement('div'); card.className = `${alertTypeInfo.colorClass} p-3 rounded-md shadow`;
        card.innerHTML = `<div class="flex items-start"><i class="${alertTypeInfo.icon} text-xl mr-3 mt-1"></i><div><h3 class="font-semibold text-sm">${alertData.city}</h3><p class="text-xs">Data: ${alertData.date}</p><p class="text-xs font-medium">${alertData.type}</p>${alertData.description ? `<p class="text-xs mt-1">${alertData.description}</p>` : ''}</div></div>`;
        return card;
    }
    function displayAlerts(alertsToDisplay) {
        currentDisplayedAlerts = alertsToDisplay;
        if (!alertsListContainer || !alertsListEmptyEl) return;
        alertsListContainer.innerHTML = '';
        showElementLoading(alertsListLoadingEl, false);

        if (alertsToDisplay.length === 0) {
            alertsListEmptyEl.classList.remove('hidden');
            alertsListEmptyEl.textContent = 'Nenhum alerta para exibir com os filtros atuais.';
            updateMapAlerts([]); return;
        }
        alertsListEmptyEl.classList.add('hidden');
        alertsToDisplay.forEach(alertData => {
            const alertCard = createAlertCard(alertData);
            alertsListContainer.appendChild(alertCard);
        });
        updateMapAlerts(alertsToDisplay);
    }

    // --- Lógica de Filtragem ---
    async function handleApplyFilters() {
        showButtonLoadingState(applyFiltersBtn, 'Aplicando...');
        showElementLoading(alertsListLoadingEl, true);
        alertsListContainer.innerHTML = '';
        alertsListEmptyEl.classList.add('hidden');

        let startDateAPI = null; let endDateAPI = null;
        if (datePicker && datePicker.getStartDate()) {
            startDateAPI = formatDateForAPI(datePicker.getStartDate().dateInstance);
            if (datePicker.getEndDate()) { endDateAPI = formatDateForAPI(datePicker.getEndDate().dateInstance); }
            else { endDateAPI = startDateAPI; }
        }
        const selectedCityIds = getSelectedCheckboxValues('cityFilter');
        const selectedAlertTypeIds = getSelectedCheckboxValues('alertTypeFilter');
        const queryParams = new URLSearchParams();
        if (startDateAPI) queryParams.append('startDate', startDateAPI);
        if (endDateAPI) queryParams.append('endDate', endDateAPI);
        if (selectedCityIds.length > 0) queryParams.append('cityIds', selectedCityIds.join(','));
        if (selectedAlertTypeIds.length > 0) queryParams.append('alertTypeIds', selectedAlertTypeIds.join(','));
        const queryString = queryParams.toString();

        try {
            const fetchedAlerts = await fetchData(`alertas${queryString ? '?' + queryString : ''}`);
            if (fetchedAlerts.error) {
                displayAlerts([]);
                alertsListEmptyEl.textContent = `Erro ao carregar alertas: ${fetchedAlerts.error}. Tente novamente.`;
                alertsListEmptyEl.classList.remove('hidden');
            } else {
                displayAlerts(fetchedAlerts);
            }
        } catch (error) {
            console.error("Erro crítico ao aplicar filtros:", error);
            displayAlerts([]);
            alertsListEmptyEl.textContent = 'Ocorreu um erro inesperado ao buscar alertas. Tente mais tarde.';
            alertsListEmptyEl.classList.remove('hidden');
        } finally {
            resetButtonState(applyFiltersBtn, originalApplyFiltersBtnHTML);
            showElementLoading(alertsListLoadingEl, false);
        }
        updateBaseCityMarkersOpacity(selectedCityIds);
    }
    function resetAllFilters() {
        if (datePicker) { datePicker.clearSelection(); }
        document.querySelectorAll(`input[name="cityFilter"]:checked`).forEach(cb => cb.checked = false);
        document.querySelectorAll(`input[name="alertTypeFilter"]:checked`).forEach(cb => cb.checked = false);
        updateBaseCityMarkersOpacity([]);
        handleApplyFilters();
    }

    // --- Função para buscar dados da API ---
    async function fetchData(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}`, options);
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: `Erro HTTP: ${response.status}. Resposta não é JSON.` };
                }
                return { error: errorData.error || `Serviço indisponível (HTTP ${response.status})`, success: false };
            }
            if (response.status === 201 && response.headers.get("content-length") === "0") {
                 return { success: true, message: 'Operação bem-sucedida.'};
            }
            if (response.status === 204) {
                 return { success: true, message: 'Operação bem-sucedida (sem conteúdo).'};
            }
            return await response.json();
        } catch (error) { // Captura erros de rede (ex: servidor offline, DNS) ou CORS.
            console.error(`Falha de rede ou CORS ao processar ${API_BASE_URL}/${endpoint}:`, error.message);
            return { error: 'Falha na comunicação com o servidor. Verifique sua conexão ou as configurações de CORS no servidor.', success: false };
        }
    }

    // --- Funções para Condições Atuais e Previsão ---
    function updateCurrentWeatherUI(weatherData, cityName) {
        if (!currentWeatherCard) return;
        showElementLoading(currentWeatherLoadingEl, false);
        showElementError(currentWeatherErrorEl, '', false);
        currentWeatherDataEl.classList.add('hidden');

        if (!weatherData || Object.keys(weatherData).length === 0 || weatherData.error) {
            const errorMessage = weatherData && weatherData.error ? weatherData.error : `Não foi possível carregar dados para ${cityName || 'a cidade selecionada'}.`;
            showElementError(currentWeatherErrorEl, errorMessage, true);
            currentWeatherCityNameEl.textContent = cityName || '--';
            return;
        }

        currentWeatherDataEl.classList.remove('hidden');
        currentWeatherCityNameEl.textContent = cityName || weatherData.cityId;
        weatherIconEl.src = `https://openweathermap.org/img/wn/${weatherData.icon}@2x.png`;
        weatherIconEl.alt = weatherData.description;
        temperatureEl.textContent = Math.round(weatherData.temperature);
        weatherDescriptionEl.textContent = weatherData.description;
        feelsLikeEl.textContent = Math.round(weatherData.feelsLike);
        humidityEl.textContent = weatherData.humidity;
        pressureEl.textContent = weatherData.pressure;
        windSpeedEl.textContent = weatherData.windSpeed;
        sunriseTimeEl.textContent = weatherData.sunrise;
        sunsetTimeEl.textContent = weatherData.sunset;
        rainLastHourEl.textContent = weatherData.rain_1h || 0;
        lastUpdatedTimeEl.textContent = new Date(weatherData.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function updateForecastUI(forecastResult) {
        if (!forecastDaysContainerEl || !forecastErrorEl) return;
        showElementLoading(forecastLoadingEl, false);
        showElementError(forecastErrorEl, '', false);
        forecastDaysContainerEl.innerHTML = '';

        if (!forecastResult || !forecastResult.forecast || forecastResult.forecast.length === 0 || forecastResult.error) {
            const errorMessage = forecastResult && forecastResult.error ? forecastResult.error : 'Previsão não disponível para esta cidade.';
            showElementError(forecastErrorEl, errorMessage, true);
            return;
        }

        forecastResult.forecast.forEach(day => {
            const dayCard = document.createElement('div');
            dayCard.className = 'forecast-day-card p-2 rounded-lg shadow flex flex-col items-center justify-between';
            dayCard.innerHTML = `<p class="font-semibold text-gray-700 text-xs">${day.displayDate}</p><img src="https://openweathermap.org/img/wn/${day.icon}.png" alt="${day.description}" class="w-10 h-10 mx-auto my-0.5"><div class="text-center"><p class="text-sm">Max: <span class="font-medium text-red-500">${Math.round(day.maxTemp)}</span>°C</p><p class="text-sm">Min: <span class="font-medium text-blue-500">${Math.round(day.minTemp)}</span>°C</p></div><p class="capitalize text-gray-500 text-[10px] mt-1 leading-tight">${day.description}</p>`;
            forecastDaysContainerEl.appendChild(dayCard);
        });
    }

    async function fetchAndDisplayWeatherData(cityId, cityName) {
        if (!cityId) {
            updateCurrentWeatherUI({ error: "Cidade inválida selecionada." }, cityName || "Cidade Inválida");
            updateForecastUI({ error: "Nenhuma cidade selecionada para previsão." });
            return;
        }

        showElementLoading(currentWeatherLoadingEl, true);
        currentWeatherDataEl.classList.add('hidden');
        showElementError(currentWeatherErrorEl, '', false);

        showElementLoading(forecastLoadingEl, true);
        forecastDaysContainerEl.innerHTML = '';
        showElementError(forecastErrorEl, '', false);

        const [currentWeather, forecastWeather] = await Promise.all([
            fetchData(`weather/current/${cityId}`),
            fetchData(`weather/forecast/${cityId}`)
        ]);

        updateCurrentWeatherUI(currentWeather, cityName);
        updateForecastUI(forecastWeather);
    }

    function populateWeatherCitySelect(cities) { // cities é allCitiesData
        if (!currentWeatherCitySelectEl) return;
        currentWeatherCitySelectEl.innerHTML = ''; // Limpa opções antigas
        if (!cities || cities.length === 0) {
             // Se não houver cidades (ex: erro ao carregar), pode-se adicionar uma opção desabilitada
            const option = document.createElement('option');
            option.textContent = 'Nenhuma cidade';
            option.disabled = true;
            currentWeatherCitySelectEl.appendChild(option);
            return;
        }

        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.id;
            option.textContent = city.name;
            currentWeatherCitySelectEl.appendChild(option);
        });
        const defaultCityId = 'sjrp';
        if (cities.some(c => c.id === defaultCityId)) {
            currentWeatherCitySelectEl.value = defaultCityId;
        } else if (cities.length > 0) {
            currentWeatherCitySelectEl.value = cities[0].id;
        }
    }

    // --- Funções para Gaveta de Subscrição ---
    function openSubscriptionDrawer() {
        if (subscriptionDrawerEl && drawerOverlayEl) {
            subscriptionDrawerEl.classList.add('open');
            drawerOverlayEl.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }
    function closeSubscriptionDrawer() {
        if (subscriptionDrawerEl && drawerOverlayEl) {
            subscriptionDrawerEl.classList.remove('open');
            drawerOverlayEl.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    // --- Funções para Subscrição ---
    function displaySubscriptionFeedback(message, isSuccess) {
        if (!subscriptionFeedbackEl) return;
        subscriptionFeedbackEl.textContent = message;
        subscriptionFeedbackEl.classList.remove('hidden', 'subscription-success', 'subscription-error');
        if (isSuccess) {
            subscriptionFeedbackEl.classList.add('subscription-success');
        } else {
            subscriptionFeedbackEl.classList.add('subscription-error');
        }
        setTimeout(() => {
            subscriptionFeedbackEl.classList.add('hidden');
        }, 5000);
    }
    async function handleSubscription(event) {
        event.preventDefault();
        if (!subscriptionEmailInput || !subscribeBtn) return;

        const email = subscriptionEmailInput.value.trim();
        const selectedCityIds = getSelectedCheckboxValues('sub-cityFilter');

        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            displaySubscriptionFeedback('Por favor, insira um e-mail válido.', false);
            return;
        }
        if (selectedCityIds.length === 0) {
            displaySubscriptionFeedback('Por favor, selecione pelo menos uma cidade para subscrever.', false);
            return;
        }

        showButtonLoadingState(subscribeBtn, 'Subscrevendo...');
        subscriptionFeedbackEl.classList.add('hidden');

        const subscriptionData = { email: email, cityIds: selectedCityIds };

        const result = await fetchData('subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(subscriptionData),
        });

        resetButtonState(subscribeBtn, originalSubscribeBtnHTML);

        if (result && result.success && result.message) {
            displaySubscriptionFeedback(result.message, true);
            subscriptionEmailInput.value = '';
            document.querySelectorAll('input[name="sub-cityFilter"]:checked').forEach(cb => cb.checked = false);
        } else if (result && result.error) {
            displaySubscriptionFeedback(`Erro: ${result.error}`, false);
        } else {
            displaySubscriptionFeedback('Ocorreu um erro desconhecido ao processar a subscrição.', false);
        }
    }

    // --- Inicialização e Event Listeners ---
    async function initializeApp() {
        if (menuBtn && filtersSidebar) {
            menuBtn.addEventListener('click', () => {
                filtersSidebar.classList.toggle('hidden');
                filtersSidebar.classList.toggle('block');
                setTimeout(() => { if (mapInstance) { mapInstance.invalidateSize(); } }, 300);
            });
        }
        if (currentYearEl) { currentYearEl.textContent = new Date().getFullYear(); }
        if (dateRangeFilterInput) {
            datePicker = new Litepicker({
                element: dateRangeFilterInput, singleMode: false, allowRepick: true, format: 'DD/MM/YYYY',
                separator: ' - ', numberOfMonths: 1, lang: 'pt-BR',
                buttonText: { previousMonth: `<i class="fas fa-chevron-left"></i>`, nextMonth: `<i class="fas fa-chevron-right"></i>`, reset: `<i class="fas fa-undo"></i>`, apply: 'Aplicar', cancel: 'Cancelar' },
                tooltipText: { one: 'dia', other: 'dias' },
            });
        }
        setupAccordion(cityFilterHeader, cityFilterContainer);
        setupAccordion(alertTypeFilterHeader, alertTypeFilterContainer);

        // Busca inicial de cidades e tipos de alerta
        const [citiesResponse, alertTypesResponse] = await Promise.all([
            fetchData('cidades'),
            fetchData('tipos-alerta')
        ]);

        // Processa resposta de cidades
        if (citiesResponse && !citiesResponse.error) {
            allCitiesData = citiesResponse; // Atribui os dados de cidades
            populateCheckboxes(cityFilterContainer, allCitiesData, 'cityFilter');
        } else {
            console.error("Erro ao carregar cidades:", citiesResponse ? citiesResponse.error : "Resposta indefinida ao buscar cidades.");
            if(cityFilterContainer) cityFilterContainer.innerHTML = `<p class="text-xs text-red-500 p-2">Erro ao carregar cidades. Verifique a conexão ou tente mais tarde.</p>`;
            // allCitiesData permanece []
        }

        // Processa resposta de tipos de alerta
        if (alertTypesResponse && !alertTypesResponse.error) {
            allAlertTypesData = alertTypesResponse; // Atribui os dados de tipos de alerta
            populateCheckboxes(alertTypeFilterContainer, allAlertTypesData, 'alertTypeFilter');
        } else {
            console.error("Erro ao carregar tipos de alerta:", alertTypesResponse ? alertTypesResponse.error : "Resposta indefinida ao buscar tipos de alerta.");
            if(alertTypeFilterContainer) alertTypeFilterContainer.innerHTML = `<p class="text-xs text-red-500 p-2">Erro ao carregar tipos de alerta. Verifique a conexão ou tente mais tarde.</p>`;
            // allAlertTypesData permanece []
        }

        // Popula selects e checkboxes que dependem de allCitiesData, APÓS a tentativa de carregamento
        populateWeatherCitySelect(allCitiesData); // Passa allCitiesData (pode estar vazio se falhou)
        if (subscriptionCityCheckboxesContainer) {
            if (allCitiesData.length > 0) {
                populateCheckboxes(subscriptionCityCheckboxesContainer, allCitiesData, 'cityFilter', true);
            } else {
                // Se não carregou cidades, mostra mensagem no container de subscrição
                subscriptionCityCheckboxesContainer.innerHTML = `<p class="text-xs text-gray-500 p-2">Nenhuma cidade disponível para subscrição.</p>`;
                if (citiesResponse && citiesResponse.error) { // Se houve erro específico
                    subscriptionCityCheckboxesContainer.innerHTML = `<p class="text-xs text-red-500 p-2">Erro ao carregar cidades para subscrição.</p>`;
                }
            }
        }

        initMap(allCitiesData); // Inicializa o mapa (pode estar vazio se allCitiesData for [])
        await handleApplyFilters(); // Busca alertas iniciais

        // Tenta carregar dados meteorológicos para a cidade padrão/selecionada
        if (currentWeatherCitySelectEl && currentWeatherCitySelectEl.value && allCitiesData.length > 0) {
            const selectedCityForWeather = allCitiesData.find(c => c.id === currentWeatherCitySelectEl.value);
            if (selectedCityForWeather) {
                 await fetchAndDisplayWeatherData(selectedCityForWeather.id, selectedCityForWeather.name);
            } else if (allCitiesData.length > 0) { // Se a cidade padrão não foi encontrada mas há cidades
                currentWeatherCitySelectEl.value = allCitiesData[0].id; // Seleciona a primeira
                await fetchAndDisplayWeatherData(allCitiesData[0].id, allCitiesData[0].name);
            }
        } else if (allCitiesData.length > 0) { // Se o select não tinha valor mas há cidades
             const defaultCityForWeather = allCitiesData.find(c => c.id === 'sjrp') || allCitiesData[0];
             if(currentWeatherCitySelectEl) currentWeatherCitySelectEl.value = defaultCityForWeather.id;
             await fetchAndDisplayWeatherData(defaultCityForWeather.id, defaultCityForWeather.name);
        } else { // Nenhuma cidade carregada
            updateCurrentWeatherUI({error: "Nenhuma cidade disponível para consulta."}, "N/D");
            updateForecastUI({error: "Nenhuma cidade disponível para previsão."});
        }


        if (currentWeatherCitySelectEl) {
            currentWeatherCitySelectEl.addEventListener('change', (event) => {
                const selectedCityId = event.target.value;
                // Verifica se allCitiesData tem itens antes de usar find
                const selectedCity = allCitiesData && allCitiesData.length > 0 ? allCitiesData.find(c => c.id === selectedCityId) : null;
                if (selectedCity) { fetchAndDisplayWeatherData(selectedCity.id, selectedCity.name); }
            });
        }
        if (applyFiltersBtn) { applyFiltersBtn.addEventListener('click', handleApplyFilters); }
        if (clearFiltersBtn) { clearFiltersBtn.addEventListener('click', resetAllFilters); }
        if (showAllAlertsLink) {
            showAllAlertsLink.addEventListener('click', (event) => { event.preventDefault(); resetAllFilters(); });
        }
        if (subscribeBtn) { subscribeBtn.addEventListener('click', handleSubscription); }
        if (openSubscriptionDrawerBtn) { openSubscriptionDrawerBtn.addEventListener('click', openSubscriptionDrawer); }
        if (closeSubscriptionDrawerBtn) { closeSubscriptionDrawerBtn.addEventListener('click', closeSubscriptionDrawer); }
        if (drawerOverlayEl) { drawerOverlayEl.addEventListener('click', closeSubscriptionDrawer); }
    }

    initializeApp();
});
