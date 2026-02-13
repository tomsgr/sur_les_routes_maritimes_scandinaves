document.addEventListener('DOMContentLoaded', () => {

  const map = L.map('map').setView([63.5, -20], 3);

  // Fond de carte Esri World Ocean Base (plus adapté pour les routes maritimes)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri',
    maxZoom: 13
  }).addTo(map);

  // Ajout de l'échelle (en km uniquement)
  L.control.scale({ imperial: false }).addTo(map);

  // Normalisation du texte
  function normalizeText(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  
  const placeMarkers = {}; // nom du lieu -> marker
  const allBounds = [];
  const travelerPoints = {}; // Stocke les points pour le replay
  let currentReplayTimeout = null;

  // --- Fonctions Helper pour charger les données ---

  // Charge les points (marqueurs) depuis un fichier JSON
  function loadPoints(url, layer, name = null) {
    fetch(url)
      .then(res => res.json())
      .then(data => {
        const points = [];
        data.forEach(p => {
          const marker = L.marker([p.lat, p.lon]).addTo(layer);
          const type = p.type || p.Type || ''; // Gestion de la casse des propriétés JSON
          marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${type}`);
          points.push({ ...p, marker: marker });
        });
        if (name) {
          travelerPoints[name] = points;
        }
      });
  }

  // Charge un trajet (GeoJSON) avec flèches directionnelles
  function loadRoute(url, layer, color, name, note = '', dashArray = '12 8', arrowColor = null) {
    fetch(url)
      .then(res => res.json())
      .then(data => {
        L.geoJSON(data, {
          style: { color: color, weight: 4, dashArray: dashArray }
        }).addTo(layer);

        data.features.forEach(feature => {
          // Conversion des coordonnées GeoJSON (Lon, Lat) vers Leaflet (Lat, Lon)
          const coords = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
          const polyline = L.polyline(coords);
          // Ajout des flèches via le decorator
          addDirectionalArrows(polyline, arrowColor || color, layer, name, note);
        });
      });
  }

  // Fonction pour déterminer la couleur selon le type de lieu
  function getTypeColor(type) {
    if (!type) return "#95a5a6"; // Gris par défaut
    const t = type.toLowerCase();
    if (t.includes('farm') || t.includes('settlement') || t.includes('bær')) return "#d35400"; // Orange (Habitations)
    if (t.includes('fjord') || t.includes('bay') || t.includes('river') || t.includes('lake') || t.includes('estuary')) return "#3498db"; // Bleu (Eau)
    if (t.includes('mountain') || t.includes('hill') || t.includes('cliff') || t.includes('ridge')) return "#7f8c8d"; // Gris foncé (Relief)
    if (t.includes('assembly') || t.includes('thing')) return "#8e44ad"; // Violet (Politique/Social)
    if (t.includes('island') || t.includes('peninsula')) return "#27ae60"; // Vert (Terres)
    if (t.includes('city') || t.includes('trading') || t.includes('harbour')) return "#c0392b"; // Rouge (Commerce/Villes)
    return "#95a5a6"; // Autres
  }

// --- Ajout des flèches dynamiques avec PolylineDecorator pour chaque trajet ---

function addDirectionalArrows(lineLayer, color, targetGroup, popupText, note) {
  const decorator = L.polylineDecorator(lineLayer, {
    patterns: [
      {
        offset: '5%',
        repeat: '10%',
        symbol: L.Symbol.arrowHead({
          pixelSize: 15,
          polygon: true,
          pathOptions: {
            color: color,
            fillOpacity: 1,
            weight: 1
          }
        })
      }
    ]
  });

  // Rendre toute la ligne visible et cliquable avec le popup
  const visibleLine = L.polyline(lineLayer.getLatLngs(), {
    weight: 7,
    opacity: 0 // Ligne invisible pour l'interaction (la couche GeoJSON gère l'affichage)
  }).addTo(targetGroup);
  visibleLine.bindPopup(`<strong>${popupText}</strong> <br>${note}`);

  decorator.addTo(targetGroup);
}

const travelerColors = {
  "Flóki": "green",
  "Naddodr": "rgb(65, 65, 156)",
  "Garðarr Svavarson": "rgb(240, 109, 109)",
  "Hjorleifr": "rgb(233, 233, 132)",
  "Ingólfur Arnarson": "orange",
  "Ørlyggr": "pink",
  "Kollr": "purple",
  "Óttarr (Ohthere)": "beige",
  "Wulfstan": "brown",
  "Hrut Herjólfsson": "black",
  "Gunnar Hamundarson": "grey",
};

// Panneau latéral rétractable fixe sur le côté droit
const panel = document.createElement('div');
panel.id = 'side-panel';
panel.innerHTML = `
  <div id="panel-content">
    <h2>Présentation</h2>
    <p>Sélectionnez un voyageur sur la carte pour visualiser son itinéraire. Cliquez sur le tracé d'un itinéraire pour afficher la date. Vous pouvez également consulter les fiches descriptives ici en cochant un itinéraire et rechercher un lieu avec la barre de recherche en bas à gauche de la carte. Une fois les cases de voyageurs cochées, vous pouvez déplacer les bornes chronologiques en bas de la légende pour afficher les trajets en fonction des dates. Les données sont disponibles sur le GitHub suivant: <a href="https://github.com/tomsgr/sur_les_routes_maritimes_scandinaves" target="_blank">lien du GitHub</a></p>  
    <ul id="traveler-list" style="padding-left: 1em; margin-top: 1em;"></ul>
    <div id="traveler-description" class="traveler-description"></div>
  </div>
`;
document.body.appendChild(panel);

const toggleButton = document.createElement('div');
toggleButton.id = 'toggle-panel';
toggleButton.innerText = '❮';
document.body.appendChild(toggleButton);

toggleButton.addEventListener('click', () => {
  panel.classList.toggle('open');
  const container = document.getElementById('map-container');
  if (container) container.classList.toggle('shifted');
  toggleButton.innerText = panel.classList.contains('open') ? '❯' : '❮';
});


// Permet d'afficher les descriptions de voyageurs dans le panel
function updateTravelerPanel(name, visible) {
  const list = document.getElementById('traveler-list');
  if (!list) return;

  let item = list.querySelector(`li[data-name="${name}"]`);
  
  if (visible && !item) {
    item = document.createElement('li');
    item.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:${travelerColors[name]};border-radius:50%;margin-right:6px;"></span>${name}`;
    item.dataset.name = name;

    // Rendre le nom cliquable pour zoomer et mettre en évidence dans la légende
    item.style.cursor = 'pointer';
    item.title = "Cliquer pour zoomer sur le trajet";
    item.addEventListener('click', () => {
      const handler = handlers.find(h => h.name === name);
      if (handler && handler.layer) {
        if (typeof handler.layer.getBounds === 'function' && handler.layer.getLayers().length > 0) {
          map.fitBounds(handler.layer.getBounds());
        }
        const cb = document.getElementById(handler.id);
        if (cb) {
          const legend = document.getElementById('legend-container');
          if (legend && legend.style.display === 'none') legend.style.display = 'block';
          cb.scrollIntoView({ behavior: "smooth", block: "center" });
          if (cb.parentElement) {
            const originalBg = cb.parentElement.style.backgroundColor;
            cb.parentElement.style.transition = "background-color 0.3s";
            cb.parentElement.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
            setTimeout(() => { cb.parentElement.style.backgroundColor = originalBg; }, 1000);
          }
        }
      }
    });

    list.appendChild(item);
  } else if (!visible && item) {
    list.removeChild(item);
  }

  // Mettre à jour toutes les descriptions affichées
  updateTravelerDescriptions();
}

function replayJourney(name) {
  const points = travelerPoints[name];
  if (!points || points.length === 0) {
    alert("Trajet non disponible pour le replay.");
    return;
  }

  // Annule tout replay en cours
  if (currentReplayTimeout) {
    clearTimeout(currentReplayTimeout);
    currentReplayTimeout = null;
  }
  map.closePopup();

  let index = 0;

  function step() {
    if (index >= points.length) return;

    const p = points[index];
    const latLng = [p.lat, p.lon];
    
    // Animation vers le point
    map.flyTo(latLng, 8, {
      duration: 2 // Durée du vol en secondes
    });

    map.once('moveend', () => {
      // Ouvre la popup si le marqueur est visible
      if (p.marker) p.marker.openPopup();

      currentReplayTimeout = setTimeout(() => {
        if (p.marker) p.marker.closePopup();
        index++;
        step();
      }, 3000); // Pause de 3 secondes
    });
  }
  
  step();
}

function updateTravelerDescriptions() {
  const list = document.getElementById('traveler-list');
  const descEl = document.getElementById('traveler-description');
  if (!list || !descEl) return;

  descEl.innerHTML = ''; // Vide le conteneur

  list.querySelectorAll('li').forEach(li => {
    const name = li.dataset.name;
    const desc = travelerDescriptions[name] || 'Description non disponible.';
    const color = travelerColors[name] || '#007bff';

    const container = document.createElement('div');
    container.style.cssText = `border-left: 4px solid ${color}; padding-left: 8px; margin-bottom: 12px;`;

    const header = document.createElement('div');
    header.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;";

    const title = document.createElement('strong');
    title.textContent = name;
    
    const btn = document.createElement('button');
    btn.textContent = "▶ Rejouer le voyage";
    btn.style.cssText = "font-size:11px; cursor:pointer; padding:2px 5px; border:1px solid #ccc; background:#fff; border-radius:3px;";
    btn.onclick = () => replayJourney(name);

    header.appendChild(title);
    header.appendChild(btn);
    container.appendChild(header);

    const body = document.createElement('div');
    body.innerHTML = desc;
    container.appendChild(body);

    descEl.appendChild(container);
  });
}
// Descriptions des voyageurs
const travelerDescriptions = {
  "Flóki": "Flóki Vilgerðarson part, selon le Livre de la colonisation de l'Islande (S5, H5), dans le but de trouver l'Islande et de s'y établir. Il effectue un premier arrêt dans les Hébrides où il pert sa fille Geirhildr qui se noie dans un lac. Il trouve l'île à l'aide de trois corbeaux qu'il emmène avec lui, ce qui lui vaut son surnom par la suite. Toutefois, ses compagnons et lui perdent leur bétail durant l'hiver, les conduisant à repartir deux ans après. Selon cette même source, Flóki est celui qui donne son nom à l'Islande (Pays-de-Glace) en apercevant un fjord rempli de glaces depuis une montagne. <br>Pour plus d'informations: <a href=https://fr.wikipedia.org/wiki/Fl%C3%B3ki_Vilger%C3%B0arson target='_blank'>cliquez ici</a>",
  "Naddodr": "Selon le Livre de la colonisation de l'Islande (S3), Naddodr est le premier Norvégien à atteindre l'Islande en déviant de sa trajectoire initiale qui devait le conduire aux Féroë. Voyant que le pays était inhabité, ses compagnons et lui repartirent vers les Féroë où ils louèrent la beauté de l'île nouvellement découverte.<br>Pour plus d'informations: <a href=https://fr.wikipedia.org/wiki/Naddoddr target='_blank'>cliquez ici</a>",
  "Garðarr Svavarson": "D'origine suédoise mais établi au Danemark, Garðarr part, selon le Livre de la colonisation de l'Islande (H3), réclamer le patrimoine de sa femme dans les Hébrides ou sur conseil de sa mère (S4). Il dévie de sa trajectoire et arrive finalement en Islande, près du cap Horn. Premier voyageur à faire le tour de l'Islande, il confirme que cette dernière est une île. Avant de repartir dans les Hébrides, Garðarr laisse un compagnon, un esclave et une serve.<br>Pour plus d'informations: <a href=https://fr.wikipedia.org/wiki/Gar%C3%B0ar_Svavarsson target='_blank'>cliquez ici</a>",
  "Hjorleifr": "Hjorleifr et Ingólfur, sont, selon le Livre de la colonisation de l'Islande (S6, H6), contraints de partir de la Norvège après avoir été expropriés suite à des conflits avec un jarl. Après un premier voyage commun vers l'Islande (vers 870), les deux frères jurés rentrent récupérer leurs biens en Norvège avant de s'installer sur l'île définitivement. Pendant que Ingólfur équipe les bateaux, Leifr prend part aux raids en Irlande et y acquiert de l'argent, dix esclaves et un glaive magique qui lui vaut son surnom de Hjörleifr (Leif au Glaive). Il rentre ensuite en Norvège en 873 et repart pour l'Islande en 874 avec Ingólfur. Toutefois Hjörleifr est assassiné par ses esclaves une fois l'Islande atteinte.<br>Pour plus d'informations: <a href=https://fr.wikipedia.org/wiki/Hj%C3%B6rleifr_Hr%C3%B3%C3%B0marsson target='_blank'>cliquez ici</a>",
  "Ingólfur Arnarson": "Hjorleifr et Ingólfur, sont, selon le Livre de la colonisation de l'Islande (S6, H6), contraints de partir de la Norvège après avoir été expropriés suite à des conflits avec un jarl. Après un premier voyage commun vers l'Islande (vers 870), les deux frères jurés rentrent récupérer leurs biens en Norvège avant de s'installer sur l'île définitivement. Pendant que Leifr prend part aux raids en Irlande, Ingólfur équipe les bateaux et réalise des sacrifices pour s'assurer un bon voyage. Toutefois Hjörleifr est assassiné par ses esclaves une fois l'Islande atteinte en 873. Ingólfur part alors venger son compagnon en tuant les esclaves irlandais réfugiés sur les îles Vestmann (nommées ainsi car Vestmann = homme de l'ouest = Irlandais) avant de s'établir définitivement à Reykjarvík vers 877.<br>Pour plus d'informations: <a href=https://fr.wikipedia.org/wiki/Ing%C3%B3lfr_Arnarson target='_blank'>cliquez ici</a>" ,
  "Ørlyggr": "Selon le Livre de la colonisation de l'Islande (S15), Ørlyggr, fils de Hrappr, fils de Björn buna, élevé par l'évêque Patrekr des Hébrides, part vers l'Islande pour y fonder une église dédiée à Saint Columba. Ørlyggr touche terre et nomme cet endroit Patreksfjörður en l'honneur de l'évêque. Après un hiver passé sur place, Ørlyggr s'installe finalement à Esjuberg où il fonde une église.",
  "Kollr": "Selon le Livre de la colonisation de l'Islande (S15, H15), Après avoir voyagé avec son frère juré Ørlyggr, le bateau de Kollr se sépare du reste à cause d'une tempête après que Kollr ait invoqué Thor. Kollr atterrit alors à Kollsvik.", 
  "Óttarr (Ohthere)": "Selon le récit d'Óttarr lui même, rapporté dans la Chronique Anglo-Saxonne, Óttarr, marchand norvégien part pour un premier voyage vers l'extrême nord de la Norvège. Il y raconte son voyage de manière précise, décrivant les peuples qu'il croise: Finnas, Terfinnas, Beormas et Cwenas ainsi que ses motivations: obtenir de l'ivoire de morse. Son deuxième trajet est celui qui l'emmène au port de l'actuelle Oslo, Kaupang, puis à Hedeby au Danemark, véritable épicentre du commerce danois. On ne sait pas exactement pourquoi Ohthere se rend en Angleterre, mais il est probable que ce soit pour établir de nouvelles routes commerciales vers le pays. C'est ainsi que le roi Alfred du Wessex, certainement intrigué par les habitudes et les coutumes d'un marchand issu du peuple du Nord, récemment installé en Angleterre, intègre son récit dans sa chronique.<br>Pour plus d'informations: <a href=https://fr.wikipedia.org/wiki/Ottar_du_H%C3%A5logaland target='_blank'>cliquez ici</a> ",
  "Wulfstan": "Wulfstan voit son récit inséré juste après celui d'Óttarr dans la Chronique Ango-Saxonne, toutefois, on ne connaît pas la relation qui unit les deux personnages. Il est probable que leurs récits aient été regroupés en fonction du caractère géographique de ces derniers. Dans son récit, Wulfstan ne donne aucune de ses motivations mais décrit très précisément l'organisation et les coutumes des peuples qu'il croise. <br>Pour plus d'informations: <a href=https://fr.wikipedia.org/wiki/Wulfstan_de_Hedeby target='_blank'>cliquez ici</a>",
  "Hrut Herjólfsson": "Selon la saga de Njall le Brûlé, Hrut et son demi-frère Höskuld vivent tous deux en Islande depuis le décès de leur mère. En 960, alors qu'ils se rendent au thing, l'assemblée annuelle d'Islande, Hrut demande la main de Unn, fille de Mörd, homme très respecté pour sa connaissance du droit. Avant qu'ils puissent se marier, Hrut est contraint de partir en Norvège pour réclamer l'héritage de son demi-frère (pas Höskuld). Il part donc cette même année vers Konungahella à la cour de Harald le Gris, où il entretient une relation avec la mère d'Harald, Gunnhild. Après avoir poursuivi son proche Soti qui possède l'héritage et l'avoir récupéré, Hrut retourne chez lui. Toutefois, Gunnhild lui jette un sort pour qu'il ne puisse avoir un mariage heureux avec une autre femme. Hrut est alors accusé d'impuissance par sa femme qui demande le divorce à son père lors du thing. Mörd cherche alors à récupérer la dot de sa fille mais Hrut refuse et le défie en duel que Mörd refuse, entraînant le gain du procès par Hrut. Unn finit par récupérer son argent grâce à Gunnar bien plus tard et Hrut se remarie avec Hallveiga.",
  "Gunnar Hamundarson": "Selon la saga de Njall le Brûlé, Gunnar, chef local islandais du Xe siècle, vit à Hlíðarendi et est le troisième mari de Hallgerðr Höskuldsdóttir, la fille d'Höskuld, frère de Hrut. Décrit comme quasiement invincible au combat, Gunnar s'en va piller vers 970, cherchant gloire et richesse à l'ouest. Il longe ainsi ",
  "Findan de Rheinau":"Selon la Vie de Findan, Fintan ou Findan de Rheinau est un moine irlandais dont la soeur est capturée par des vikings au IXe siècle. D'abord capturé à son tour en tentant de payer la rançon de sa soeur, Findan est finalement libéré. Il est capturé une seconde fois, pris dans les conflits princiers internes irlandais et est emmené aux îles Orcades par une bande viking. Il réussit à s'échapper et part avec des compagnons qu'il rencontre sur place, voyageant jusqu'à Rome."
};



function openPanel() {
  panel.classList.add('open');
  const container = document.getElementById('map-container');
  if (container) container.classList.add('shifted');
  toggleButton.innerText = '❯';
}

  // Groupes pour trajets uniquement
  const routeFlokiLayer = L.featureGroup();
  const routeNaddodrLayer = L.featureGroup().addTo(map);
  const routeGardharrLayer = L.featureGroup();
  const routeHjorleifrLayer = L.featureGroup();
  const routeIngolfurLayer = L.featureGroup();
  const routeOrlygurLayer = L.featureGroup();
  const routeKollrLayer = L.featureGroup();
  const routeOhthereLayer = L.featureGroup();
  const routeWulfstanLayer = L.featureGroup(); 
  const routeFindanLayer = L.featureGroup(); 
  const routeHrutLayer = L.featureGroup();
  const routeGunnarLayer = L.featureGroup();
  const ensembleLayer = L.layerGroup();
  const commerceLayer = L.layerGroup();


  // Handlers checkbox pour chaque voyageur
  const handlers = [
    {id: 'toggleRouteFloki', layer: routeFlokiLayer, name: 'Flóki'},
    {id: 'toggleRouteNaddodr', layer: routeNaddodrLayer, name: 'Naddodr'},
    {id: 'toggleRouteGardharr', layer: routeGardharrLayer, name: 'Garðarr Svavarson'},
    {id: 'toggleRouteHjorleifr', layer: routeHjorleifrLayer, name: 'Hjorleifr'},
    {id: 'toggleRouteIngolfur', layer: routeIngolfurLayer, name: 'Ingólfur Arnarson'},
    {id: 'toggleRouteOrlygur', layer: routeOrlygurLayer, name: 'Ørlyggr'},
    {id: 'toggleRouteKollr', layer: routeKollrLayer, name: 'Kollr'},
    {id: 'toggleRouteOhthere', layer: routeOhthereLayer, name: 'Óttarr (Ohthere)'},
    {id: 'toggleRouteWulfstan', layer: routeWulfstanLayer, name: 'Wulfstan'},
    {id: 'toggleRouteFindan', layer: routeFindanLayer, name: 'Findan de Rheinau'},
    {id: 'toggleRouteHrut', layer: routeHrutLayer, name: 'Hrut Herjólfsson'},
    {id: 'toggleRouteGunnar', layer: routeGunnarLayer, name: 'Gunnar Hamundarson'},
  ];


// --- Gestion de la carte politique ---
const empireLayer = L.layerGroup().addTo(map);

// Couleurs associées aux entités politiques
const empireColors = {
  // --- Monde Nordique & Viking ---
  "Danois": "#e74c3c",              // Rouge
  "Norvégiens": "#3498db",          // Bleu
  "Suedois et Goths": "#f1c40f",    // Jaune
  "Rus'": "#2ecc71",                // Vert Émeraude (Russie)
  "Normands": "#e74c3c",            // Rouge (si présent)
  "Finns": "#95a5a6",               // Gris (Finlande)
  "Sámi": "#bdc3c7",                // Gris clair (Laponie)

  // --- Iles Britanniques ---
  "Wessex": "#d35400",              // Orange foncé
  "Mercie": "#e67e22",              // Orange
  "Northumbrie": "#c0392b",         // Rouge brique
  "Essex": "#d35400",               // Orange foncé
  "Kent": "#d35400",                // Orange foncé
  "Irlande": "#27ae60",             // Vert pré
  "Ecossais": "#001aff",            // Vert bleuté
  "Pictes": "#ff0000",              // Turquoise
  "Pays de Galles": "#00b7ff",      // Vert
  "Celtes": "#ff00bf",              // Vert

  // --- Empires Majeurs ---
  "Empire carolingien": "#8e44ad",  // Violet (Francs)
  "Empire byzantin": "#ff00dd",     // Violet clair
  "Califat Abbasside": "#27ae60",   // Vert
  "Emirat de Cordoue": "#1abc9c",   // Turquoise
  "Asturies": "#f39c12",            // Jaune orangé
  "Etats pontificaux": "#f1c40f",   // Jaune Pape
  "Bulgars": "#16a085",             // Vert sombre
  "Avars": "#7f8c8d",               // Gris foncé
  "Khazars": "#95a5a6",
  "Francie Occidentale": "#001aff",
  "Francie orientale" : "#00b7ff",
  "Lotharingie": "#f39c12",

  // --- Autres ---
  "Bretagne": "#e67e22",            // Orange (Bretons)
  "Tribus slaves": "#256266",       // Gris
  "Tribus baltes": "#95a5a6",    // Gris
  "Magyars": "#7f8c8d",             // Gris
  "default": "#bdc3c7",
  "Lombards": "#000000",
  "Royaume de Croatie" : "#ff0000",
             
};

// Configuration des cartes politiques par année
const politicalSnapshots = [
  { year: 800, url: 'data/europe_800.geojson', data: null },
  { year: 900, url: 'data/europe_900.geojson', data: null },
];

let currentPoliticalYear = null;

function updatePoliticalLayer(year) {
  if (politicalSnapshots.length === 0) return;

  // Trouve le snapshot le plus proche de l'année demandée
  const snapshot = politicalSnapshots.reduce((prev, curr) => {
    return (Math.abs(curr.year - year) < Math.abs(prev.year - year) ? curr : prev);
  });

  // Si c'est déjà l'année chargée, on ne fait rien pour éviter de clignoter
  if (currentPoliticalYear === snapshot.year) return;

  const renderData = (data) => {
    empireLayer.clearLayers();
    L.geoJSON(data, {
      style: function(feature) {
        const name = feature.properties.NAME; 
        const color = empireColors[name] || empireColors["default"];
        return {
          color: "white",
          weight: 1,
          fillColor: color,     
          fillOpacity: 0.25
        };
      },
      onEachFeature: function(feature, layer) {
        if (feature.properties && feature.properties.NAME) {
          layer.bindTooltip(feature.properties.NAME, {
            permanent: false, 
            direction: "center",
            className: "empire-label"
          });
        }
      }
    }).addTo(empireLayer);
    currentPoliticalYear = snapshot.year;
  };

  if (snapshot.data) {
    renderData(snapshot.data);
  } else {
    fetch(snapshot.url)
      .then(res => res.json())
      .then(data => {
        snapshot.data = data; // Mise en cache
        renderData(data);
      })
      .catch(err => console.error(`Erreur chargement ${snapshot.url} :`, err));
  }
}

  /************ Timeline (single range) ************/
  const timelineInput = document.getElementById('timelineInput');
  const tlLabel = document.getElementById('tlLabel');

// Périodes d'activité
const routePeriods = {
  toggleRouteFloki:       [865, 866],
  toggleRouteNaddodr:     [850, 851],
  toggleRouteGardharr:    [860, 861],
  toggleRouteHjorleifr:   [870, 874],
  toggleRouteIngolfur:    [874, 877],
  toggleRouteOrlygur:     [870, 880],
  toggleRouteKollr:       [870, 880],
  toggleRouteOhthere:     [875, 880],
  toggleRouteWulfstan:    [875, 880],
  toggleRouteFindan:      [845, 860],
  toggleRouteHrut:        [960, 965],
  toggleRouteGunnar:      [970, 980]
};

// Mise à jour de l'interface de la timeline
function updateTimelineUI() {
  if (!timelineInput) return;
  const val = +timelineInput.value;
  if (tlLabel) tlLabel.textContent = val;

  // Remplissage visuel (gradient)
  const min = +timelineInput.min || 800;
  const max = +timelineInput.max || 1000;
  const percentage = ((val - min) / (max - min)) * 100;

  timelineInput.style.background = `linear-gradient(
    to right,
    #7aa6ff 0%,
    #7aa6ff ${percentage}%,
    #d0d0d0 ${percentage}%,
    #d0d0d0 100%
  )`;
}

function applyTimelineFilter() {
  updateTimelineUI();
  if (!timelineInput) return;
  const currentYear = +timelineInput.value;

  // Mise à jour de la carte politique
  // On cherche le snapshot dont l'année est <= currentYear
  const sortedSnapshots = politicalSnapshots.sort((a, b) => a.year - b.year);
  let targetYear = sortedSnapshots[0].year;
  for (const snap of sortedSnapshots) {
    if (currentYear >= snap.year) {
      targetYear = snap.year;
    }
  }
  updatePoliticalLayer(targetYear);

  handlers.forEach(h => {
    const cb = document.getElementById(h.id);
    if (!cb) return;
    const period = routePeriods[h.id];
    const startYear = period ? period[0] : 800;
    
    // Affiché si coché ET l'année courante >= année de début
    const show = cb.checked && (currentYear >= startYear);
    
    if (show) {
      if (!map.hasLayer(h.layer)) map.addLayer(h.layer);
    } else {
      if (map.hasLayer(h.layer)) map.removeLayer(h.layer);
    }
  });
}

// Écouteurs d'événements
if (timelineInput) {
  ['input', 'change'].forEach(evt => {
    timelineInput.addEventListener(evt, applyTimelineFilter);
  });
}

  handlers.forEach(h => {
    const cb = document.getElementById(h.id);
    if (!cb) return;
    cb.addEventListener('change', e => {
      const on = e.target.checked;
      if (on) map.addLayer(h.layer);
      else map.removeLayer(h.layer);
  
      updateTravelerPanel(h.name, on);
      applyTimelineFilter();
  
      // Ouvre le panneau si on coche
      if (on) openPanel();
    });
  });
  // Initialisation de la timeline
  if (timelineInput) {
    timelineInput.value = timelineInput.min;
    updateTimelineUI();
  }

  // Initialisation : seul Naddodr sélectionné
  handlers.forEach(h => {
    const cb = document.getElementById(h.id);
    if (cb) {
      const isNaddodr = h.name === 'Naddodr';
      cb.checked = isNaddodr;
      
      if (isNaddodr) {
        if (!map.hasLayer(h.layer)) map.addLayer(h.layer);
        updateTravelerPanel(h.name, true);
        openPanel();
      } else {
        if (map.hasLayer(h.layer)) map.removeLayer(h.layer);
        updateTravelerPanel(h.name, false);
      }
    }
  });
  applyTimelineFilter();
  
  // --- Chargement des points (JSON) ---
  loadPoints('data/floki.json', routeFlokiLayer, 'Flóki');
  loadPoints('data/naddodr.json', routeNaddodrLayer, 'Naddodr');
  loadPoints('data/gardharr.json', routeGardharrLayer, 'Garðarr Svavarson');
  loadPoints('data/hjorleifr.json', routeHjorleifrLayer, 'Hjorleifr');
  loadPoints('data/ingolfur.json', routeIngolfurLayer, 'Ingólfur Arnarson');
  loadPoints('data/orlygur.json', routeOrlygurLayer, 'Ørlyggr');
  loadPoints('data/kollr.json', routeKollrLayer, 'Kollr');
  loadPoints('data/ohthere.json', routeOhthereLayer, 'Óttarr (Ohthere)');
  loadPoints('data/wulfstan.json', routeWulfstanLayer, 'Wulfstan');
  loadPoints('data/hrut.json', routeHrutLayer, 'Hrut Herjólfsson');
  loadPoints('data/gunnar.json', routeGunnarLayer, 'Gunnar Hamundarson');
  loadPoints('data/findan.json', routeFindanLayer, 'Findan de Rheinau');

  // Chargement des lieux
  fetch('data/lieux.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        // Utilisation de cercles colorés au lieu de marqueurs bleus par défaut
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 5,
          fillColor: getTypeColor(p.Type),
          color: "#000",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(ensembleLayer);
        
        // Gestion de la description ou des notes
        const note = p.description || p.Notes || "";
        marker.bindPopup(`<strong>${p.Nom_lieu}</strong><br>Type : ${p.Type}<br>Note : ${note}`);
      
        // Ajoute au tableau pour zoomer automatiquement si besoin
        allBounds.push([p.lat, p.lon]);

        // Stocke le marqueur sous nom normalisé pour recherche
        placeMarkers[normalizeText(p.Nom_lieu)] = marker;
      });
    });

  // Gestion de l'affichage des lieux
  const resCheckbox2 = document.getElementById("toggleRouteEnsemble");
  if (resCheckbox2) {
    resCheckbox2.addEventListener("change", (e) => {
      if (e.target.checked) {
        ensembleLayer.addTo(map);
      } else {
        map.removeLayer(ensembleLayer);
      }
    });
  }
  // Icône des points de commerce
  const commerceIcon = L.icon({
    iconUrl: 'assets/commerce.png',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
  
  // Chargement des points de commerce
  fetch('data/lieux_commerce.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon],{ icon: commerceIcon }).addTo(commerceLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong>`);
      });
    });

  // Gestion de l'affichage du commerce
  const resCheckbox1 = document.getElementById("toggleRouteCommerce");
  if (resCheckbox1) {
    resCheckbox1.addEventListener("change", (e) => {
      if (e.target.checked) {
        commerceLayer.addTo(map);
      } else {
        map.removeLayer(commerceLayer);
      }
    });
  }

  // Icônes des ressources
