import { onUnmounted, ref } from 'vue';
import { searchCities, type CityResult } from '../api/cities';

// Recherche de communes (#29) partagée par « Mon profil » et le formulaire de sortie.
// La ville saisie déclenche GET /api/cities ; en cas d'échec, de délai dépassé ou d'absence de
// résultat, le formulaire bascule en saisie manuelle (R-LOC-3) et le parcours reste possible.

// Les champs du formulaire appelant, sous forme d'objet réactif (reactive()).
export type LieuSaisi = { ville: string; codePostal: string; departement: string };

export function useRechercheCommune(lieu: LieuSaisi, delaiMs = 300) {
  const suggestions = ref<CityResult[]>([]);
  const rechercheManuelle = ref(false);
  const rechercheEnCours = ref(false);
  const communeChoisie = ref<CityResult | null>(null);
  // true dès que la personne touche à la ville, au code postal ou au département.
  const modifiee = ref(false);
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  // Numéro de la dernière recherche : une réponse arrivée en retard ne doit rien écraser.
  let version = 0;

  function invalider(): number {
    clearTimeout(minuterie);
    minuterie = undefined;
    rechercheEnCours.value = false;
    suggestions.value = [];
    return ++version;
  }

  // Formulaire rechargé (profil reçu, sortie chargée) : on repart de zéro.
  function reinitialiser(): void {
    invalider();
    communeChoisie.value = null;
    modifiee.value = false;
    rechercheManuelle.value = false;
  }

  function saisirVille(): void {
    modifiee.value = true;
    communeChoisie.value = null;
    const numero = invalider();
    const texte = lieu.ville.trim();
    if (rechercheManuelle.value || texte.length < 2) return;
    minuterie = setTimeout(async () => {
      minuterie = undefined;
      rechercheEnCours.value = true;
      try {
        const resultats = await searchCities(texte);
        if (numero !== version) return;
        suggestions.value = resultats;
        if (resultats.length === 0) rechercheManuelle.value = true;
      } catch {
        if (numero === version) rechercheManuelle.value = true;
      } finally {
        if (numero === version) rechercheEnCours.value = false;
      }
    }, delaiMs);
  }

  function choisirCommune(commune: CityResult): void {
    invalider();
    communeChoisie.value = commune;
    lieu.ville = commune.cityName;
    lieu.departement = commune.departmentCode;
    lieu.codePostal = commune.postalCodes[0] ?? '';
    modifiee.value = true;
  }

  function saisirLocalisation(): void {
    // La commune choisie n'est pas annulée ici : communeValide() revalide ville, département et
    // code postal à l'enregistrement. Un autre code postal de la même commune — Toulouse en a six —
    // garde donc son code INSEE, et un code étranger reste refusé par ce même garde.
    modifiee.value = true;
  }

  function passerEnManuel(): void {
    invalider();
    rechercheManuelle.value = true;
    saisirLocalisation();
  }

  // La commune choisie, seulement si les champs lui correspondent encore : c'est elle qui
  // apporte le code INSEE et la mention « vérifiée ». Sinon, saisie manuelle non vérifiée.
  function communeValide(): CityResult | null {
    const commune = communeChoisie.value;
    if (!commune) return null;
    const ville = lieu.ville.trim();
    const departement = lieu.departement.trim().toUpperCase();
    const codePostal = lieu.codePostal.trim();
    return commune.cityName === ville &&
      commune.departmentCode === departement &&
      commune.postalCodes.includes(codePostal)
      ? commune
      : null;
  }

  onUnmounted(invalider);

  return {
    suggestions,
    rechercheManuelle,
    rechercheEnCours,
    communeChoisie,
    modifiee,
    reinitialiser,
    saisirVille,
    choisirCommune,
    saisirLocalisation,
    passerEnManuel,
    communeValide,
  };
}
