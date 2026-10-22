import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import type { PublicProfile } from '../api/decouverte';
import { ApiError } from '../api/http';
import type { Conversation, ConversationSummary, Message } from '../api/messagerie';
import { gardeDeSession } from '../router/garde';
import { useSessionStore } from '../stores/session';
import ConversationView from './ConversationView.vue';
import InboxView from './InboxView.vue';
import MemberView from './MemberView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/decouverte', () => ({ fetchProfiles: vi.fn(), fetchProfile: vi.fn() }));
vi.mock('../api/messagerie', () => ({
  TAILLE_PAGE_MESSAGES: 50,
  fetchConversations: vi.fn(),
  fetchConversation: vi.fn(),
  fetchMessages: vi.fn(),
  envoyerMessage: vi.fn(),
  demarrerConversation: vi.fn(),
}));
const authApi = await import('../api/auth');
const decouverteApi = await import('../api/decouverte');
const messagerieApi = await import('../api/messagerie');

const odette: Me = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'odette@example.test',
  role: 'member',
  accountStatus: 'active',
  profileStatus: 'approved',
  displayName: 'Odette',
};
const MARCEL = '22222222-2222-2222-2222-222222222222';
const ID = '99999999-9999-9999-9999-999999999999';

function conversation(surcharge: Partial<Conversation> = {}): Conversation {
  return {
    id: ID,
    otherParticipant: { userId: MARCEL, displayName: 'Marcel', isOrganizer: true, available: true },
    contextEvent: { id: '11111111-1111-1111-1111-111111111111', title: 'Balade au Jardin des Plantes' },
    canSend: true,
    cannotSendReason: null,
    createdAt: '2026-10-20T08:00:00.000Z',
    ...surcharge,
  };
}

function message(n: number, surcharge: Partial<Message> = {}): Message {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    body: `Message ${n}`,
    sentByMe: n % 2 === 0,
    senderDisplayName: n % 2 === 0 ? 'Odette' : 'Marcel',
    createdAt: new Date(Date.UTC(2026, 9, 20, 8, n)).toISOString(),
    ...surcharge,
  };
}

const page = (debut: number, fin: number) => Array.from({ length: fin - debut + 1 }, (_, i) => message(debut + i));

let router: Router;
type Monte = Awaited<ReturnType<typeof monter>>;