const resourceIcons = {
  "Ambre": "🧿",
  "Laine": "🧶",
  "Sel": "🧂",
  "Fourrures": "🦊",
  "Fer": "⛏️",
  "Poisson": "🐟",
  "Bois": "🌲",
  "Vin": "🍷",
  "Soufre": "🧪",
  "Bijoux": "💍",
  "Pierre": "🪨",
  "Stéatite": "🪨",
  "Grain": "🌾",
  "Bétail": "🐄",
  "Miel": "🍯",
  "Armes":"⚔️",
  "Esclaves": "🧑‍🤝‍🧑",
  "Faucons":"🦅",
  "Epices": "🌶️",
  "Ivoire de morse":"🦦"
};


const resourcesData = [
  { name: "Norvège",   lat: 61.5, lng: 8.0,   resources: ["Fer", "Bois", "Pierre"] },
  { name: "Islande",   lat: 64.9, lng: -18.6, resources: ["Laine", "Soufre","Faucons"] },
  { name: "Danemark",  lat: 56.2, lng: 10.0,  resources: ["Poisson", "Sel", "Bois"] },
  { name: "Suède",     lat: 62.0, lng: 15.0,  resources: ["Fer", "Bois", "Fourrures"] },
  { name: "Bulgares",  lat: 56.2, lng: 50.0,  resources: ["Esclaves","Fourrures", "Miel" ] },
  { name: "Frise",     lat: 53.2, lng: 6.0,   resources: ["Bijoux", "Vin","Armes"] }, // zones frisonnes
  { name: "Angleterre",lat: 52.5, lng: -1.5,  resources: ["Laine", "Grain", "Miel"] },
  { name: "Irlande",   lat: 53.4, lng: -8.3,  resources: ["Bétail", "Laine"] },
  { name: "Francie",   lat: 47.2, lng: 2.4,   resources: ["Vin", "Sel"] },
  { name: "Bretagne",  lat: 48.2, lng: -3.2,  resources: ["Sel", "Poisson","Laine"] },
  { name: "Baltique",  lat: 56.8, lng: 20.5,  resources: ["Ambre", "Poisson"] },
  { name: "Rus'",      lat: 58.9, lng: 33.3,  resources: ["Fourrures", "Miel", "Esclaves"] },
  { name: "Empire Byzantin",   lat: 39.2, lng: 30.2,   resources: ["Bijoux", "Vin", "Epices"] },
  { name: "Finnmark",   lat: 70.0, lng: 23.9,   resources: ["Poisson", "Fourrures", "Ivoire de morse"] },

];

