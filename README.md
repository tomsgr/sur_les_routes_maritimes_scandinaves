**!! PROJET EN DEVELOPPEMENT !!**

# Carte interactive des déplacements navals des Normands (IXe siècle)

Ce projet est une **carte interactive en JavaScript (Leaflet.js)** retraçant les voyages maritimes des Normands au IXe siècle, selon plusieurs sources narratives. Il a été réalisé dans le cadre d’un mémoire de master SDH à l'Université Paris 1 Panthéon-Sorbonne, avec le soutien du [**PIREH**](https://github.com/PirehP1/).

---

## Présentation du projet

Le but est de représenter visuellement les **logiques pratiques, techniques et géographiques** des déplacements vikings à travers plusieurs types de sources :

- Textes littéraires (sagas, récits de fondation)
- Récits de marchands-navigateurs (Ohthere, Wulfstan)
- Annales et chroniques (Annales de Saint-Bertin, etc.)

Les trajets sont différenciés par voyageur. Chaque trajet peut être affiché individuellement, avec une **fiche descriptive contextuelle**.  
Une **carte de chaleur** des lieux évoqués est également intégrée pour visualiser les zones les plus denses.

---

## Technologies utilisées

- Python / HTML / CSS / JavaScript
- [Leaflet.js](https://leafletjs.com/)
- GeoJSON
- Git + GitHub Pages
- Données des lieux récupérées en scrappant le site [**Icelandic Saga Map**](https://sagamap.hi.is/is/)
- Données spatiales traitées à partir de fichiers `.csv` convertis manuellement en `.json`. 

---

## Comment utiliser la carte

1. **Navigation** :
   - Vous pouvez vous déplacer librement sur la carte et zoomer à volonté.
   - Cliquez sur un **trajet** pour afficher les dates ou explications.
   - Recherchez n'importe quel lieu grâce à la barre de recherche

2. **Afficher les voyageurs** :
   - Cochez les cases dans la **légende** pour afficher ou masquer les itinéraires.
   - Chaque voyageur déclenche l’ouverture d’un **panneau latéral** avec une fiche descriptive.
   - Egalement, une fois les voyageurs cochés, vous pouvez déplacer la borne chronologique pour afficher les trajets en fonction de la date (nouveau !)

3. (pas encore disponible) **Carte de chaleur** :
   - Activez ou désactivez la carte de chaleur des lieux mentionnés dans les sources via la légende.
   - Cette couche permet de visualiser la densité des mentions géographiques.
  
4. **Eléments supplémentaires**:
  - Affichez l'ensemble des ressources principales produites dans les pays visités par les vikings grâce à la légende (nouveau !)
  - Affichez l'ensemble des lieux mentionnés dans les sources islandaises grâce à la légende

---

## 🔗 Démo en ligne

[Pour accéder à la carte, cliquez ici](https://tomsgr.github.io/sur_les_routes_maritimes_scandinaves/)

---