async function monter(chemin: string) {
  const vide = { render: () => h('div') };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/mon-profil', name: 'mon-profil', component: vide },
      { path: '/membres', name: 'membres', component: vide },
      { path: '/membres/:userId', name: 'membre', component: MemberView, meta: { connexionRequise: true } },
      { path: '/sorties/:eventId', name: 'sortie', component: vide },
      { path: '/messages', name: 'messages', component: InboxView, meta: { connexionRequise: true } },
      { path: '/messages/:conversationId', name: 'conversation', component: ConversationView, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(chemin);
  const App = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const lu = (w: { text(): string }) => w.text().replace(/\s+/g, ' ').trim();
const bulles = (w: Monte) => w.findAll('.bulle').map((b) => lu(b.get('.bulle__entete strong')) + ' : ' + lu(b.get('.bulle__texte')));
const annonce = (w: Monte) => w.get('.visuellement-cache[role="status"]').text();

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(authApi.fetchMe).mockResolvedValue({ ...odette });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('boîte de réception', () => {
  it('chargement, puis une carte par conversation : nom, sortie, aperçu, sans HTML interprété', async () => {
    let repondre!: (v: ConversationSummary[]) => void;
    vi.mocked(messagerieApi.fetchConversations).mockReturnValueOnce(new Promise((r) => (repondre = r)));
    const wrapper = await monter('/messages');
    expect(wrapper.get('[role="status"]').text()).toBe('Chargement de vos conversations…');

    repondre([
      { ...conversation(), lastMessage: { body: '<img src=x onerror="alert(1)"> À samedi !', sentByMe: false, createdAt: '2026-10-21T16:05:00.000Z' } },
      {
        ...conversation({
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          otherParticipant: { userId: 'x', displayName: 'Membre indisponible', isOrganizer: false, available: false },
          contextEvent: null,
          canSend: false,
          cannotSendReason: 'RECIPIENT_UNAVAILABLE',
        }),
        lastMessage: { body: 'Merci pour tout', sentByMe: true, createdAt: '2026-10-12T16:05:00.000Z' },
      },
    ]);
    await flushPromises();

    expect(wrapper.get('#titre-conversations').text()).toBe('Conversations (2)');
    const [premiere, seconde] = wrapper.findAll('.carte-conversation');
    expect(premiere.get('h4 a').attributes('href')).toBe(`/messages/${ID}`);
    expect(premiere.text()).toContain('Rencontre : Balade au Jardin des Plantes');
    expect(lu(premiere.get('.carte-conversation__apercu'))).toBe('Marcel : <img src=x onerror="alert(1)"> À samedi !');
    expect(premiere.find('img').exists()).toBe(false);
    expect(lu(seconde.get('.carte-conversation__apercu'))).toBe('Vous : Merci pour tout');
    expect(seconde.text()).toContain('Lecture seule');
  });

  it('aucune conversation : explique comment en démarrer une', async () => {
    vi.mocked(messagerieApi.fetchConversations).mockResolvedValue([]);
    const wrapper = await monter('/messages');

    expect(wrapper.text()).toContain("Vous n'avez encore aucune conversation.");
  });

  it('erreur avec « Réessayer », puis « Actualiser » annonce la mise à jour', async () => {
    vi.mocked(messagerieApi.fetchConversations)
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Le service est momentanément indisponible.'))
      .mockResolvedValue([]);
    const wrapper = await monter('/messages');

    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('#titre-conversations').exists()).toBe(true);

    await wrapper.get('.boite-reception__entete button').trigger('click');
    await flushPromises();
    expect(annonce(wrapper)).toBe('Liste des conversations à jour.');
    expect(document.activeElement?.id).toBe('titre-conversations');
  });

  it('profil en attente : lecture possible, avec une explication', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...odette, profileStatus: 'pending' });
    vi.mocked(messagerieApi.fetchConversations).mockResolvedValue([]);
    const wrapper = await monter('/messages');

    expect(messagerieApi.fetchConversations).toHaveBeenCalled();
    expect(wrapper.text()).toContain('vous pouvez relire vos conversations, mais pas écrire');
  });

  it("profil bloqué : la messagerie est refusée sans appel à l'API", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...odette, profileStatus: 'blocked' });
    const wrapper = await monter('/messages');

    expect(wrapper.get('#titre-messages-refus').text()).toBe('Messagerie non disponible');
    expect(messagerieApi.fetchConversations).not.toHaveBeenCalled();
  });
});