const resourcesLayer = L.layerGroup();

function makeResourceHTML(list) {
  if (list.length === 1) {
    return `<div class="res-icons">${resourceIcons[list[0]] || "•"}</div>`;
  }
  if (list.length === 2) {
    return `
      <div class="res-icons">
        <div>${resourceIcons[list[0]] || "•"}</div>
        <div style="display:flex;gap:4px;justify-content:center;">
          <div>${resourceIcons[list[1]] || "•"}</div>
        </div>
      </div>`;
  }
  if (list.length === 3) {
    return `
      <div class="res-icons">
        <div style="text-align:center;">${resourceIcons[list[0]] || "•"}</div>
        <div style="display:flex;gap:4px;justify-content:center;">
          <div>${resourceIcons[list[1]] || "•"}</div>
          <div>${resourceIcons[list[2]] || "•"}</div>
        </div>
      </div>`;
  }
  if (list.length === 4) {
    return `
      <div class="res-icons">
        <div style="text-align:center;">${resourceIcons[list[0]] || "•"}</div>
        <div style="display:flex;gap:4px;justify-content:center;">
          <div>${resourceIcons[list[1]] || "•"}</div>
          <div>${resourceIcons[list[2]] || "•"}</div>
        </div>
        <div style="text-align:center;">${resourceIcons[list[3]] || "•"}</div>
      </div>`;
  }
  // Affichage en colonne pour plus de 4 ressources
  return `<div class="res-icons">${list.map(r => resourceIcons[r] || "•").join("<br>")}</div>`;
}


