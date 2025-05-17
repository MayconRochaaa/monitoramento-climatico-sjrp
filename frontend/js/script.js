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

    let mapInstance = null; 
    let alertMarkersLayerGroup = null;
    let datePicker = null; 
    let baseCityMarkers = {}; // NOVO: Para armazenar os marcadores base das cidades

    // --- Dados Mockados (sem alterações) ---
    const mockCities = [
        { id: 'sjrp', name: 'São José do Rio Preto', coords: [-20.8202, -49.3792] },
        { id: 'mirassol', name: 'Mirassol', coords: [-20.8194, -49.5192] },
        { id: 'catanduva', name: 'Catanduva', coords: [-21.1383, -48.9758] },
        { id: 'votuporanga', name: 'Votuporanga', coords: [-20.4233, -49.9758] },
        { id: 'fernandopolis', name: 'Fernandópolis', coords: [-20.2839, -50.2464] },
        { id: 'olimpia', name: 'Olímpia', coords: [-20.7369, -48.9147] },
        { id: 'barretos', name: 'Barretos', coords: [-20.5575, -48.5681] },
        { id: 'bebedouro', name: 'Bebedouro', coords: [-20.9486, -48.4792] },
    ];

    const mockAlertTypes = [
        { id: 'chuvas_fortes', name: 'Chuvas Fortes', icon: 'fas fa-cloud-showers-heavy', colorClass: 'alert-card-red' },
        { id: 'onda_calor', name: 'Onda de Calor', icon: 'fas fa-temperature-high', colorClass: 'alert-card-yellow' },
        { id: 'ventos_fortes', name: 'Ventos Fortes', icon: 'fas fa-wind', colorClass: 'alert-card-yellow' },
        { id: 'baixa_umidade', name: 'Baixa Umidade', icon: 'fas fa-tint-slash', colorClass: 'alert-card-blue' },
        { id: 'geada', name: 'Geada', icon: 'fas fa-snowflake', colorClass: 'alert-card-blue' },
    ];

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

    // --- Mock Alerts (sem alterações) ---
    const todayForMock = new Date();
    todayForMock.setHours(0,0,0,0); 
    const tomorrowForMock = new Date(todayForMock);
    tomorrowForMock.setDate(todayForMock.getDate() + 1);
    const yesterdayForMock = new Date(todayForMock);
    yesterdayForMock.setDate(todayForMock.getDate() - 1);
    const dayAfterTomorrowForMock = new Date(todayForMock);
    dayAfterTomorrowForMock.setDate(todayForMock.getDate() + 2);
    const mockAlerts = [ 
        { id: 1, city: 'São José do Rio Preto', cityId: 'sjrp', coords: [-20.8202, -49.3792], date: formatDate(todayForMock), type: 'Chuvas Fortes', typeId: 'chuvas_fortes', description: 'Risco de alagamentos em áreas de baixada.', severity: 'alta' },
        { id: 2, city: 'Olímpia', cityId: 'olimpia', coords: [-20.7369, -48.9147], date: formatDate(todayForMock), type: 'Onda de Calor', typeId: 'onda_calor', description: 'Temperaturas elevadas, hidrate-se.', severity: 'media' },
        { id: 3, city: 'Fernandópolis', cityId: 'fernandopolis', coords: [-20.2839, -50.2464], date: formatDate(tomorrowForMock), type: 'Baixa Umidade', typeId: 'baixa_umidade', description: 'Umidade relativa do ar abaixo de 30%.', severity: 'baixa' },
        { id: 4, city: 'Catanduva', cityId: 'catanduva', coords: [-21.1383, -48.9758], date: formatDate(yesterdayForMock), type: 'Ventos Fortes', typeId: 'ventos_fortes', description: 'Rajadas de vento podem causar transtornos.', severity: 'media' },
        { id: 5, city: 'São José do Rio Preto', cityId: 'sjrp', coords: [-20.8202, -49.3792], date: formatDate(tomorrowForMock), type: 'Onda de Calor', typeId: 'onda_calor', description: 'Previsão de temperaturas muito altas.', severity: 'alta' },
        { id: 6, city: 'Barretos', cityId: 'barretos', coords: [-20.5575, -48.5681], date: formatDate(dayAfterTomorrowForMock), type: 'Geada', typeId: 'geada', description: 'Possibilidade de geada nas primeiras horas da manhã.', severity: 'media' }
    ];

    // --- Funções do Mapa ---
    function initMap() {
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
            
            // Cria e armazena os marcadores base das cidades
            baseCityMarkers = {}; // Limpa/inicializa o objeto
            mockCities.forEach(city => {
                if(city.coords) {
                    const marker = L.marker(city.coords, {
                        opacity: 0.7, // Opacidade inicial padrão
                        title: city.name,
                        // Z-index para tentar manter abaixo dos marcadores de alerta (pode não ser sempre efetivo com divIcon)
                        // zIndexOffset: -100 
                    })
                        .addTo(mapInstance)
                        .bindPopup(city.name);
                    baseCityMarkers[city.id] = marker; // Armazena o marcador
                }
            });

            mapInstance.whenReady(() => {
                setTimeout(() => { mapInstance.invalidateSize(); }, 100);
            });
        }
    }
    
    function updateBaseCityMarkersOpacity(selectedCityIds = []) {
        const defaultOpacity = 0.7;
        const lowOpacity = 0.2;

        mockCities.forEach(city => {
            const marker = baseCityMarkers[city.id];
            if (marker) {
                if (selectedCityIds.length === 0) { // Nenhuma cidade selecionada no filtro (mostrar todas)
                    marker.setOpacity(defaultOpacity);
                } else {
                    if (selectedCityIds.includes(city.id)) {
                        marker.setOpacity(defaultOpacity); // Cidade está selecionada
                    } else {
                        marker.setOpacity(lowOpacity); // Cidade não está selecionada
                    }
                }
            }
        });
    }

    function updateMapAlerts(alertsToDisplay) {
        if (!mapInstance) return;
        if (!alertMarkersLayerGroup) {
            alertMarkersLayerGroup = L.layerGroup().addTo(mapInstance);
        }
        alertMarkersLayerGroup.clearLayers(); // Limpa apenas os marcadores de ALERTA

        // Os marcadores base das cidades são gerenciados por updateBaseCityMarkersOpacity

        alertsToDisplay.forEach(alertData => {
            if (alertData.coords) {
                const alertTypeInfo = mockAlertTypes.find(type => type.id === alertData.typeId) || {};
                let markerColor = 'blue'; 
                if (alertTypeInfo.colorClass === 'alert-card-red') markerColor = '#ef4444';
                else if (alertTypeInfo.colorClass === 'alert-card-yellow') markerColor = '#f59e0b';
                else if (alertTypeInfo.colorClass === 'alert-card-blue') markerColor = '#3b82f6';
                
                // Ícone para marcadores de alerta (mais proeminente)
                const iconHtml = `<i class="${alertTypeInfo.icon || 'fas fa-map-marker-alt'}" style="color: ${markerColor}; font-size: 28px; -webkit-text-stroke: 1.5px white; text-stroke: 1.5px white; text-shadow: 0 0 3px rgba(0,0,0,0.5);"></i>`;
                const customIcon = L.divIcon({ 
                    html: iconHtml, 
                    className: 'custom-leaflet-alert-div-icon', // Classe específica para ícones de alerta
                    iconSize: [30, 30], // Tamanho um pouco maior
                    iconAnchor: [15, 30], 
                    popupAnchor: [0, -28] 
                });
                const marker = L.marker(alertData.coords, { 
                    icon: customIcon, 
                    title: `${alertData.city} - ${alertData.type}`,
                    // zIndexOffset: 1000 // Tenta garantir que fiquem sobre os marcadores base
                });
                marker.bindPopup(`<b>${alertData.city}</b><br>${alertData.type}<br>${alertData.date}`);
                alertMarkersLayerGroup.addLayer(marker);
            }
        });
    }

    // --- Funções para Filtros Acordeão e Checkboxes (sem alterações) ---
    function setupAccordion(headerElement, containerElement) {
        if (!headerElement || !containerElement) return;
        const icon = headerElement.querySelector('i.fas');
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
        if (items.length === 0) {
            containerElement.innerHTML = `<p class="text-xs text-gray-500">Nenhuma opção disponível.</p>`;
            return;
        }
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'flex items-center';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `${groupName}-${item.id}`;
            checkbox.name = groupName;
            checkbox.value = item.id;
            checkbox.className = 'h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500';
            const label = document.createElement('label');
            label.htmlFor = `${groupName}-${item.id}`;
            label.textContent = item.name;
            label.className = 'ml-2 block text-sm text-gray-900 cursor-pointer';
            div.appendChild(checkbox);
            div.appendChild(label);
            containerElement.appendChild(div);
        });
    }
    function getSelectedCheckboxValues(groupName) {
        const selectedValues = [];
        const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
        checkboxes.forEach(checkbox => {
            selectedValues.push(checkbox.value);
        });
        return selectedValues;
    }

    // --- Funções de Exibição de Alertas (sem alterações) ---
    function createAlertCard(alertData) {
        const alertTypeInfo = mockAlertTypes.find(type => type.id === alertData.typeId) || { icon: 'fas fa-info-circle', colorClass: 'alert-card-blue' };
        const card = document.createElement('div');
        card.className = `${alertTypeInfo.colorClass} p-3 rounded-md shadow`;
        card.innerHTML = `
            <div class="flex items-start">
                <i class="${alertTypeInfo.icon} text-xl mr-3 mt-1"></i>
                <div>
                    <h3 class="font-semibold text-sm">${alertData.city}</h3>
                    <p class="text-xs">Data: ${alertData.date}</p>
                    <p class="text-xs font-medium">${alertData.type}</p>
                    ${alertData.description ? `<p class="text-xs mt-1">${alertData.description}</p>` : ''}
                </div>
            </div>
        `;
        return card;
    }
    function displayAlerts(alertsToDisplay) {
        if (!alertsListContainer) return;
        alertsListContainer.innerHTML = ''; 
        if (alertsToDisplay.length === 0) {
            alertsListContainer.innerHTML = '<p class="text-sm text-gray-500">Nenhum alerta para exibir com os filtros atuais.</p>';
            updateMapAlerts([]); 
            return;
        }
        alertsToDisplay.forEach(alertData => {
            const alertCard = createAlertCard(alertData);
            alertsListContainer.appendChild(alertCard);
        });
        updateMapAlerts(alertsToDisplay); 
    }
    
    // --- Lógica de Filtragem Atualizada para Litepicker ---
    function handleApplyFilters() {
        let startDate = null;
        let endDate = null;

        if (datePicker && datePicker.getStartDate() && datePicker.getEndDate()) {
            startDate = datePicker.getStartDate().dateInstance; 
            endDate = datePicker.getEndDate().dateInstance;     
            endDate.setHours(23, 59, 59, 999);
        } else if (datePicker && datePicker.getStartDate()) { 
            startDate = datePicker.getStartDate().dateInstance;
            endDate = new Date(startDate); 
            endDate.setHours(23, 59, 59, 999);
        }
        
        const selectedCityIds = getSelectedCheckboxValues('cityFilter');
        const selectedAlertTypeIds = getSelectedCheckboxValues('alertTypeFilter');
        let filteredAlerts = [...mockAlerts]; 

        if (startDate) { 
            filteredAlerts = filteredAlerts.filter(alert => {
                const alertDate = parseDisplayDate(alert.date); 
                if (!alertDate) return false;
                if (!endDate || startDate.getTime() === endDate.getTime()) {
                     return alertDate.getTime() === startDate.getTime();
                }
                return alertDate >= startDate && alertDate <= endDate;
            });
        }
        
        if (selectedCityIds.length > 0) {
            filteredAlerts = filteredAlerts.filter(alert => selectedCityIds.includes(alert.cityId));
        }
        if (selectedAlertTypeIds.length > 0) {
            filteredAlerts = filteredAlerts.filter(alert => selectedAlertTypeIds.includes(alert.typeId));
        }

        updateBaseCityMarkersOpacity(selectedCityIds); // ATUALIZA OPACIDADE DOS MARCADORES BASE
        displayAlerts(filteredAlerts);
    }

    function resetAllFilters() {
        if (datePicker) {
            datePicker.clearSelection(); 
        }
        document.querySelectorAll(`input[name="cityFilter"]:checked`).forEach(cb => cb.checked = false);
        document.querySelectorAll(`input[name="alertTypeFilter"]:checked`).forEach(cb => cb.checked = false);
        
        updateBaseCityMarkersOpacity([]); // Reseta opacidade para mostrar todos os marcadores base
        handleApplyFilters(); // Aplica filtros (que estarão vazios, mostrando todos os alertas)
    }

    // --- Inicialização e Event Listeners ---
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
            singleMode: false, 
            allowRepick: true, 
            format: 'DD/MM/YYYY',
            separator: ' - ',
            numberOfMonths: 1, 
            lang: 'pt-BR', 
            buttonText: {
                previousMonth: `<i class="fas fa-chevron-left"></i>`,
                nextMonth: `<i class="fas fa-chevron-right"></i>`,
                reset: `<i class="fas fa-undo"></i>`, 
                apply: 'Aplicar',
                cancel: 'Cancelar'
            },
            tooltipText: { one: 'dia', other: 'dias' },
        });
    }
    
    setupAccordion(cityFilterHeader, cityFilterContainer);
    setupAccordion(alertTypeFilterHeader, alertTypeFilterContainer);

    populateCheckboxes(cityFilterContainer, mockCities, 'cityFilter');
    populateCheckboxes(alertTypeFilterContainer, mockAlertTypes, 'alertTypeFilter');

    initMap(); 
    handleApplyFilters(); // Chama para aplicar filtros iniciais e definir opacidade inicial dos marcadores base

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
});
