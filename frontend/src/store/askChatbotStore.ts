import { create } from 'zustand'

/**
 * Lets any component (e.g. an "Ask AlphaSwarm" button on the Assets page)
 * open the SAME global floating chatbot (AskAlphaSwarmChatbot, mounted once
 * in AppLayout) with a pre-filled question, without a second chatbot
 * instance and without prop-drilling through the layout tree. This does
 * NOT invent a parallel Ask context system — it only pre-fills the
 * existing composer input; the actual asset context is established the
 * normal way once the user sends that first turn and the backend resolves
 * it (see useAskAlphaSwarm/buildAskContext), exactly like typing the same
 * question by hand would.
 */
interface AskChatbotState {
  open: boolean
  pendingPrompt: string | null
  openWithPrompt: (prompt: string) => void
  setOpen: (open: boolean) => void
  consumePendingPrompt: () => string | null
}

export const useAskChatbotStore = create<AskChatbotState>((set, get) => ({
  open: false,
  pendingPrompt: null,
  openWithPrompt: prompt => set({ open: true, pendingPrompt: prompt }),
  setOpen: open => set({ open }),
  consumePendingPrompt: () => {
    const prompt = get().pendingPrompt
    if (prompt !== null) set({ pendingPrompt: null })
    return prompt
  },
}))