function makeResourceMarker(entry) {
  const html = makeResourceHTML(entry.resources);
  const divIcon = L.divIcon({
    html,
    className: "res-divicon",
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  const popupHtml = `<strong>${entry.name}</strong><br>Ressources : ${entry.resources.join(", ")}`;
  return L.marker([entry.lat, entry.lng], { icon: divIcon }).bindPopup(popupHtml);
}

// Préparer la couche (non affichée par défaut)
resourcesData.forEach(e => resourcesLayer.addLayer(makeResourceMarker(e)));

// Gestion de l'affichage des ressources
const resCheckbox = document.getElementById("toggleRessources");
if (resCheckbox) {
  resCheckbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      resourcesLayer.addTo(map);
    } else {
      map.removeLayer(resourcesLayer);
    }
  });
}
// Légende des ressources (à afficher seulement si cochée)
const resourceLegendEl = document.getElementById("resource-legend");

// Contenu mini-légende
const resourceLegendHTML = `
  🌲 Bois &nbsp; ⛏️ Fer &nbsp; 🪨 Stéatite/Pierre à aiguiser <br>
  🍷 Vin &nbsp; 💍 Bijoux &nbsp; 🐟 Poisson <br>
  🧂 Sel &nbsp; 🧶 Laine &nbsp; 🦊 Fourrures <br>
  🧿 Ambre &nbsp; 🧪 Soufre &nbsp; 🍯 Miel &nbsp; 🐄 Bétail &nbsp; 🌾 Grain
`;

