import { RPCHandler } from "@orpc/server/fetch"
import { getActivity } from "./orpc/activity"
import {
  createConversation,
  deleteConversation,
  getConversationById,
  getConversations,
  getDirectConversationByMemberIds,
  markConversationViewed,
  setConversationNotificationLevel,
} from "./orpc/conversations"
import {
  getMessages,
  searchMessages,
  getThreads,
  markThreadViewed,
  sendDirectMessage,
  sendMessage,
  toggleMessageReaction,
} from "./orpc/messages"
import {
  deletePushSubscription,
  getVapidPublicKey,
  savePushSubscription,
} from "./orpc/push"

export const orpcRouter = {
  getActivity,
  getConversations,
  getConversationById,
  createConversation,
  deleteConversation,
  getMessages,
  searchMessages,
  getThreads,
  sendMessage,
  toggleMessageReaction,
  getDirectConversationByMemberIds,
  sendDirectMessage,
  markConversationViewed,
  setConversationNotificationLevel,
  markThreadViewed,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
}

export const orpcHandler = new RPCHandler(orpcRouter)
