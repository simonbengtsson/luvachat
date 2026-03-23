import { RPCHandler } from "@orpc/server/fetch"
import { getActivity } from "./orpc/activity"
import {
  createConversation,
  deleteConversation,
  getConversationById,
  getConversations,
  getDirectConversationByMemberIds,
  markConversationViewed,
} from "./orpc/conversations"
import {
  getMessages,
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
  getThreads,
  sendMessage,
  toggleMessageReaction,
  getDirectConversationByMemberIds,
  sendDirectMessage,
  markConversationViewed,
  markThreadViewed,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
}

export const orpcHandler = new RPCHandler(orpcRouter)