describe('conversation', () => {
  it('messages du plus ancien au plus récent, expéditeur identifié, texte jamais interprété', async () => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([
      message(1, { body: 'Bonjour Odette' }),
      message(2, { body: '<b>Bonjour</b> Marcel' }),
    ]);
    const wrapper = await monter(`/messages/${ID}`);

    expect(lu(wrapper.get('h2'))).toBe('Conversation avec Marcel');
    expect(wrapper.get('h2 a').attributes('href')).toBe(`/membres/${MARCEL}`);
    expect(bulles(wrapper)).toEqual(['Marcel : Bonjour Odette', 'Vous : <b>Bonjour</b> Marcel']);
    expect(wrapper.find('.bulle__texte b').exists()).toBe(false);
    expect(wrapper.findAll('.bulle')[1].classes()).toContain('bulle--moi');
    expect(wrapper.find('.conversation__anciens').exists()).toBe(false);
    expect(document.title).toBe('Conversation avec Marcel — Re-Tired Hearts');
  });

  it('aucun message : invite à écrire le premier', async () => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([]);
    const wrapper = await monter(`/messages/${ID}`);

    expect(lu(wrapper.get('.conversation__fil .message'))).toBe("Aucun message pour l'instant. Écrivez le premier ci-dessous.");
  });

  it("conversation d'autrui ou inconnue : « Conversation indisponible »", async () => {
    vi.mocked(messagerieApi.fetchConversation).mockRejectedValue(
      new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Cette conversation est indisponible.'),
    );
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([]);
    const wrapper = await monter(`/messages/${ID}`);

    expect(wrapper.get('h2').text()).toBe('Conversation indisponible');
  });

  it('erreur de chargement, puis « Réessayer »', async () => {
    vi.mocked(messagerieApi.fetchConversation)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Le service est momentanément indisponible.'))
      .mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([message(1)]);
    const wrapper = await monter(`/messages/${ID}`);

    expect(wrapper.get('[role="alert"]').text()).toContain('Le service est momentanément indisponible.');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.bulle')).toHaveLength(1);
  });

  it('page pleine : charge les messages plus anciens en haut et y place le focus', async () => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages)
      .mockResolvedValueOnce(page(11, 60))
      .mockResolvedValueOnce(page(1, 10));
    const wrapper = await monter(`/messages/${ID}`);

    expect(wrapper.findAll('.bulle')).toHaveLength(50);
    await wrapper.get('.conversation__anciens button').trigger('click');
    await flushPromises();

    expect(messagerieApi.fetchMessages).toHaveBeenLastCalledWith(ID, message(11).id);
    expect(wrapper.findAll('.bulle')).toHaveLength(60);
    expect(document.activeElement?.id).toBe(`message-${message(1).id}`);
    expect(wrapper.find('.conversation__anciens').exists()).toBe(false);
  });

  it("envoi : compteur fidèle à l'API, message ajouté, champ vidé, focus conservé", async () => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([message(1)]);
    vi.mocked(messagerieApi.envoyerMessage).mockResolvedValue(message(2, { body: 'À samedi !' }));
    const wrapper = await monter(`/messages/${ID}`);

    const champ = wrapper.get('#nouveau-message');
    await champ.setValue('  À   samedi\n !  ');
    expect(wrapper.get('#nouveau-message-compteur').text()).toBe('10 / 1000 caractères');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(messagerieApi.envoyerMessage).toHaveBeenCalledWith(ID, '  À   samedi\n !  ');
    expect(bulles(wrapper)).toEqual(['Marcel : Message 1', 'Vous : À samedi !']);
    expect((champ.element as HTMLTextAreaElement).value).toBe('');
    expect(annonce(wrapper)).toBe('Message envoyé.');
    expect(document.activeElement?.id).toBe('nouveau-message');
  });

  it("message vide ou trop long : erreur liée au champ, rien n'est envoyé", async () => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([]);
    const wrapper = await monter(`/messages/${ID}`);

    await wrapper.get('#nouveau-message').setValue('   \n ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('#nouveau-message-erreur').text()).toBe('Écrivez votre message avant de l’envoyer.');
    expect(wrapper.get('#nouveau-message').attributes('aria-describedby')).toContain('nouveau-message-erreur');

    await wrapper.get('#nouveau-message').setValue('a'.repeat(1001));
    expect(wrapper.get('#nouveau-message-compteur').classes()).toContain('compteur--depasse');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('#nouveau-message-erreur').text()).toContain('1000 caractères au maximum');
    expect(messagerieApi.envoyerMessage).not.toHaveBeenCalled();
  });

  it('trop de messages (429) : explication lisible, texte conservé', async () => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([]);
    vi.mocked(messagerieApi.envoyerMessage).mockRejectedValue(new ApiError(429, 'TOO_MANY_REQUESTS', 'Trop de requêtes.'));
    const wrapper = await monter(`/messages/${ID}`);

    await wrapper.get('#nouveau-message').setValue('Bonjour');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('#nouveau-message-erreur').text()).toContain('Patientez quelques minutes');
    expect((wrapper.get('#nouveau-message').element as HTMLTextAreaElement).value).toBe('Bonjour');
  });

  it("destinataire devenu indisponible à l'envoi : le formulaire laisse place à l'explication", async () => {
    vi.mocked(messagerieApi.fetchConversation)
      .mockResolvedValueOnce(conversation())
      .mockResolvedValueOnce(
        conversation({
          otherParticipant: { userId: MARCEL, displayName: 'Membre indisponible', isOrganizer: true, available: false },
          canSend: false,
          cannotSendReason: 'RECIPIENT_UNAVAILABLE',
        }),
      );
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([message(1)]);
    vi.mocked(messagerieApi.envoyerMessage).mockRejectedValue(
      new ApiError(409, 'RECIPIENT_UNAVAILABLE', 'Ce membre ne peut pas recevoir de message.'),
    );
    const wrapper = await monter(`/messages/${ID}`);

    await wrapper.get('#nouveau-message').setValue('Bonjour');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('form').exists()).toBe(false);
    const zone = wrapper.get('.conversation__lecture-seule');
    expect(zone.text()).toContain("Ce membre n'est plus disponible");
    expect(document.activeElement).toBe(zone.element);
    // L'historique reste lisible (R-MSG-7), sans lien vers une fiche indisponible.
    expect(wrapper.findAll('.bulle')).toHaveLength(1);
    expect(wrapper.find('h2 a').exists()).toBe(false);
  });

  it.each([
    ['MESSAGING_DISABLED', 'Les messages privés sont désactivés'],
    ['PROFILE_NOT_APPROVED', 'Votre profil doit être approuvé'],
  ] as const)('envoi impossible (%s) : explication en clair au lieu du formulaire', async (code, texte) => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation({ canSend: false, cannotSendReason: code }));
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([message(1)]);
    const wrapper = await monter(`/messages/${ID}`);

    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.get('.conversation__lecture-seule').text()).toContain(texte);
    expect(wrapper.get('.conversation__lecture-seule a').attributes('href')).toBe('/mon-profil');
  });

  it('« Actualiser » ajoute les nouveaux messages et annonce leur nombre', async () => {
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages)
      .mockResolvedValueOnce([message(1), message(2)])
      .mockResolvedValueOnce([message(1), message(2), message(3), message(5)])
      .mockResolvedValueOnce([message(1), message(2), message(3), message(5)]);
    const wrapper = await monter(`/messages/${ID}`);

    await wrapper.get('.conversation__entete button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.bulle')).toHaveLength(4);
    expect(annonce(wrapper)).toBe('2 nouveaux messages.');
    expect(document.activeElement?.id).toBe('titre-messages');

    await wrapper.get('.conversation__entete button').trigger('click');
    await flushPromises();
    expect(annonce(wrapper)).toBe('Aucun nouveau message.');
  });
});

