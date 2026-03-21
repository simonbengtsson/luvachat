import type { Member } from "./luvabase"
import type { ConversationWithUserState } from "./schema"

type DisplayConversation = Pick<
  ConversationWithUserState,
  "id" | "type" | "name" | "memberIds"
>

export function getConversationDisplayName(
  conversation: DisplayConversation,
  currentUserId: string,
  membersById: Map<string, Member>,
): string {
  if (conversation.type === "direct") {
    const otherMemberId = conversation.memberIds.find(
      (memberId) => memberId !== currentUserId,
    )

    if (!otherMemberId) {
      return conversation.name ?? conversation.id
    }

    return membersById.get(otherMemberId)?.name ?? otherMemberId
  }

  if (conversation.type === "group") {
    const participantIds = conversation.memberIds.filter(
      (memberId) => memberId !== currentUserId,
    )

    if (participantIds.length === 0) {
      return conversation.name ?? conversation.id
    }

    return participantIds
      .map((memberId) => membersById.get(memberId)?.name ?? memberId)
      .join(", ")
  }

  return conversation.name ?? conversation.id
}
