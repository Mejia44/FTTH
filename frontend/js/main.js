console.log('main.js cargado');

document.addEventListener('DOMContentLoaded', () => {
  const selectArquitectura = document.getElementById('select-arquitectura');
  const subconfig = document.getElementById('subconfig');

  const renderOptions = (labelText, options) => {
    const container = document.createElement('div');
    const label = document.createElement('h3');
    label.textContent = labelText;
    const select = document.createElement('select');
    select.innerHTML = '<option value="" disabled selected>Selecciona...</option>' +
      options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    container.append(label, select);
    return container;
  };

  selectArquitectura && selectArquitectura.addEventListener('change', event => {
    if (!subconfig) return;
    subconfig.innerHTML = '';
    const value = event.target.value;
    if (value === 'p2p') {
      const topo = renderOptions('Topología', [
        { value: 'estrella', label: 'Estrella' },
        { value: 'anillo', label: 'Anillo' },
        { value: 'malla', label: 'Malla' }
      ]);
      subconfig.appendChild(topo);
    } else if (value === 'p2mp') {
      const tech = renderOptions('Tecnología PON', [
        { value: 'gpon', label: 'GPON' },
        { value: 'epon', label: 'EPON' },
        { value: 'xgpon', label: 'XG-PON' },
        { value: '10gepon', label: '10G-EPON' }
      ]);
      subconfig.appendChild(tech);
    }
  });

  const btnObtener = document.getElementById('btn-obtener');
  const btnAnalizar = document.getElementById('btn-analizar');

  // Inicializar mapa
  const map = L.map('map').setView([-2.1709, -79.9224], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Buscador de ubicaciones
  const searchInput = document.getElementById('location-search');
  const btnSearch = document.getElementById('btn-search');
  const searchResults = document.getElementById('search-results');
  let searchTimeout = null;

  async function searchLocation(query) {
    if (!query || query.trim().length < 3) return;

    searchResults.innerHTML = '<div class="search-loading">Buscando...</div>';
    searchResults.classList.remove('hidden');

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'es-ES,es' } }
      );

      if (!response.ok) throw new Error('Error en la búsqueda');

      const results = await response.json();

      if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-no-results">No se encontraron resultados</div>';
        return;
      }

      displaySearchResults(results);
    } catch (error) {
      console.error('Error buscando ubicación:', error);
      searchResults.innerHTML = '<div class="search-error">Error al buscar. Intenta nuevamente.</div>';
    }
  }

  function displaySearchResults(results) {
    searchResults.innerHTML = results.map(result => {
      const name = result.display_name.split(',')[0];
      const address = result.display_name;
      
      return `
        <div class="search-result-item" data-lat="${result.lat}" data-lon="${result.lon}">
          <svg class="search-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <div class="search-result-content">
            <div class="search-result-name">${name}</div>
            <div class="search-result-address">${address}</div>
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        
        map.setView([lat, lon], 15);
        L.marker([lat, lon]).addTo(map).bindPopup('Ubicación seleccionada').openPopup();
        
        searchInput.value = '';
        searchResults.classList.add('hidden');
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      
      if (query.length < 3) {
        searchResults.classList.add('hidden');
        return;
      }
      
      searchTimeout = setTimeout(() => searchLocation(query), 500);
    });

    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchTimeout);
        searchLocation(searchInput.value);
      }
    });
  }

  if (btnSearch) {
    btnSearch.addEventListener('click', () => searchLocation(searchInput.value));
  }

  document.addEventListener('click', (e) => {
    if (searchResults && 
        !searchResults.contains(e.target) && 
        !searchInput.contains(e.target) &&
        !btnSearch.contains(e.target)) {
      searchResults.classList.add('hidden');
    }
  });

  // Leaflet.draw
  const drawnItems = new L.FeatureGroup().addTo(map);
  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: { polyline: true, polygon: false, marker: false, circle: false, rectangle: false }
  });
  map.addControl(drawControl);

  let ultimaRutaGeoJSON = null;
  let ultimoDataId = null;

  map.on(L.Draw.Event.CREATED, e => {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    ultimaRutaGeoJSON = e.layer.toGeoJSON();
    console.log('GeoJSON:', ultimaRutaGeoJSON);
    
    ultimoDataId = null;
    if (btnAnalizar) btnAnalizar.disabled = true;
    if (btnObtener) btnObtener.disabled = false;
  });

  // Contenedores de resultados
  const resultsContainer = document.querySelector('.rec-box-top');
  const detailedContainer = document.querySelector('.rec-box-bottom');

  function showAnalysisLoading(isLoading) {
    if (!btnAnalizar) return;
    btnAnalizar.textContent = isLoading ? 'Analizando con IA...' : 'Analizar Entorno';
    btnAnalizar.disabled = isLoading;
  }

  // ==========================================
// FUNCIONES DE LOADER Y SKELETON
// ==========================================

/**
 * Mostrar skeleton loading en las secciones de recomendaciones
 */
function showLoadingSkeleton() {
  const resultsContainer = document.querySelector('.rec-box-top');
  const detailedContainer = document.querySelector('.rec-box-bottom');
  
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div class="skeleton-content loading-state">
        <div class="skeleton-title"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    resultsContainer.classList.add('skeleton-top');
  }
  
  if (detailedContainer) {
    detailedContainer.innerHTML = `
      <div class="skeleton-content loading-state">
        <div class="skeleton-title"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
      </div>
    `;
    detailedContainer.classList.add('skeleton-bottom');
  }
}

/**
 * Remover clases de skeleton loading
 */
function removeLoadingSkeleton() {
  const resultsContainer = document.querySelector('.rec-box-top');
  const detailedContainer = document.querySelector('.rec-box-bottom');
  
  if (resultsContainer) {
    resultsContainer.classList.remove('skeleton-top');
  }
  
  if (detailedContainer) {
    detailedContainer.classList.remove('skeleton-bottom');
  }
}

/**
 * Scroll suave hacia las recomendaciones con highlight
 */
function scrollToRecommendations() {
  const recommendationSection = document.querySelector('.recommendation-wrapper');
  
  if (recommendationSection) {
    // Scroll suave
    recommendationSection.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    
    // Añadir highlight temporal
    recommendationSection.classList.add('highlight');
    setTimeout(() => {
      recommendationSection.classList.remove('highlight');
    }, 1500);
  }
}

/**
 * Mostrar estado de carga en el botón
 */
function showAnalysisLoading(isLoading) {
  if (!btnAnalizar) return;
  
  if (isLoading) {
    btnAnalizar.innerHTML = '<span class="btn-loader"></span>Analizando con IA...';
    btnAnalizar.classList.add('loading');
    btnAnalizar.disabled = true;
  } else {
    btnAnalizar.innerHTML = 'Analizar Entorno';
    btnAnalizar.classList.remove('loading');
    btnAnalizar.disabled = false;
  }
}

/**
 * Mostrar resultados del análisis con animación
 */
function displayResults(analysisData) {
  // Remover skeleton loading
  removeLoadingSkeleton();
  
  const { route_analysis, ai_recommendations, configuration } = analysisData;
  const resultsContainer = document.querySelector('.rec-box-top');
  const detailedContainer = document.querySelector('.rec-box-bottom');
  
  if (!analysisData.success) {
    if (resultsContainer) {
      resultsContainer.innerHTML = `
        <div class="loading-state">
          <p style="color: #ff6b6b;"><strong>⚠️ Error:</strong> ${analysisData.error || 'Error desconocido'}</p>
          <p>${analysisData.fallback_recommendations || 'No se pudieron generar recomendaciones.'}</p>
        </div>
      `;
    }
    return;
  }
  
  // Contenedor superior - Resumen
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div class="loading-state">
        <p style="font-weight: 600; margin-bottom: 0.75rem;">
          ✅ Análisis con IA completado exitosamente
        </p>
        <div style="margin-top: 0.5rem; display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: 0.95rem;">
          <span style="display: flex; align-items: center; gap: 0.35rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <strong>Longitud:</strong> ${route_analysis.length_km} km
          </span>
          <span style="display: flex; align-items: center; gap: 0.35rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <strong>Zona:</strong> ${route_analysis.zone_type}
          </span>
          <span style="display: flex; align-items: center; gap: 0.35rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            <strong>Modelo:</strong> ${analysisData.model_used || 'Cohere'}
          </span>
        </div>
      </div>
    `;
  }

  // Contenedor inferior - Recomendaciones detalladas
  if (detailedContainer) {
    const formattedRecommendations = ai_recommendations
      .split('\n')
      .map(line => {
        line = line.trim();
        if (!line) return '<br>';
        
        // Títulos principales (### 1. TITULO)
        if (line.match(/^###\s+\d+\.\s+[A-Z\s]+$/)) {
          return `<h3 style="color: #2563eb; margin: 1.5rem 0 0.75rem 0; font-size: 1.15rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.35rem;">${line.replace(/^###\s+/, '')}</h3>`;
        }
        
        // Subtítulos (#### Subtitulo)
        if (line.match(/^####\s+[A-Z]/)) {
          return `<h4 style="color: #4a5568; margin: 0.75rem 0 0.35rem 0; font-size: 1rem; font-weight: 600;">${line.replace(/^####\s+/, '')}</h4>`;
        }
        
        // Items de lista (-)
        if (line.startsWith('- ')) {
          return `<li style="margin-left: 1.5rem; margin-bottom: 0.35rem; line-height: 1.5;">${line.substring(2)}</li>`;
        }
        
        // Tablas (detectar líneas de tabla)
        if (line.includes('|')) {
          const cells = line.split('|').filter(cell => cell.trim());
          if (cells.length > 0) {
            const isHeader = line.includes('---');
            if (isHeader) return '';
            
            const cellsHtml = cells.map(cell => 
              `<td style="padding: 0.5rem; border: 1px solid #e5e7eb;">${cell.trim()}</td>`
            ).join('');
            
            return `<tr>${cellsHtml}</tr>`;
          }
        }
        
        // Texto en negrita (**texto**)
        line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Párrafos normales
        return `<p style="margin-bottom: 0.5rem; line-height: 1.6;">${line}</p>`;
      })
      .join('');

    detailedContainer.innerHTML = `
      <div class="loading-state">
        <div style="margin-bottom: 1.25rem;">
          <h3 style="color: #2563eb; margin-bottom: 0.75rem; font-size: 1.2rem;">
            🤖 Recomendaciones Generadas por IA
          </h3>
          <div style="background: rgba(37, 99, 235, 0.06); padding: 0.85rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid #2563eb;">
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.5;">
              <strong>Configuración analizada:</strong><br>
              ${configuration.arquitectura_label || 'N/A'} • 
              ${configuration.subconfig_label || 'N/A'} • 
              ${configuration.enfoque_label || 'N/A'} • 
              ${configuration.split || 'N/A'} • 
              ${configuration.estudio_factibilidad || 'N/A'} clientes
            </p>
          </div>
        </div>
        <div class="ai-content">
          ${formattedRecommendations}
        </div>
      </div>
    `;
  }
}

// ==========================================
// EVENT HANDLER: ANALIZAR ENTORNO
// ==========================================

if (btnAnalizar) {
  btnAnalizar.addEventListener('click', async () => {
    if (!ultimoDataId) {
      alert('Primero debes obtener los datos de la ruta (botón "Obtener Datos").');
      return;
    }

    // 1. Mostrar loader en el botón
    showAnalysisLoading(true);
    
    // 2. Mostrar skeleton loading en las secciones
    showLoadingSkeleton();
    
    // 3. Scroll hacia las recomendaciones
    setTimeout(() => scrollToRecommendations(), 300);

    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_id: ultimoDataId })
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const analysisData = await response.json();
      console.log('Análisis con IA completado:', analysisData);
      
      // 4. Pequeño delay para que se vea el skeleton (opcional, mejora UX)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 5. Mostrar resultados
      displayResults(analysisData);

    } catch (error) {
      console.error('Error en análisis:', error);
      
      removeLoadingSkeleton();
      
      const resultsContainer = document.querySelector('.rec-box-top');
      if (resultsContainer) {
        resultsContainer.innerHTML = `
          <div class="loading-state">
            <p style="color: #ff6b6b;"><strong>⚠️ Error:</strong> ${error.message}</p>
            <p style="margin-top: 0.5rem; font-size: 0.9rem;">
              Verifica tu conexión o intenta nuevamente.
            </p>
          </div>
        `;
      }
    } finally {
      // 6. Remover loader del botón
      showAnalysisLoading(false);
    }
  });
}

  // Formulario
  const inputFactibilidad = document.getElementById('input-factibilidad');
  const selectSplit = document.getElementById('select-split');
  const selectEnfoque = document.getElementById('select-enfoque');
  const selectArquitecturaEl = document.getElementById('select-arquitectura');
  const subconfigContainer = document.getElementById('subconfig');
  const btnGuardar = document.getElementById('btn-guardar');
  const saveStatus = document.getElementById('save-status');

  const getSelected = (selectEl) => {
    if (!selectEl) return { value: null, label: null };
    const value = selectEl.value || null;
    const idx = selectEl.selectedIndex;
    const label = (idx >= 0 && selectEl.options[idx]) ? selectEl.options[idx].text : null;
    return { value, label };
  };

  if (btnGuardar) {
    btnGuardar.addEventListener('click', async (ev) => {
      ev.preventDefault();

      if (!inputFactibilidad) {
        if (saveStatus) saveStatus.textContent = 'Campo no encontrado.';
        return;
      }

      const factValue = inputFactibilidad.value;
      if (factValue === '' || isNaN(Number(factValue)) || Number(factValue) < 0) {
        if (saveStatus) {
          saveStatus.textContent = 'Ingresa un número válido.';
          saveStatus.style.color = '#ff6b6b';
        }
        inputFactibilidad.focus();
        return;
      }

      const payload = {
        estudio_factibilidad: Number(factValue),
        split: getSelected(selectSplit).value,
        split_label: getSelected(selectSplit).label,
        enfoque: getSelected(selectEnfoque).value,
        enfoque_label: getSelected(selectEnfoque).label,
        arquitectura: getSelected(selectArquitecturaEl).value,
        arquitectura_label: getSelected(selectArquitecturaEl).label,
        subconfig: getSelected(subconfigContainer?.querySelector('select')).value,
        subconfig_label: getSelected(subconfigContainer?.querySelector('select')).label
      };

      try {
        const res = await fetch('/api/config/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);

        if (saveStatus) {
          saveStatus.textContent = 'Guardado ✓';
          saveStatus.style.color = '#2ea44f';
        }
        btnGuardar.textContent = 'Guardado ✓';
        setTimeout(() => btnGuardar.textContent = 'Guardar', 1400);
      } catch (err) {
        console.error('Error guardando:', err);
        if (saveStatus) {
          saveStatus.textContent = 'Error al guardar';
          saveStatus.style.color = '#ff6b6b';
        }
      }
    });
  }

  // Obtener Datos
  if (btnObtener) {
    btnObtener.addEventListener('click', async (ev) => {
      ev.preventDefault();
      btnObtener.disabled = true;

      if (!ultimaRutaGeoJSON) {
        alert('Dibuja primero la ruta en el mapa.');
        btnObtener.disabled = false;
        return;
      }

      const payload = {
        geojson: ultimaRutaGeoJSON,
        step_m: 20,
        meta: {
          estudio_factibilidad: inputFactibilidad ? Number(inputFactibilidad.value) || null : null,
          split: getSelected(selectSplit).value,
          split_label: getSelected(selectSplit).label,
          enfoque: getSelected(selectEnfoque).value,
          enfoque_label: getSelected(selectEnfoque).label,
          arquitectura: getSelected(selectArquitecturaEl).value,
          arquitectura_label: getSelected(selectArquitecturaEl).label,
          subconfig: getSelected(subconfigContainer?.querySelector('select')).value,
          subconfig_label: getSelected(subconfigContainer?.querySelector('select')).label
        }
      };

      if (saveStatus) {
        saveStatus.textContent = 'Obteniendo datos...';
        saveStatus.style.color = '#888';
      }

      try {
        const resp = await fetch('/api/data/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) throw new Error(`Status ${resp.status}`);

        const data = await resp.json();
        ultimoDataId = data.id;

        if (saveStatus) {
          saveStatus.textContent = 'Datos guardados ✓';
          saveStatus.style.color = '#2ea44f';
        }

        if (btnAnalizar) btnAnalizar.disabled = false;

      } catch (err) {
        console.error('Error obteniendo datos:', err);
        if (saveStatus) {
          saveStatus.textContent = 'Error al obtener datos';
          saveStatus.style.color = '#ff6b6b';
        }
      } finally {
        btnObtener.disabled = false;
      }
    });
  }

  // Navbar scroll effect
  const navbar = document.querySelector('.navbar');
  let lastScrollTop = 0;

  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    
    lastScrollTop = scrollTop;
  });

}); // end DOMContentLoaded
