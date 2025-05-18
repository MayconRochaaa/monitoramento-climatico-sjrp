// frontend/js/script.js

document.addEventListener('DOMContentLoaded', () => {
    // Elementos da DOM (sem alterações)
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

    const weatherForecastContainerEl = document.getElementById('weatherForecastContainer');
    const forecastDaysContainerEl = document.getElementById('forecastDays');
    const forecastErrorEl = document.getElementById('forecastError');

    let mapInstance = null; 
    let alertMarkersClusterGroup = null; 
    let datePicker = null; 
    let baseCityMarkers = {};
    
    const API_BASE_URL = 'http://localhost:3000/api';
    let allCitiesData = []; 
    let allAlertTypesData = []; 
    let currentDisplayedAlerts = []; 

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
                    const marker = L.marker(city.coords, { 
                        opacity: 0.7, 
                        title: city.name 
                    })
                        .addTo(mapInstance)
                        .on('click', function(e) { 
                            if (this.getPopup()) { this.unbindPopup(); }
                            this.bindPopup(createCityAlertsPopupContent(city.id, city.name)).openPopup();
                        });
                    baseCityMarkers[city.id] = marker; 
                }
            });
            
            alertMarkersClusterGroup = L.markerClusterGroup({
                spiderfyOnMaxZoom: false, // Não expande os marcadores no zoom máximo do cluster
                zoomToBoundsOnClick: false, // Não dá zoom ao clicar, para podermos abrir o popup
                disableClusteringAtZoom: 13 // Opcional: desativa o clustering a partir de um certo nível de zoom
            });

            alertMarkersClusterGroup.on('clusterclick', function (a) {
                // a.layer é o cluster que foi clicado
                const childMarkers = a.layer.getAllChildMarkers();
                if (childMarkers.length > 0) {
                    // Assume que todos os marcadores num cluster próximo são da mesma cidade
                    // (especialmente se as coordenadas dos alertas forem as mesmas da cidade)
                    const firstMarkerData = childMarkers[0].options.customData; // Pega os dados customizados
                    if (firstMarkerData && firstMarkerData.cityId) {
                        const popupContent = createCityAlertsPopupContent(firstMarkerData.cityId, firstMarkerData.cityName);
                        L.popup()
                            .setLatLng(a.layer.getLatLng()) // Posição do cluster
                            .setContent(popupContent)
                            .openOn(mapInstance);
                    } else {
                        // Fallback se não houver customData (improvável com a nova lógica)
                        // Ou se quiser um comportamento diferente para clusters mistos (mais complexo)
                        mapInstance.setView(a.layer.getLatLng(), mapInstance.getZoom() + 1); // Zoom simples
                    }
                }
                 // Impede o comportamento padrão de zoom do cluster se quisermos apenas o popup
                // a.originalEvent.preventDefault(); // Pode não ser necessário com zoomToBoundsOnClick: false
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
                const customIcon = L.divIcon({ 
                    html: iconHtml, className: 'custom-leaflet-alert-div-icon', 
                    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] 
                });

                // Adiciona dados customizados ao marcador para uso no evento clusterclick
                const marker = L.marker(alertData.coords, { 
                    icon: customIcon, 
                    title: `${alertData.city} - ${alertData.type}`,
                    customData: { // NOVO: Armazena dados relevantes no marcador
                        cityId: alertData.cityId,
                        cityName: alertData.city
                    }
                }).on('click', function(e) { 
                    // Para marcadores individuais (não clusterizados ou quando o cluster é desativado)
                    if (this.getPopup()) { this.unbindPopup(); }
                    this.bindPopup(createCityAlertsPopupContent(alertData.cityId, alertData.city)).openPopup();
                    L.DomEvent.stopPropagation(e); // Impede que o clique no marcador propague para o cluster se estiver sob um
                });
                alertMarkersClusterGroup.addLayer(marker); 
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
            } else if (endpoint.startsWith('weather/forecast') && forecastErrorEl) { 
                forecastDaysContainerEl.innerHTML = ''; 
                forecastErrorEl.textContent = 'Erro ao carregar previsão do tempo.';
                forecastErrorEl.classList.remove('hidden');
            }
            return []; 
        }
    }

    // --- Funções para Condições Atuais e Previsão (sem alterações) ---
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
                 await fetchAndDisplayWeatherData(selectedCityForWeather.id, selectedCityForWeather.name);
            }
        } else if (allCitiesData.length > 0) { 
            const defaultCityForWeather = allCitiesData.find(c => c.id === 'sjrp') || allCitiesData[0];
            if (defaultCityForWeather) {
                currentWeatherCitySelectEl.value = defaultCityForWeather.id; 
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
                if (selectedCity) {
                    fetchAndDisplayWeatherData(selectedCity.id, selectedCity.name); 
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
