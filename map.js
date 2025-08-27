document.addEventListener('DOMContentLoaded', () => {

  const map = L.map('map').setView([63.5, -20], 3);

  // Fond de carte OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  //transforme les lettres avec accent en version simple
  function normalizeText(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  
  const placeMarkers = {}; // nom du lieu -> marker
  const allBounds = [];

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
    opacity: 0 // laisser la geoJSON visible mais pas cette couche
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
    <p>Sélectionnez un voyageur sur la carte pour visualiser son itinéraire. Cliquez sur le tracé d'un itinéraire pour afficher la date. Vous pouvez également consulter les fiches descriptives ici en cochant un itinéraire et rechercher un lieu avec la barre de recherche en bas à gauche de la carte. Les données sont disponibles sur le GitHub suivant: <a href="https://github.com/tomsgr/sur_les_routes_maritimes_scandinaves" target="_blank">lien du GitHub</a></p>  
    <ul id="traveler-list" style="padding-left: 1em; margin-top: 1em;"></ul>
    <div id="traveler-description" class="traveler-description"></div>
  </div>
`;
document.body.appendChild(panel);

const toggleButton = document.createElement('div');
toggleButton.id = 'toggle-panel';
toggleButton.innerText = '❮';
document.body.appendChild(toggleButton);

const style = document.createElement('style');
style.innerHTML = `
#map-container {
  transition: margin-right 0.3s ease;
}
#side-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 340px;
  height: 100%;
  background: #f8f9fa; /* Fond clair mais pas blanc pur */
  box-shadow: -4px 0 10px rgba(0,0,0,0.1);
  z-index: 2000;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 14px;
  overflow-y: auto;
  border-left: 1px solid #ddd;
}
#side-panel.open {
  transform: translateX(0);
}
#panel-content {
  padding: 20px;
}
#panel-content h2 {
  margin-top: 0;
  font-size: 20px;
  color: #343a40;
  border-bottom: 1px solid #ccc;
  padding-bottom: 8px;
}
#traveler-list li {
  margin-bottom: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

