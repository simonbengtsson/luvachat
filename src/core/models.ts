import type {
  Conversation,
  Message,
  MessageAttachment,
  MessageMention,
} from "./schema"

export type ConversationWithUserState = Conversation & {
  memberIds: string[]
  lastViewedAt: string | null
  lastMessageAt: string | null
}

export type EnrichedMessage = Message & {
  attachments: MessageAttachment[]
  mentions: MessageMention[]
  threadReplyCount: number
  threadLastReplyAt: string | null
}
