import { useEffect, useRef, useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { ConversationProps } from '../../types';
import { detectAllIntents } from '../../services/suggestions/intentDetector';
import { linkIntentsAcrossChats } from '../../services/suggestions/crossChatLinker';
import { buildAllSuggestions } from '../../services/suggestions/suggestionBuilder';
import { useSuggestionStore } from '../../services/suggestions/suggestionStore';

const DEBOUNCE_MS = 2000;

export function useMessageWatcher(conversations: ConversationProps[]) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const lastCountRef = useRef(0);

  const { addSuggestion, setProcessing, clearExpired, permissionGranted } = useSuggestionStore();

  const runPipeline = useCallback(
    async (currentConversations: ConversationProps[]) => {
      if (isRunningRef.current) return;
      if (!permissionGranted) return;

      isRunningRef.current = true;
      setProcessing(true);

      InteractionManager.runAfterInteractions(async () => {
        try {
          // Step 1: Detect intents
          const intents = detectAllIntents(currentConversations);
          if (intents.length === 0) {
            setProcessing(false);
            isRunningRef.current = false;
            return;
          }

          // Step 2: Link intents across chats
          const clusters = linkIntentsAcrossChats(intents);

          // Step 3: Build suggestion cards
          const cards = buildAllSuggestions(clusters);

          // Step 4: Store new suggestions
          for (const card of cards) {
            addSuggestion(card);
          }

          // Step 5: Clear expired
          clearExpired();
        } catch (err) {
          console.warn('[MessageWatcher] Pipeline error:', err);
        } finally {
          setProcessing(false);
          isRunningRef.current = false;
        }
      });
    },
    [addSuggestion, setProcessing, clearExpired, permissionGranted]
  );

  useEffect(() => {
    const totalMessages = conversations.reduce((sum, c) => sum + (c.lastMessage ? 1 : 0), 0);
    if (totalMessages === lastCountRef.current) return;
    lastCountRef.current = totalMessages;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runPipeline(conversations);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [conversations, runPipeline]);

  useEffect(() => {
    if (permissionGranted) {
      runPipeline(conversations);
    }
  }, [permissionGranted, conversations, runPipeline]);
}
