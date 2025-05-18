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

    // NOVOS Elementos para Previsão do Tempo
    const weatherForecastContainerEl = document.getElementById('weatherForecastContainer');
    const forecastDaysContainerEl = document.getElementById('forecastDays');
    const forecastErrorEl = document.getElementById('forecastError');

    let mapInstance = null; 
    let alertMarkersLayerGroup = null;
    let datePicker = null; 
    let baseCityMarkers = {};
    
    const API_BASE_URL = 'http://localhost:3000/api';
    let allCitiesData = []; 
    let allAlertTypesData = []; 
    
    // --- Funções de Data (sem alterações) ---
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

    // --- Funções do Mapa (sem alterações) ---
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
                        .bindPopup(city.name);
                    baseCityMarkers[city.id] = marker; 
                }
            });
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
        if (!mapInstance) return;
        if (!alertMarkersLayerGroup) { alertMarkersLayerGroup = L.layerGroup().addTo(mapInstance); }
        alertMarkersLayerGroup.clearLayers(); 
        alertsToDisplay.forEach(alertData => {
            if (alertData.coords) {
                const alertTypeInfo = allAlertTypesData.find(type => type.id === alertData.typeId) || { icon: 'fas fa-info-circle', colorClass: 'alert-card-blue' }; 
                let markerColor = 'blue'; 
                if (alertTypeInfo.colorClass === 'alert-card-red') markerColor = '#ef4444';
                else if (alertTypeInfo.colorClass === 'alert-card-yellow') markerColor = '#f59e0b';
                else if (alertTypeInfo.colorClass === 'alert-card-blue') markerColor = '#3b82f6';
                const iconHtml = `<i class="${alertTypeInfo.icon || 'fas fa-map-marker-alt'}" style="color: ${markerColor}; font-size: 28px; -webkit-text-stroke: 1.5px white; text-stroke: 1.5px white; text-shadow: 0 0 3px rgba(0,0,0,0.5);"></i>`;
                const customIcon = L.divIcon({ html: iconHtml, className: 'custom-leaflet-alert-div-icon', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
                const marker = L.marker(alertData.coords, { icon: customIcon, title: `${alertData.city} - ${alertData.type}` });
                marker.bindPopup(`<b>${alertData.city}</b><br>${alertData.type}<br>${alertData.date}`);
                alertMarkersLayerGroup.addLayer(marker);
            }
        });
    }

    // --- Funções para Filtros Acordeão e Checkboxes (sem alterações) ---
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
    function populateCheckboxes(containerElement, items, groupName) {
        if (!containerElement) return;
        containerElement.innerHTML = ''; 
        if (!items || items.length === 0) { 
            containerElement.innerHTML = `<p class="text-xs text-gray-500">Nenhuma opção disponível.</p>`;
            return;
        }
        items.forEach(item => {
            const div = document.createElement('div'); div.className = 'flex items-center';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = `${groupName}-${item.id}`; checkbox.name = groupName; checkbox.value = item.id; checkbox.className = 'h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500';
            const label = document.createElement('label'); label.htmlFor = `${groupName}-${item.id}`; label.textContent = item.name; label.className = 'ml-2 block text-sm text-gray-900 cursor-pointer';
            div.appendChild(checkbox); div.appendChild(label); containerElement.appendChild(div);
        });
    }
    function getSelectedCheckboxValues(groupName) {
        const selectedValues = [];
        const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
        checkboxes.forEach(checkbox => { selectedValues.push(checkbox.value); });
        return selectedValues;
    }

    // --- Funções de Exibição de Alertas (sem alterações) ---
    function createAlertCard(alertData) {
        const alertTypeInfo = allAlertTypesData.find(type => type.id === alertData.typeId) || { icon: 'fas fa-info-circle', colorClass: 'alert-card-blue' }; 
        const card = document.createElement('div'); card.className = `${alertTypeInfo.colorClass} p-3 rounded-md shadow`;
        card.innerHTML = `<div class="flex items-start"><i class="${alertTypeInfo.icon} text-xl mr-3 mt-1"></i><div><h3 class="font-semibold text-sm">${alertData.city}</h3><p class="text-xs">Data: ${alertData.date}</p><p class="text-xs font-medium">${alertData.type}</p>${alertData.description ? `<p class="text-xs mt-1">${alertData.description}</p>` : ''}</div></div>`;
        return card;
    }
    function displayAlerts(alertsToDisplay) {
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
    
    // --- Lógica de Filtragem (sem alterações) ---
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
        updateBaseCityMarkersOpacity(selectedCityIds); 
        displayAlerts(fetchedAlerts); 
    }
    function resetAllFilters() {
        if (datePicker) { datePicker.clearSelection(); }
        document.querySelectorAll(`input[name="cityFilter"]:checked`).forEach(cb => cb.checked = false);
        document.querySelectorAll(`input[name="alertTypeFilter"]:checked`).forEach(cb => cb.checked = false);
        updateBaseCityMarkersOpacity([]); 
        handleApplyFilters(); 
    }

    // --- Função para buscar dados da API (sem alterações) ---
    async function fetchData(endpoint) {
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}`);
            if (!response.ok) { throw new Error(`Erro HTTP: ${response.status} ao buscar ${endpoint}`); }
            return await response.json();
        } catch (error) {
            console.error(`Falha ao buscar dados de ${endpoint}:`, error);
            if (endpoint.startsWith('alertas')) alertsListContainer.innerHTML = '<p class="text-xs text-red-500">Erro ao carregar alertas.</p>';
            else if (endpoint === 'cidades' && cityFilterContainer) cityFilterContainer.innerHTML = '<p class="text-xs text-red-500">Erro ao carregar cidades.</p>';
            else if (endpoint === 'tipos-alerta' && alertTypeFilterContainer) alertTypeFilterContainer.innerHTML = '<p class="text-xs text-red-500">Erro ao carregar tipos.</p>';
            else if (endpoint.startsWith('weather/current') && currentWeatherErrorEl) {
                currentWeatherDataEl.classList.add('hidden');
                currentWeatherErrorEl.classList.remove('hidden');
                currentWeatherErrorEl.textContent = 'Erro ao carregar dados meteorológicos.';
            } else if (endpoint.startsWith('weather/forecast') && forecastErrorEl) { // NOVO: Erro para previsão
                forecastDaysContainerEl.innerHTML = ''; // Limpa cards antigos
                forecastErrorEl.textContent = 'Erro ao carregar previsão do tempo.';
                forecastErrorEl.classList.remove('hidden');
            }
            return []; 
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

    // NOVO: Função para atualizar a UI da Previsão
    function updateForecastUI(forecastResult) {
        if (!forecastDaysContainerEl || !forecastErrorEl) return;

        forecastDaysContainerEl.innerHTML = ''; // Limpa cards de previsão antigos
        forecastErrorEl.classList.add('hidden'); // Esconde mensagem de erro por padrão

        if (!forecastResult || !forecastResult.forecast || forecastResult.forecast.length === 0) {
            forecastErrorEl.textContent = 'Previsão não disponível para esta cidade.';
            forecastErrorEl.classList.remove('hidden');
            return;
        }

        forecastResult.forecast.forEach(day => {
            const dayCard = document.createElement('div');
            dayCard.className = 'forecast-day-card p-2 rounded-lg shadow flex flex-col items-center justify-between'; // Adicionado flex para alinhar
            
            dayCard.innerHTML = `
                <p class="font-semibold text-gray-700 text-xs">${day.displayDate}</p>
                <img src="https://openweathermap.org/img/wn/${day.icon}.png" alt="${day.description}" class="w-10 h-10 mx-auto my-0.5">
                <div class="text-center">
                    <p class="text-sm">Max: <span class="font-medium text-red-500">${Math.round(day.maxTemp)}</span>°C</p>
                    <p class="text-sm">Min: <span class="font-medium text-blue-500">${Math.round(day.minTemp)}</span>°C</p>
                </div>
                <p class="capitalize text-gray-500 text-[10px] mt-1 leading-tight">${day.description}</p>
            `;
            forecastDaysContainerEl.appendChild(dayCard);
        });
    }


    async function fetchAndDisplayWeatherData(cityId, cityName) { // Renomeada e combinada
        if (!cityId) {
            console.warn("[Weather] ID da cidade não fornecido para buscar o tempo.");
            updateCurrentWeatherUI({}, cityName || "Cidade Inválida");
            updateForecastUI(null); // Limpa a previsão também
            return;
        }
        console.log(`[Weather] Buscando tempo atual e previsão para ${cityId} (${cityName})`);
        
        // Mostra placeholders ou loading state (opcional)
        updateCurrentWeatherUI({ cityId: cityName }, cityName); // Mostra nome da cidade enquanto carrega
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

    // --- Inicialização e Event Listeners ---
    async function initializeApp() {
        if (menuBtn && filtersSidebar) {
            menuBtn.addEventListener('click', () => {
                filtersSidebar.classList.toggle('hidden');
                filtersSidebar.classList.toggle('block');
                setTimeout(() => { if (mapInstance) { mapInstance.invalidateSize(); } }, 300); 
            });
        }

        if (currentYearEl) {
            currentYearEl.textContent = new Date().getFullYear();
        }
        
        if (dateRangeFilterInput) {
            datePicker = new Litepicker({
                element: dateRangeFilterInput,
                singleMode: false, allowRepick: true, format: 'DD/MM/YYYY', separator: ' - ', numberOfMonths: 1, lang: 'pt-BR', 
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

        initMap(allCitiesData); 
        await handleApplyFilters(); 

        if (currentWeatherCitySelectEl.value) {
            const selectedCityForWeather = allCitiesData.find(c => c.id === currentWeatherCitySelectEl.value);
            if (selectedCityForWeather) {
                 await fetchAndDisplayWeatherData(selectedCityForWeather.id, selectedCityForWeather.name); // Nome da função alterado
            }
        } else if (allCitiesData.length > 0) { 
            const defaultCityForWeather = allCitiesData.find(c => c.id === 'sjrp') || allCitiesData[0];
            if (defaultCityForWeather) {
                currentWeatherCitySelectEl.value = defaultCityForWeather.id; 
                await fetchAndDisplayWeatherData(defaultCityForWeather.id, defaultCityForWeather.name); // Nome da função alterado
            }
        } else {
            updateCurrentWeatherUI({}, "Nenhuma cidade");
            updateForecastUI(null); // Limpa previsão se não houver cidades
        }

        if (currentWeatherCitySelectEl) {
            currentWeatherCitySelectEl.addEventListener('change', (event) => {
                const selectedCityId = event.target.value;
                const selectedCity = allCitiesData.find(c => c.id === selectedCityId);
                if (selectedCity) {
                    fetchAndDisplayWeatherData(selectedCity.id, selectedCity.name); // Nome da função alterado
                }
            });
        }

        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', handleApplyFilters);
        }
        if (clearFiltersBtn) { 
            clearFiltersBtn.addEventListener('click', resetAllFilters);
        }
        if (showAllAlertsLink) { 
            showAllAlertsLink.addEventListener('click', (event) => {
                event.preventDefault(); 
                resetAllFilters();
            });
        }
    }

    initializeApp(); 
});
