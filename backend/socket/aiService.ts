import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import Message from '../modals/Message.js';
import { geminiCircuitBreaker } from '../utils/circuitBreaker.js';

// Singleton Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
  generationConfig: {
    maxOutputTokens: 400,
    temperature: 0.7,
  },
});

// AI Bot MongoDB ID — set via .env after running seed script
export const AI_BOT_ID = process.env.AI_BOT_USER_ID!;

// Detect @ai mention (case-insensitive, word boundary)
export function containsAIMention(content: string): boolean {
  return /@ai\b/i.test(content);
}

// Strip @ai tag before sending to Gemini
export function stripAIMention(content: string): string {
  return content.replace(/@ai\b/gi, '').trim();
}

// Fetch last 10 messages for context window
async function buildContextWindow(conversationId: string): Promise<string> {
  try {
    const messages = await Message.find({
      conversationId,
      isDeleted: { $ne: true },
      isCallMessage: { $ne: true },
      isAI: { $ne: true }, // don't feed AI's own messages back as context
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('senderId', 'name')
      .lean();

    if (!messages.length) return '';

    return messages
      .reverse()
      .map((m: any) => `${m.senderId?.name || 'User'}: ${m.content}`)
      .join('\n');
  } catch {
    return ''; // context is optional — never block the response
  }
}

// Core AI response generator
export async function generateAIResponse(
  conversationId: string,
  userMessage: string,
  senderName: string
): Promise<string> {
  const cleanMessage = stripAIMention(userMessage);
  if (!cleanMessage) return "What would you like to ask me? 🤖";

  try {
    const context = await buildContextWindow(conversationId);

    const systemPrompt = `You are Chatzi AI, a helpful assistant built into a chat app.
Rules:
- Keep replies SHORT (1-3 sentences) unless the user asks for detail
- Plain text only — NO markdown, NO asterisks, NO bullet points
- Be conversational and friendly
- Never say "As an AI language model..."
- If asked something harmful, politely decline`;

    const fullPrompt = context
      ? `${systemPrompt}\n\nRecent chat:\n${context}\n\n${senderName} asks: ${cleanMessage}`
      : `${systemPrompt}\n\n${senderName} asks: ${cleanMessage}`;

    // Wrap Gemini API call with circuit breaker
    const result: any = await geminiCircuitBreaker.execute(() =>
      Promise.race([
        model.generateContent(fullPrompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini timeout')), 15000)
        ),
      ])
    );
    
    const text = result.response.text().trim();

    if (!text) throw new Error('Empty response from Gemini');

    return text;
  } catch (error: any) {
    console.error('[AI] Error generating response:', error.message);
    
    // Check if circuit breaker is open
    if (error.message?.includes('Circuit breaker')) {
      return "I'm temporarily unavailable. Please try again in a moment! 🤖";
    }
    
    // Handle other errors gracefully
    if (error.message?.includes('timeout')) {
      return "Sorry, I'm taking too long. Please try again! 🤖";
    }
    
    return "I ran into an issue. Try asking me again! 🤖";
  }
}
