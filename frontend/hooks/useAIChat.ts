import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/socket/socket';

interface AITypingState {
  [conversationId: string]: boolean;
}

export function useAIChat(conversationId: string) {
  const [isAITyping, setIsAITyping] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onAITyping = (data: {
      conversationId: string;
      isTyping: boolean;
    }) => {
      if (data.conversationId === conversationId) {
        setIsAITyping(data.isTyping);
      }
    };

    socket.on('ai:typing', onAITyping);

    return () => { socket.off('ai:typing', onAITyping); };
  }, [conversationId]);

  // Helper to append @ai to message text
  const insertAIMention = useCallback((currentText: string): string => {
    if (!currentText || currentText.endsWith(' ')) {
      return currentText + '@ai ';
    }
    return currentText + ' @ai ';
  }, []);

  return { isAITyping, insertAIMention };
}
