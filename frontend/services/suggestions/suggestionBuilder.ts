import { LinkedCluster, SuggestionCard, SuggestionAction } from '../../types/suggestions';
import { colors } from '../../constants/theme';

let actionIdCounter = 0;
const newActionId = () => `action_${Date.now()}_${actionIdCounter++}`;

const PRIORITY_COLORS: Record<string, string> = {
  urgent: colors.rose,
  high: '#f97316',
  medium: colors.primary,
  low: colors.green,
};

export function buildSuggestionCard(cluster: LinkedCluster): SuggestionCard | null {
  if (cluster.intents.length === 0) return null;

  const uniqueChats = getUniqueChats(cluster);
  const content = buildContent(cluster, uniqueChats);
  
  if (!content) return null;

  const actions = buildActions(cluster, uniqueChats);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 3600000);

  return {
    id: `suggestion_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...content,
    accentColor: PRIORITY_COLORS[cluster.priority] || colors.primary,
    actions,
    sourceChats: uniqueChats,
    cluster,
    priority: cluster.priority,
    createdAt: now,
    expiresAt,
    isDismissed: false,
    isActedOn: false,
  };
}

function buildContent(
  cluster: LinkedCluster,
  uniqueChats: { id: string; name: string }[]
): Pick<SuggestionCard, 'headline' | 'subheadline' | 'bodyText' | 'emoji'> | null {
  const chatNames = uniqueChats.map(c => c.name).join(', ');
  const dates = cluster.sharedEntities.dates?.[0] || '';
  const senders = [...new Set(cluster.intents.map(i => i.senderName))].join(', ');

  // Multiple chats mention same date
  if (cluster.linkType === 'same_date' && cluster.intents.length >= 2) {
    return {
      emoji: '📅',
      headline: `${dates || 'This day'} is getting busy`,
      subheadline: `${cluster.intents.length} chats connected`,
      bodyText: cluster.intents.map(i => `• ${i.senderName}: "${truncate(i.originalText, 50)}"`).join('\n'),
    };
  }

  // Multiple location requests
  if (cluster.linkType === 'location_context' && cluster.intents.length >= 2) {
    return {
      emoji: '📍',
      headline: `${cluster.intents.length} people asking where you are`,
      subheadline: chatNames,
      bodyText: cluster.intents.map(i => `• ${i.senderName}: "${truncate(i.originalText, 50)}"`).join('\n'),
    };
  }

  // Single location request
  if (cluster.intents[0].type === 'location_request') {
    return {
      emoji: '📍',
      headline: `${senders} wants to know your location`,
      subheadline: uniqueChats[0]?.name || '',
      bodyText: `"${truncate(cluster.intents[0].originalText, 80)}"`,
    };
  }

  // Dinner invite
  if (cluster.intents[0].type === 'dinner_invite') {
    return {
      emoji: '🍽️',
      headline: `${senders} invited you to dinner`,
      subheadline: uniqueChats[0]?.name || '',
      bodyText: `"${truncate(cluster.intents[0].originalText, 80)}"`,
    };
  }

  // Urgent response
  if (cluster.intents[0].type === 'urgent_response') {
    return {
      emoji: '🚨',
      headline: `Urgent message from ${senders}`,
      subheadline: uniqueChats[0]?.name || '',
      bodyText: `"${truncate(cluster.intents[0].originalText, 80)}"`,
    };
  }

  // Meeting schedule
  if (cluster.intents[0].type === 'meeting_schedule') {
    return {
      emoji: '📋',
      headline: `Meeting request from ${senders}`,
      subheadline: uniqueChats[0]?.name || '',
      bodyText: `"${truncate(cluster.intents[0].originalText, 80)}"`,
    };
  }

  return null;
}

function buildActions(
  cluster: LinkedCluster,
  uniqueChats: { id: string; name: string }[]
): SuggestionAction[] {
  const actions: SuggestionAction[] = [];
  const primaryChatId = cluster.intents[0]?.sourceChatId;

  // Location request
  if (cluster.intents[0].type === 'location_request') {
    actions.push(
      { id: newActionId(), label: 'Share Location', emoji: '📍', type: 'share_location', targetChatId: primaryChatId, isPrimary: true, payload: {} },
      { id: newActionId(), label: 'Open Chat', emoji: '💬', type: 'open_chat', targetChatId: primaryChatId, isPrimary: false, payload: {} }
    );
    return actions;
  }

  // Dinner invite
  if (cluster.intents[0].type === 'dinner_invite') {
    actions.push(
      { id: newActionId(), label: "I'll be there", emoji: '✅', type: 'reply_yes', targetChatId: primaryChatId, isPrimary: true, payload: { text: "I'll be there! 🍽️" } },
      { id: newActionId(), label: "Can't make it", emoji: '❌', type: 'reply_no', targetChatId: primaryChatId, isPrimary: false, payload: { text: "Sorry I can't make it 😔" } }
    );
    return actions;
  }

  // Same date (multiple chats)
  if (cluster.linkType === 'same_date' && cluster.intents.length >= 2) {
    uniqueChats.slice(0, 2).forEach((chat, i) => {
      actions.push({
        id: newActionId(),
        label: `Reply to ${chat.name}`,
        emoji: '💬',
        type: 'open_chat',
        targetChatId: chat.id,
        isPrimary: i === 0,
        payload: {},
      });
    });
    return actions;
  }

  // Default
  actions.push(
    { id: newActionId(), label: 'Open Chat', emoji: '💬', type: 'open_chat', targetChatId: primaryChatId, isPrimary: true, payload: {} },
    { id: newActionId(), label: 'Dismiss', emoji: '✕', type: 'dismiss_all', isPrimary: false, payload: {} }
  );

  return actions;
}

function getUniqueChats(cluster: LinkedCluster): { id: string; name: string }[] {
  const seen = new Set<string>();
  const result: { id: string; name: string }[] = [];

  for (const intent of cluster.intents) {
    if (!seen.has(intent.sourceChatId)) {
      seen.add(intent.sourceChatId);
      result.push({ id: intent.sourceChatId, name: intent.sourceChatName });
    }
  }

  return result;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + '…';
}

export function buildAllSuggestions(clusters: LinkedCluster[]): SuggestionCard[] {
  const cards: SuggestionCard[] = [];

  for (const cluster of clusters) {
    if (cluster.intents.length === 1 && cluster.intents[0].confidence < 0.4) continue;
    
    const card = buildSuggestionCard(cluster);
    if (card) cards.push(card);
  }

  return cards;
}