describe('« Écrire un message » depuis la fiche d’un membre', () => {
  const marcel: PublicProfile = {
    userId: MARCEL,
    displayName: 'Marcel',
    bio: null,
    lookingFor: [],
    interests: [],
    location: { cityName: 'Toulouse', departmentCode: '31' },
    isOrganizer: true,
    acceptsMessages: true,
    memberSince: '2026-09',
  };

  it('ouvre la conversation (nouvelle ou existante)', async () => {
    vi.mocked(decouverteApi.fetchProfile).mockResolvedValue(marcel);
    vi.mocked(messagerieApi.demarrerConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchConversation).mockResolvedValue(conversation());
    vi.mocked(messagerieApi.fetchMessages).mockResolvedValue([]);
    const wrapper = await monter(`/membres/${MARCEL}`);

    await wrapper.get('.fiche-membre__ecrire button').trigger('click');
    await flushPromises();

    expect(messagerieApi.demarrerConversation).toHaveBeenCalledWith(MARCEL);
    expect(router.currentRoute.value.fullPath).toBe(`/messages/${ID}`);
  });

  it('pas de sortie commune : le refus est expliqué près du bouton', async () => {
    vi.mocked(decouverteApi.fetchProfile).mockResolvedValue(marcel);
    vi.mocked(messagerieApi.demarrerConversation).mockRejectedValue(
      new ApiError(403, 'NOT_ELIGIBLE', 'Aucune sortie commune ne permet ce contact.'),
    );
    const wrapper = await monter(`/membres/${MARCEL}`);

    await wrapper.get('.fiche-membre__ecrire button').trigger('click');
    await flushPromises();

    const refus = wrapper.get('.fiche-membre__ecrire [role="alert"]');
    expect(refus.text()).toBe(
      'Aucune sortie commune ne permet ce contact. Vous pourrez écrire à Marcel après avoir participé à une même sortie.',
    );
    expect(document.activeElement).toBe(refus.element);
    expect(router.currentRoute.value.name).toBe('membre');
  });

  it("membre qui n'accepte pas les messages : pas de bouton", async () => {
    vi.mocked(decouverteApi.fetchProfile).mockResolvedValue({ ...marcel, acceptsMessages: false });
    const wrapper = await monter(`/membres/${MARCEL}`);

    expect(wrapper.find('.fiche-membre__ecrire').exists()).toBe(false);
    expect(useSessionStore().estApprouve).toBe(true);
  });
});
