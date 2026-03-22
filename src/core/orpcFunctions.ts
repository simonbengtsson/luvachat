import { RPCHandler } from "@orpc/server/fetch"
import {
  createConversation,
  deleteConversation,
  getConversationById,
  getConversations,
  getDirectConversationByMemberIds,
  markConversationViewed,
} from "./orpc/conversations"
import { getMessages, sendDirectMessage, sendMessage } from "./orpc/messages"
import {
  deletePushSubscription,
  getVapidPublicKey,
  savePushSubscription,
} from "./orpc/push"

export const orpcRouter = {
  getConversations,
  getConversationById,
  createConversation,
  deleteConversation,
  getMessages,
  sendMessage,
  getDirectConversationByMemberIds,
  sendDirectMessage,
  markConversationViewed,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
}

export const orpcHandler = new RPCHandler(orpcRouter)
