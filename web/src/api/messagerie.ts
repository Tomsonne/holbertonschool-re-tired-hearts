import { apiGet, apiPost } from './http';

// Contrats de la messagerie (docs/contrats-api.md, tâche 3).
// L'expéditeur est toujours le membre connecté (R-MSG-5) : aucun identifiant d'expéditeur n'est envoyé.

// Codes possibles de cannotSendReason : ce sont des codes, pas des phrases (traduits dans formats.ts).
export type RaisonEnvoiImpossible = 'RECIPIENT_UNAVAILABLE' | 'MESSAGING_DISABLED' | 'PROFILE_NOT_APPROVED';

export type Conversation = {
  id: string;
  otherParticipant: { userId: string; displayName: string; isOrganizer: boolean; available: boolean };
  contextEvent: { id: string; title: string } | null;
  canSend: boolean;
  cannotSendReason: RaisonEnvoiImpossible | null;
  createdAt: string;
};

export type ConversationSummary = Conversation & {
  lastMessage: { body: string; sentByMe: boolean; createdAt: string } | null;
};

export type Message = { id: string; body: string; sentByMe: boolean; senderDisplayName: string; createdAt: string };

// Taille d'une page de messages (maximum accepté par l'API).
export const TAILLE_PAGE_MESSAGES = 50;

export const fetchConversations = () => apiGet<ConversationSummary[]>('/conversations');

export const fetchConversation = (id: string) => apiGet<Conversation>(`/conversations/${encodeURIComponent(id)}`);

// Sans curseur : les 50 derniers messages. Avec `avant` (id du plus ancien affiché) : les précédents.
// Toujours du plus ancien au plus récent.
export function fetchMessages(id: string, avant?: string): Promise<Message[]> {
  const params = new URLSearchParams({ limit: String(TAILLE_PAGE_MESSAGES) });
  if (avant) params.set('before', avant);
  return apiGet<Message[]>(`/conversations/${encodeURIComponent(id)}/messages?${params}`);
}

export const envoyerMessage = (id: string, body: string) =>
  apiPost<Message>(`/conversations/${encodeURIComponent(id)}/messages`, { body });

// Démarre une conversation, ou renvoie celle qui existe déjà avec ce membre (R-MSG-2).
export const demarrerConversation = (recipientId: string, eventId?: string) =>
  apiPost<Conversation>('/conversations', eventId ? { recipientId, eventId } : { recipientId });
