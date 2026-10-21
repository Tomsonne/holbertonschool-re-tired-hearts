import { apiGet, apiPut } from './http';
import type { Interest } from './interests';

// Formes du contrat d'API (docs/contrats-api.md, « Profils »).
export type StatutProfil = 'pending' | 'approved' | 'blocked';
export type Recherche = 'friendship' | 'companionship' | 'romance' | 'activities';
// Ce que l'API peut lister dans missingForApproval (R-PROF-2).
export type ManquePourApprobation = 'displayName' | 'location' | 'interests';

// Localisation complète : visible seulement du propriétaire et des modérateurs.
export type LocalisationPrivee = {
  cityName: string;
  departmentCode: string;
  postalCode: string | null;
  cityCode: string | null;
  verified: boolean;
};

export type OwnProfile = {
  userId: string;
  displayName: string;
  bio: string | null;
  lookingFor: Recherche[];
  interests: Interest[];
  location: LocalisationPrivee | null;
  isOrganizer: boolean;
  acceptsMessages: boolean;
  memberSince: string;
  discoverable: boolean;
  allowMessages: boolean;
  status: StatutProfil;
  isComplete: boolean;
  missingForApproval: ManquePourApprobation[];
};

// Ni rôle, ni statut, ni e-mail : l'API refuse tout champ inconnu en 400 (R-STATUS-3).
export type ProfileInput = {
  displayName: string;
  bio: string | null;
  lookingFor: Recherche[];
  interestIds: number[];
  location: {
    cityName: string;
    postalCode: string | null; // facultatif (règles métier §3)
    departmentCode: string;
    cityCode: string | null;
    verified: boolean;
  } | null;
  discoverable: boolean;
  allowMessages: boolean;
};

export const fetchMyProfile = () => apiGet<OwnProfile>('/me/profile');
export const updateMyProfile = (input: ProfileInput) => apiPut<OwnProfile>('/me/profile', input);