// Affichage conditionnel de la légende des ressources
if (resCheckbox) {
  resCheckbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      resourcesLayer.addTo(map);
      resourceLegendEl.style.display = "block";
      resourceLegendEl.innerHTML = resourceLegendHTML;
    } else {
      map.removeLayer(resourcesLayer);
      resourceLegendEl.style.display = "none";
      resourceLegendEl.innerHTML = "";
    }
  });
}

  // --- Heatmap Sagas ---
  // Vérifie si la librairie et les données sont chargées
  if (typeof L.heatLayer === 'function' && typeof sagasHeatmapData !== 'undefined') {
    // Calculer la valeur max pour l'intensité pour éviter la saturation
    const maxIntensity = sagasHeatmapData.reduce((max, p) => Math.max(max, p[2]), 0);
    
    const heatmapLayer = L.heatLayer(sagasHeatmapData, {
      minOpacity: 0.5,
      maxZoom: 5,
      radius: 10,
      blur: 10,
      max: maxIntensity // Important pour gérer les grandes valeurs d'intensité
    });

    const toggleHeatmap = document.getElementById('toggleHeatmap');
    if (toggleHeatmap) {
      toggleHeatmap.addEventListener('change', e => {
        if (e.target.checked) map.addLayer(heatmapLayer);
        else map.removeLayer(heatmapLayer);
      });
    }
  }

  // --- Chargement des trajets (GeoJSON) ---
  loadRoute('data/trajet_floki.geojson', routeFlokiLayer, 'green', "Flóki", "voyage vers 865");
  loadRoute('data/trajet_naddodr.geojson', routeNaddodrLayer, 'rgb(65, 65, 156)', "Naddodr", "voyage vers 850");
  loadRoute('data/trajet_gardharr.geojson', routeGardharrLayer, 'rgb(240, 109, 109)', "Garðarr Svavarson", "voyage vers 860/861");
  
  // Cas particuliers pour Hjorleifr et Ingolfur (couleurs de flèches spécifiques ou dashArray différents)
  loadRoute('data/trajet_hjorleifr+ingolfur.geojson', routeHjorleifrLayer, 'rgb(238, 222, 79)', "Hjorleifr", "Pour les dates, cf description", '12 12', 'rgb(233, 233, 132)');
  loadRoute('data/trajet_hjorleifr2.geojson', routeHjorleifrLayer, 'rgb(233, 233, 132)', "Hjorleifr", "Pour les dates, cf description");
  loadRoute('data/trajet_hjorleifr+ingolfur.geojson', routeIngolfurLayer, 'orange', "Ingolfur Arnarson", "Pour les dates, cf description");
  loadRoute('data/trajet_ingolfur.geojson', routeIngolfurLayer, 'orange', "Ingolfur Arnarson", "Pour les dates, cf description");

  loadRoute('data/trajet_orlygur.geojson', routeOrlygurLayer, 'pink', "Ørlyggr");
  loadRoute('data/trajet_kollr.geojson', routeKollrLayer, 'purple', "Kollr");
  loadRoute('data/trajet_ohthere.geojson', routeOhthereLayer, 'beige', "Ohthere", "voyage vers 875");
  loadRoute('data/trajet_wulfstan.geojson', routeWulfstanLayer, 'brown', "Wulfstan", "voyage vers 875");
  loadRoute('data/trajet_findan.geojson', routeFindanLayer, 'rgb(107, 165, 240)', "Findan", "voyage vers 850");
  loadRoute('data/trajet_hrut.geojson', routeHrutLayer, 'black', "Hrut", "pour la date, cf description");
  loadRoute('data/trajet_gunnar.geojson', routeGunnarLayer, 'grey', "Gunnar", "pour la date, cf description");

  // Gestion 'Tout désélectionner'
  const checkboxIds = handlers.map(h=>h.id);
  const layerMap = handlers.reduce((acc,h)=>{acc[h.id]=h.layer;return acc;},{
    toggleAll: null
  });
  let allVisible = true;
  const handlersname = handlers.map(h=>h.name)
  const toggleAllBtn = document.getElementById('toggleAll');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      allVisible = !allVisible;
      handlersname.forEach(name => {
        updateTravelerPanel(name, allVisible);
      })
      checkboxIds.forEach(id => {
        const checkbox = document.getElementById(id);
        if (!checkbox) return;
        checkbox.checked = allVisible;
        if (allVisible) map.addLayer(layerMap[id]); else map.removeLayer(layerMap[id]);
      });
      toggleAllBtn.innerText = allVisible ? 'Tout désélectionner' : 'Tout sélectionner';
    });
  }

  // Barre de recherche
  const searchContainer = document.createElement('div');
  searchContainer.id = 'search-container';
  searchContainer.innerHTML = `
    <input type="text" id="search-box" placeholder="Rechercher un lieu..." autocomplete="off">
    <ul id="suggestions" class="suggestions-list"></ul>
  `;
  document.body.appendChild(searchContainer);

  const searchBox = document.getElementById('search-box');
  const suggestions = document.getElementById('suggestions');
  
  searchBox.addEventListener('input', () => {
    const value = normalizeText(searchBox.value);
    suggestions.innerHTML = '';
  
    if (value.length === 0) return;
  
    const matches = Object.keys(placeMarkers).filter(name => name.includes(value));
  
    matches.forEach(name => {
      const item = document.createElement('li');
      item.textContent = name;
      item.addEventListener('click', () => {
        const marker = placeMarkers[name];
        if (marker) {
          map.setView(marker.getLatLng(), 8);
          marker.openPopup();
        }
        suggestions.innerHTML = '';
        searchBox.value = '';
      });
      suggestions.appendChild(item);
    });
  });
  
  // Ferme les suggestions si on clique ailleurs
  document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
      suggestions.innerHTML = '';
    }
  });
  
  
  
})
