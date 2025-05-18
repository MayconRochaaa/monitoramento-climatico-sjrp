// frontend/js/script.js

document.addEventListener('DOMContentLoaded', () => {
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
    const showAllAlertsLink = document.getElementById('showAllAlertsLink');
    const mapPlaceholder = document.getElementById('mapPlaceholder'); 

    // Elementos do Card de Condições Atuais
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

    // Elementos para Previsão do Tempo
    const weatherForecastSectionEl = document.getElementById('weatherForecastSection'); 
    const forecastDaysContainerEl = document.getElementById('forecastDays');
    const forecastErrorEl = document.getElementById('forecastError');

    // Elementos para Subscrição e Gaveta
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
    
    const API_BASE_URL = 'http://localhost:3000/api';
    let allCitiesData = []; 
    let allAlertTypesData = []; 
    let currentDisplayedAlerts = []; 

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
            const alertTypeInfo = allAlertTypesData.find(type => type.id === alert.typeId) || {};
            content += `<li class="mb-1.5 text-xs">
                            <strong style="color: ${alertTypeInfo.colorClass === 'alert-card-red' ? '#ef4444' : (alertTypeInfo.colorClass === 'alert-card-yellow' ? '#f59e0b' : '#3b82f6')};">${alert.type}</strong> (${alert.date})<br>
                            <span class="text-gray-600">${alert.description || 'Sem descrição detalhada.'}</span>
                        </li>`;
        });
        content += '</ul></div>';
        return content;
    }
    function initMap(citiesToMark = []) { 
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
                const alertTypeInfo = allAlertTypesData.find(type => type.id === alertData.typeId) || { icon: 'fas fa-info-circle', colorClass: 'alert-card-blue' }; 
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
        containerElement.innerHTML = ''; 
        if (!items || items.length === 0) { 
            containerElement.innerHTML = `<p class="text-xs text-gray-500">Nenhuma opção disponível.</p>`;
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
        const alertTypeInfo = allAlertTypesData.find(type => type.id === alertData.typeId) || { icon: 'fas fa-info-circle', colorClass: 'alert-card-blue' }; 
        const card = document.createElement('div'); card.className = `${alertTypeInfo.colorClass} p-3 rounded-md shadow`;
        card.innerHTML = `<div class="flex items-start"><i class="${alertTypeInfo.icon} text-xl mr-3 mt-1"></i><div><h3 class="font-semibold text-sm">${alertData.city}</h3><p class="text-xs">Data: ${alertData.date}</p><p class="text-xs font-medium">${alertData.type}</p>${alertData.description ? `<p class="text-xs mt-1">${alertData.description}</p>` : ''}</div></div>`;
        return card;
    }
    function displayAlerts(alertsToDisplay) { 
        currentDisplayedAlerts = alertsToDisplay; 
        if (!alertsListContainer) return;
        alertsListContainer.innerHTML = ''; 
        if (alertsToDisplay.length === 0) {
            alertsListContainer.innerHTML = '<p class="text-sm text-gray-500">Nenhum alerta para exibir com os filtros atuais.</p>';
            updateMapAlerts([]); return;
        }
        alertsToDisplay.forEach(alertData => {
            const alertCard = createAlertCard(alertData);
            alertsListContainer.appendChild(alertCard);
        });
        updateMapAlerts(alertsToDisplay); 
    }
    
    // --- Lógica de Filtragem ---
    async function handleApplyFilters() { 
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
        const fetchedAlerts = await fetchData(`alertas${queryString ? '?' + queryString : ''}`);
        displayAlerts(fetchedAlerts); 
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
                const errorData = await response.json().catch(() => ({ error: `Erro HTTP: ${response.status}` }));
                throw new Error(errorData.error || `Erro HTTP: ${response.status} ao processar ${endpoint}`);
            }
            if (response.status === 201 && response.headers.get("content-length") === "0") {
                 return { success: true, message: 'Operação bem-sucedida.'};
            }
            if (response.status === 204) {
                 return { success: true, message: 'Operação bem-sucedida (sem conteúdo).'};
            }
            return await response.json();
        } catch (error) {
            console.error(`Falha ao processar ${endpoint}:`, error.message); 
            if (endpoint.startsWith('alertas') && alertsListContainer) alertsListContainer.innerHTML = `<p class="text-xs text-red-500">${error.message}</p>`;
            else if (endpoint === 'cidades' && cityFilterContainer) cityFilterContainer.innerHTML = `<p class="text-xs text-red-500">${error.message}</p>`;
            else if (endpoint === 'tipos-alerta' && alertTypeFilterContainer) alertTypeFilterContainer.innerHTML = `<p class="text-xs text-red-500">${error.message}</p>`;
            else if (endpoint.startsWith('weather/current') && currentWeatherErrorEl) {
                currentWeatherDataEl.classList.add('hidden');
                currentWeatherErrorEl.classList.remove('hidden');
                currentWeatherErrorEl.textContent = error.message;
            } else if (endpoint.startsWith('weather/forecast') && forecastErrorEl) { 
                if(forecastDaysContainerEl) forecastDaysContainerEl.innerHTML = ''; 
                if(forecastErrorEl) {
                    forecastErrorEl.textContent = error.message;
                    forecastErrorEl.classList.remove('hidden');
                }
            } else if (endpoint === 'subscribe' && subscriptionFeedbackEl) {
                // Erro já tratado no handleSubscription, mas pode adicionar um fallback aqui se necessário
            }
            return { error: error.message, success: false }; 
        }
    }

    // --- Funções para Condições Atuais e Previsão ---
    function updateCurrentWeatherUI(weatherData, cityName) {
        if (!currentWeatherCard) return;
        if (!weatherData || Object.keys(weatherData).length === 0) {
            currentWeatherDataEl.classList.add('hidden');
            currentWeatherErrorEl.textContent = `Não foi possível carregar dados para ${cityName || 'a cidade selecionada'}.`;
            currentWeatherErrorEl.classList.remove('hidden');
            currentWeatherCityNameEl.textContent = cityName || '--';
            return;
        }
        currentWeatherDataEl.classList.remove('hidden');
        currentWeatherErrorEl.classList.add('hidden');
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
        forecastDaysContainerEl.innerHTML = ''; 
        forecastErrorEl.classList.add('hidden'); 
        if (!forecastResult || !forecastResult.forecast || forecastResult.forecast.length === 0) {
            forecastErrorEl.textContent = 'Previsão não disponível para esta cidade.';
            forecastErrorEl.classList.remove('hidden');
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
            updateCurrentWeatherUI({}, cityName || "Cidade Inválida");
            updateForecastUI(null); 
            return;
        }
        updateCurrentWeatherUI({ cityId: cityName }, cityName); 
        if (forecastDaysContainerEl) forecastDaysContainerEl.innerHTML = '<p class="text-xs text-gray-500 col-span-full text-center">Carregando previsão...</p>';
        if (forecastErrorEl) forecastErrorEl.classList.add('hidden');
        const [currentWeather, forecastWeather] = await Promise.all([
            fetchData(`weather/current/${cityId}`),
            fetchData(`weather/forecast/${cityId}`)
        ]);
        updateCurrentWeatherUI(currentWeather, cityName);
        updateForecastUI(forecastWeather);
    }
    function populateWeatherCitySelect(cities) {
        if (!currentWeatherCitySelectEl || !cities || cities.length === 0) return;
        currentWeatherCitySelectEl.innerHTML = ''; 
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

        subscribeBtn.disabled = true;
        subscribeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> A subscrever...';
        subscriptionFeedbackEl.classList.add('hidden'); 

        const subscriptionData = { email: email, cityIds: selectedCityIds };

        const result = await fetchData('subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(subscriptionData),
        });

        subscribeBtn.disabled = false;
        subscribeBtn.innerHTML = '<i class="fas fa-envelope-open-text mr-2"></i> Subscrever Agora';

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

        const [cities, alertTypes] = await Promise.all([
            fetchData('cidades'),
            fetchData('tipos-alerta') 
        ]);
        allCitiesData = cities;
        allAlertTypesData = alertTypes; 

        populateCheckboxes(cityFilterContainer, allCitiesData, 'cityFilter');
        populateCheckboxes(alertTypeFilterContainer, allAlertTypesData, 'alertTypeFilter'); 
        populateWeatherCitySelect(allCitiesData); 
        if (subscriptionCityCheckboxesContainer) {
            populateCheckboxes(subscriptionCityCheckboxesContainer, allCitiesData, 'cityFilter', true); 
        }

        initMap(allCitiesData); 
        await handleApplyFilters(); 

        if (currentWeatherCitySelectEl && currentWeatherCitySelectEl.value) {
            const selectedCityForWeather = allCitiesData.find(c => c.id === currentWeatherCitySelectEl.value);
            if (selectedCityForWeather) {
                 await fetchAndDisplayWeatherData(selectedCityForWeather.id, selectedCityForWeather.name);
            }
        } else if (allCitiesData.length > 0) { 
            const defaultCityForWeather = allCitiesData.find(c => c.id === 'sjrp') || allCitiesData[0];
            if (defaultCityForWeather) {
                if(currentWeatherCitySelectEl) currentWeatherCitySelectEl.value = defaultCityForWeather.id; 
                await fetchAndDisplayWeatherData(defaultCityForWeather.id, defaultCityForWeather.name);
            }
        } else {
            updateCurrentWeatherUI({}, "Nenhuma cidade");
            updateForecastUI(null); 
        }

        if (currentWeatherCitySelectEl) {
            currentWeatherCitySelectEl.addEventListener('change', (event) => {
                const selectedCityId = event.target.value;
                const selectedCity = allCitiesData.find(c => c.id === selectedCityId);
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