#map-container.shifted {
  margin-right: 340px;
}
#legend-container{
  transition: margin-right 0.3s ease;
}
#map-container.shifted #legend-container{
  margin-right: 340px;
}
#toggleLegendBtn{
  transition: margin-right 0.3s ease;
}
#map-container.shifted #toggleLegendBtn{
  margin-right: 340px;
}
#toggle-panel {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px 0 0 6px;
  padding: 8px 12px;
  font-weight: bold;
  cursor: pointer;
  font-size: 16px;
  z-index: 2001;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  transition: right 0.3s ease, background 0.2s;
}
#side-panel.open ~ #toggle-panel {
  right: 340px; /* quand le panneau est ouvert */
}
#toggle-panel:hover {
  background: #0056b3;
}
`;
document.head.appendChild(style);

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
    list.appendChild(item);
  } else if (!visible && item) {
    list.removeChild(item);
  }

  // Mettre à jour toutes les descriptions affichées
  updateTravelerDescriptions();
}

function updateTravelerDescriptions() {
  const list = document.getElementById('traveler-list');
  const descEl = document.getElementById('traveler-description');
  if (!list || !descEl) return;

  let content = '';

  list.querySelectorAll('li').forEach(li => {
    const name = li.dataset.name;
    const desc = travelerDescriptions[name] || 'Description non disponible.';
    const color = travelerColors[name] || '#007bff';

    content += `
      <div style="
        border-left: 4px solid ${color}; 
        padding-left: 8px; 
        margin-bottom: 12px;
      ">
        <strong>${name}</strong><br>${desc}
      </div>
    `;

  });

  descEl.innerHTML = content.trim();
 
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
  const routeFlokiLayer = L.layerGroup();
  const routeNaddodrLayer = L.layerGroup().addTo(map);
  const routeGardharrLayer = L.layerGroup();
  const routeHjorleifrLayer = L.layerGroup();
  const routeIngolfurLayer = L.layerGroup();
  const routeOrlygurLayer = L.layerGroup();
  const routeKollrLayer = L.layerGroup();
  const routeOhthereLayer = L.layerGroup();
  const routeWulfstanLayer = L.layerGroup(); 
  const routeFindanLayer = L.layerGroup(); 
  const routeHrutLayer = L.layerGroup();
  const routeGunnarLayer = L.layerGroup();
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
    {id: 'toggleRouteEnsemble', layer: ensembleLayer, name: 'Ensemble des lieux cités dans les sources islandaises'},
    {id: 'toggleRouteCommerce', layer: commerceLayer, name: 'Ensemble des lieux de commerce importants'},

  ];
  handlers.forEach(h => {
    const cb = document.getElementById(h.id);
    if (!cb) return;
    cb.addEventListener('change', e => {
      const on = e.target.checked;
      if (on) map.addLayer(h.layer);
      else map.removeLayer(h.layer);
  
      updateTravelerPanel(h.name, on);
  
      // Ouvre le panneau si on coche
      if (on) openPanel();
    });
  });
  handlers.forEach(h => {
    const cb = document.getElementById(h.id);
    if (cb && cb.checked) {
      // Déclenche manuellement l'événement change
      cb.dispatchEvent(new Event('change'));
    }
  });
  
  // Chargement des points de floki.json
  fetch('floki.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeFlokiLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });

  // Chargement des points de Naddodr
  fetch('naddodr.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeNaddodrLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });

  // Chargement des points de Gardharr
  fetch('gardharr.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeGardharrLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });  

  // Chargement des points de Hjorleifr
  fetch('hjorleifr.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeHjorleifrLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });  
  
  // Chargement des points de Ingolfur
  fetch('ingolfur.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeIngolfurLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    }); 

  // Chargement des points de Orlygur
  fetch('orlygur.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeOrlygurLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });
  
  // Chargement des points de Kollr
  fetch('kollr.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeKollrLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });

  // Chargement des points de Ohthere
  fetch('ohthere.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeOhthereLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });

  // Chargement des points de Wulfstan
  fetch('wulfstan.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeWulfstanLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.type}`);
      });
    });

  // Chargement des points de Hrut
  fetch('hrut.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeHrutLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.Type}`);
      });
    });

  // Chargement des points de Gunnar
  fetch('gunnar.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeGunnarLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.Type}`);
      });
    });

  // Chargement des points de Gunnar
  fetch('findan.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(routeFindanLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong><br>Type : ${p.Type}`);
      });
    });


  // Chargement des points de ensemble
  fetch('lieux.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon]).addTo(ensembleLayer);
        marker.bindPopup(`<strong>${p.Nom_lieu}</strong><br>Type : ${p.Type}<br>Note : ${p.description}`);
      
        // Ajoute au tableau pour zoomer automatiquement si besoin
        allBounds.push([p.lat, p.lon]);

        // Stocke le marqueur sous nom normalisé pour recherche
        placeMarkers[normalizeText(p.Nom_lieu)] = marker;
      });
    });


  // icone points de commerce
  const commerceIcon = L.icon({
    iconUrl: 'commerce.png',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
  
  // Chargement des points de commerce
  fetch('lieux_commerce.json')
    .then(res => res.json())
    .then(data => {
      data.forEach(p => {
        const marker = L.marker([p.lat, p.lon],{ icon: commerceIcon }).addTo(commerceLayer);
        marker.bindPopup(`<strong>${p.lieu}</strong>`);
      });
    });

  // icone ressources
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
  // pour plus de 4, on met en colonne par défaut
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

// Toggle via la case de la légende (id="toggleRessources")
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
  // Trajet Flóki
  fetch('trajet_floki.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'green',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeFlokiLayer);

    // Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_floki = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_floki = L.polyline(coords_floki); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_floki, 'green', routeFlokiLayer, "Flóki", "voyage vers 865");
    });
  });
  
  // Trajet Naddódr
  fetch('trajet_naddodr.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'rgb(65, 65, 156)',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeNaddodrLayer);

    // Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_naddodr = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_naddodr = L.polyline(coords_naddodr); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_naddodr, 'rgb(65, 65, 156)', routeNaddodrLayer, "Naddodr", "voyage vers 850");
    });
  });

  // Trajet Gardharr
  fetch('trajet_gardharr.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'rgb(240, 109, 109)',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeGardharrLayer);

    // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_gardharr = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_gardharr = L.polyline(coords_gardharr); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_gardharr, 'rgb(240, 109, 109)', routeGardharrLayer, "Garðarr Svavarson", "voyage vers 860/861");
    });
  });
  // Trajet Hjorleifr + Ingolfur
  fetch('trajet_hjorleifr+ingolfur.geojson')
  .then(res => res.json())
  .then(data => {
    const layer = L.geoJSON(data, {
      style: {
        color: 'rgb(238, 222, 79)',
        weight: 4,
        dashArray: '12 12'       
      }
    }).addTo(routeHjorleifrLayer);
    data.features.forEach(feature => {
      const coords_hjorleifr = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_hjorleifr = L.polyline(coords_hjorleifr); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_hjorleifr, 'rgb(233, 233, 132)', routeHjorleifrLayer, "Hjorleifr", "Pour les dates, cf description");
    });
  });

  // Trajet Hjorleifr
  fetch('trajet_hjorleifr2.geojson')
  .then(res => res.json())
  .then(data => {
    const layer = L.geoJSON(data, {
      style: {
        color: 'rgb(233, 233, 132)',
        weight: 4,
        dashArray: '12 8' 
      }
    }).addTo(routeHjorleifrLayer);
    data.features.forEach(feature => {
      const coords_hjorleifr = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_hjorleifr = L.polyline(coords_hjorleifr); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_hjorleifr, 'rgb(233, 233, 132)', routeHjorleifrLayer, "Hjorleifr", "Pour les dates, cf description");
    });
  });
  // Trajet Hjorleifr + Ingolfur
  fetch('trajet_hjorleifr+ingolfur.geojson')
  .then(res => res.json())
  .then(data => {
    const layer = L.geoJSON(data, {
      style: {
        color: 'orange',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeIngolfurLayer);
    data.features.forEach(feature => {
      const coords_hjorleifringolfur = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_hjorleifringolfur = L.polyline(coords_hjorleifringolfur); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_hjorleifringolfur, 'orange', routeIngolfurLayer, "Ingolfur Arnarson", "Pour les dates, cf description");
    });
  });  

  // Trajet Ingolfur
  fetch('trajet_ingolfur.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'orange',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeIngolfurLayer);

    // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_ingolfur = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_ingolfur = L.polyline(coords_ingolfur); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_ingolfur, 'orange', routeIngolfurLayer, "Ingolfur Arnarson", "Pour les dates, cf description");
    });
  });

    // Trajet Orlygur
    fetch('trajet_orlygur.geojson')
    .then(res => res.json())
    .then(data => {
      const geoLayer = L.geoJSON(data, {
        style: {
          color: 'pink',
          weight: 4,
          dashArray: '12 8'
        }
      }).addTo(routeOrlygurLayer);
  
      // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
      data.features.forEach(feature => {
        const coords_orlygur = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        const polyline_orlygur = L.polyline(coords_orlygur); // ne pas ajouter à la carte pour éviter les doublons
        addDirectionalArrows(polyline_orlygur, 'pink', routeOrlygurLayer, "Ørlyggr");
      });
    });

    // Trajet Kollr
    fetch('trajet_kollr.geojson')
    .then(res => res.json())
    .then(data => {
      const geoLayer = L.geoJSON(data, {
        style: {
          color: 'purple',
          weight: 4,
          dashArray: '12 8'
        }
      }).addTo(routeKollrLayer);
  
      // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
      data.features.forEach(feature => {
        const coords_kollr = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        const polyline_kollr = L.polyline(coords_kollr); // ne pas ajouter à la carte pour éviter les doublons
        addDirectionalArrows(polyline_kollr, 'purple', routeKollrLayer, "Kollr");
      });
    });

  // Trajet Ohthere
  fetch('trajet_ohthere.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'beige',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeOhthereLayer);

    // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_ohthere = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_ohthere = L.polyline(coords_ohthere); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_ohthere, 'beige', routeOhthereLayer, "Ohthere", "voyage vers 875");
    });
  });

  // Trajet Wulfstan
  fetch('trajet_wulfstan.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'brown',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeWulfstanLayer);

    // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_wulfstan = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_wulfstan = L.polyline(coords_wulfstan); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_wulfstan, 'brown', routeWulfstanLayer, "Wulfstan", "voyage vers 875");
    });
  });

  // Trajet Findan
  fetch('trajet_findan.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'rgb(107, 165, 240)',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeFindanLayer);

    // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_findan = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_findan = L.polyline(coords_findan); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_findan, 'rgb(107, 165, 240)', routeFindanLayer, "Findan", "voyage vers 850");
    });
  });

  // Trajet Hrut
  fetch('trajet_hrut.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'black',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeHrutLayer);

    // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_hrut = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_hrut = L.polyline(coords_hrut); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_hrut, 'black', routeHrutLayer, "Hrut", "pour la date, cf description");
    });
  });
  
  // Trajet Gunnar
  fetch('trajet_gunnar.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: {
        color: 'grey',
        weight: 4,
        dashArray: '12 8'
      }
    }).addTo(routeGunnarLayer);

    // 🔽 Pour chaque feature (trajet), créer une polyline avec flèches
    data.features.forEach(feature => {
      const coords_gunnar = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const polyline_gunnar = L.polyline(coords_gunnar); // ne pas ajouter à la carte pour éviter les doublons
      addDirectionalArrows(polyline_gunnar, 'grey', routeGunnarLayer, "Gunnar", "pour la date, cf description");
    });
  });

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

  //barre de recherche
  const searchContainer = document.createElement('div');
  searchContainer.id = 'search-container';
  searchContainer.innerHTML = `
    <input type="text" id="search-box" placeholder="Rechercher un lieu..." autocomplete="off">
    <ul id="suggestions" class="suggestions-list"></ul>
  `;
  document.body.appendChild(searchContainer);

  style.innerHTML += `
  #search-container {
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 2001;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    padding: 8px;
    width: 240px;
    font-family: inherit;
  }
  #search-box {
    width: 100%;
    padding: 6px;
    padding-right: 0px;
    font-size: 14px;
    border: none;
    border-radius: 4px;
  }
  .suggestions-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 150px;
    overflow-y: auto;
  }
  .suggestions-list li {
    padding: 6px;
    cursor: pointer;
  }
  .suggestions-list li:hover {
    background-color: #f0f0f0;
  }
  `;

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
