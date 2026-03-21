import type { JSONContent } from "@tiptap/react"
import { useCallback, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { orpcClient } from "@/core/orpcClient"
import { cn } from "@/lib/utils"

type TiptapContentProps = {
  content: JSONContent
  className?: string
}

type TiptapMark = NonNullable<JSONContent["marks"]>[number]

export function parseTiptapJson(
  tiptapJson: string | null | undefined,
): JSONContent | null {
  if (!tiptapJson) {
    return null
  }

  try {
    const parsed = JSON.parse(tiptapJson)
    if (!parsed || typeof parsed !== "object") {
      return null
    }

    return parsed as JSONContent
  } catch {
    return null
  }
}

export function TiptapContent({ content, className }: TiptapContentProps) {
  const navigate = useNavigate()
  const openMemberConversation = useCallback(
    async (memberId: string) => {
      try {
        const existingConversation =
          await orpcClient.getDirectConversationByMemberIds({
            memberIds: [memberId],
          })

        if (existingConversation) {
          await navigate({
            to: "/c/$conversationId",
            params: { conversationId: existingConversation.id } as any,
          })
          return
        }
      } catch (error) {
        console.error("Failed to resolve direct conversation", error)
      }

      await navigate({
        to: "/new",
        search: { members: memberId },
      })
    },
    [navigate],
  )

  return (
    <div
      className={cn(
        "text-sm leading-relaxed [&_a]:break-words [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_a[data-mention=true]]:no-underline [&_a[data-mention=true]]:hover:no-underline [&_blockquote]:mt-4 [&_blockquote:first-child]:mt-0 [&_blockquote]:border-l-2 [&_blockquote]:pl-6 [&_blockquote]:italic [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_ol]:my-0 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:break-words [&_p]:leading-6 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:text-zinc-50 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-0 [&_ul]:ml-6 [&_ul]:list-disc [&_li]:my-0 [&_li]:leading-6 [&_li>p]:inline [&_li>p]:leading-6",
        className,
      )}
    >
      {renderNodes(content.content ?? [], "root", openMemberConversation)}
    </div>
  )
}

export function serializeTiptapContentAsHtml(content: JSONContent): string {
  return serializeNodesAsHtml(content.content ?? [])
}

function renderNodes(
  nodes: JSONContent[],
  path: string,
  openMemberConversation: (memberId: string) => Promise<void>,
): ReactNode[] {
  return nodes.map((node, index) =>
    renderNode(node, `${path}-${index}`, openMemberConversation),
  )
}

function renderNode(
  node: JSONContent,
  key: string,
  openMemberConversation: (memberId: string) => Promise<void>,
): ReactNode {
  switch (node.type) {
    case "paragraph":
      if (!hasVisibleInlineContent(node)) {
        return (
          <p key={key}>
            <br />
          </p>
        )
      }

      return (
        <p key={key}>
          {renderInlineContent(node.content ?? [], key, openMemberConversation)}
        </p>
      )
    case "text":
      return renderTextNode(node, key, openMemberConversation)
    case "hardBreak":
      return <br key={key} />
    case "bulletList":
      return (
        <ul key={key}>
          {renderNodes(node.content ?? [], key, openMemberConversation)}
        </ul>
      )
    case "orderedList":
      return (
        <ol key={key}>
          {renderNodes(node.content ?? [], key, openMemberConversation)}
        </ol>
      )
    case "listItem":
      return (
        <li key={key}>
          {renderNodes(node.content ?? [], key, openMemberConversation)}
        </li>
      )
    case "blockquote":
      return (
        <blockquote key={key}>
          {renderNodes(node.content ?? [], key, openMemberConversation)}
        </blockquote>
      )
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{extractPlainText(node)}</code>
        </pre>
      )
    case "heading":
      return renderHeading(node, key, openMemberConversation)
    default:
      if (node.type?.endsWith("-mention")) {
        return renderMention(node, key, openMemberConversation)
      }

      return (
        <span key={key}>
          {renderNodes(node.content ?? [], key, openMemberConversation)}
        </span>
      )
  }
}

function renderInlineContent(
  nodes: JSONContent[],
  path: string,
  openMemberConversation: (memberId: string) => Promise<void>,
) {
  return nodes.map((node, index) =>
    renderNode(node, `${path}-inline-${index}`, openMemberConversation),
  )
}

function hasVisibleInlineContent(node: JSONContent): boolean {
  return (node.content ?? []).some((child) => {
    if (child.type === "text") {
      return Boolean(child.text)
    }

    if (child.type === "hardBreak") {
      return true
    }

    if (child.type?.endsWith("-mention")) {
      return true
    }

    return hasVisibleInlineContent(child)
  })
}

function renderTextNode(
  node: JSONContent,
  key: string,
  openMemberConversation: (memberId: string) => Promise<void>,
) {
  const text = node.text ?? ""
  return applyMarks(text, node.marks, key, openMemberConversation)
}

function renderMention(
  node: JSONContent,
  key: string,
  openMemberConversation: (memberId: string) => Promise<void>,
) {
  const id = typeof node.attrs?.id === "string" ? node.attrs.id : ""
  const label = typeof node.attrs?.label === "string" ? node.attrs.label : ""

  if (id && label) {
    return (
      <MentionConversationLink
        key={key}
        href={`/new?members=${encodeURIComponent(id)}`}
        memberId={id}
        onOpen={openMemberConversation}
        className="rounded-sm bg-foreground/10 px-2 py-0.5 font-medium text-foreground no-underline hover:no-underline"
        title={label}
      >
        @{label}
      </MentionConversationLink>
    )
  }

  return (
    <strong key={key} className="font-semibold" title={label}>
      @{label}
    </strong>
  )
}

function renderHeading(
  node: JSONContent,
  key: string,
  openMemberConversation: (memberId: string) => Promise<void>,
) {
  const level = getHeadingLevel(node)
  const children = renderInlineContent(
    node.content ?? [],
    key,
    openMemberConversation,
  )

  if (level === 1) {
    return (
      <h1 key={key} className="mt-2 text-4xl font-bold">
        {children}
      </h1>
    )
  }

  if (level === 2) {
    return (
      <h2 key={key} className="mt-8 border-b pb-2 text-2xl font-semibold">
        {children}
      </h2>
    )
  }

  if (level === 3) {
    return (
      <h3 key={key} className="mt-4 text-xl font-semibold">
        {children}
      </h3>
    )
  }

  if (level === 4) {
    return (
      <h4 key={key} className="mt-4 text-lg font-semibold">
        {children}
      </h4>
    )
  }

  if (level === 5) {
    return (
      <h5 key={key} className="mt-4 text-base font-semibold">
        {children}
      </h5>
    )
  }

  return (
    <h6 key={key} className="mt-4 text-sm font-semibold">
      {children}
    </h6>
  )
}

function applyMarks(
  content: ReactNode,
  marks: JSONContent["marks"],
  keyPrefix: string,
  openMemberConversation: (memberId: string) => Promise<void>,
): ReactNode {
  return (marks ?? []).reduce<ReactNode>((current, mark, index) => {
    const key = `${keyPrefix}-mark-${index}`

    switch (mark.type) {
      case "bold":
        return <strong key={key}>{current}</strong>
      case "italic":
        return <em key={key}>{current}</em>
      case "strike":
        return <s key={key}>{current}</s>
      case "code":
        return <code key={key}>{current}</code>
      case "link":
        if (typeof mark.attrs?.memberId === "string") {
          return (
            <MentionConversationLink
              key={key}
              href={
                typeof mark.attrs?.href === "string"
                  ? mark.attrs.href
                  : `/new?members=${encodeURIComponent(mark.attrs.memberId)}`
              }
              memberId={mark.attrs.memberId}
              onOpen={openMemberConversation}
            >
              {current}
            </MentionConversationLink>
          )
        }

        return (
          <a
            key={key}
            href={typeof mark.attrs?.href === "string" ? mark.attrs.href : undefined}
            target="_blank"
            rel="noreferrer"
          >
            {current}
          </a>
        )
      default:
        return current
    }
  }, content)
}

function MentionConversationLink({
  children,
  href,
  memberId,
  onOpen,
  className,
  title,
}: {
  children: ReactNode
  href: string
  memberId: string
  onOpen: (memberId: string) => Promise<void>
  className?: string
  title?: string
}) {
  return (
    <a
      href={href}
      data-mention="true"
      className={cn(
        "font-semibold text-foreground no-underline hover:no-underline",
        className,
      )}
      title={title}
      onClick={(event) => {
        event.preventDefault()
        void onOpen(memberId)
      }}
    >
      {children}
    </a>
  )
}

function serializeNodesAsHtml(nodes: JSONContent[]) {
  return nodes.map((node) => serializeNodeAsHtml(node)).join("")
}

function serializeNodeAsHtml(node: JSONContent): string {
  switch (node.type) {
    case "text":
      return applyHtmlMarks(escapeHtml(node.text ?? ""), node.marks)
    case "hardBreak":
      return "<br />"
    case "paragraph":
      return hasVisibleInlineContent(node)
        ? `<p>${serializeNodesAsHtml(node.content ?? [])}</p>`
        : "<p><br /></p>"
    case "bulletList":
      return `<ul>${serializeNodesAsHtml(node.content ?? [])}</ul>`
    case "orderedList":
      return `<ol>${serializeNodesAsHtml(node.content ?? [])}</ol>`
    case "listItem":
      return `<li>${serializeNodesAsHtml(node.content ?? [])}</li>`
    case "blockquote":
      return `<blockquote>${serializeNodesAsHtml(node.content ?? [])}</blockquote>`
    case "codeBlock":
      return `<pre><code>${escapeHtml(extractPlainText(node))}</code></pre>`
    case "heading": {
      const level = getHeadingLevel(node)
      return `<h${level}>${serializeNodesAsHtml(node.content ?? [])}</h${level}>`
    }
    default:
      if (node.type?.endsWith("-mention")) {
        const id = typeof node.attrs?.id === "string" ? node.attrs.id : ""
        const label =
          typeof node.attrs?.label === "string" ? node.attrs.label : ""
        const href = id ? `/new?members=${encodeURIComponent(id)}` : ""
        return href
          ? `<a data-mention="true" href="${escapeHtmlAttribute(href)}"><strong>@${escapeHtml(label)}</strong></a>`
          : `<strong data-mention="true">@${escapeHtml(label)}</strong>`
      }

      return serializeNodesAsHtml(node.content ?? [])
  }
}

function applyHtmlMarks(content: string, marks: JSONContent["marks"]) {
  return (marks ?? []).reduce((current, mark) => {
    switch (mark.type) {
      case "bold":
        return `<strong>${current}</strong>`
      case "italic":
        return `<em>${current}</em>`
      case "strike":
        return `<s>${current}</s>`
      case "code":
        return `<code>${current}</code>`
      case "link":
        return `<a href="${escapeHtmlAttribute(
          typeof mark.attrs?.href === "string" ? mark.attrs.href : "",
        )}" target="_blank" rel="noreferrer">${current}</a>`
      default:
        return current
    }
  }, content)
}

function extractPlainText(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? ""
  }

  if (node.type === "hardBreak") {
    return "\n"
  }

  if (node.type?.endsWith("-mention")) {
    const label = typeof node.attrs?.label === "string" ? node.attrs.label : ""
    return `@${label}`
  }

  return (node.content ?? []).map((child) => extractPlainText(child)).join("")
}

function getHeadingLevel(node: JSONContent) {
  const level = Number(node.attrs?.level)
  if (Number.isInteger(level) && level >= 1 && level <= 6) {
    return level
  }

  return 1
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value)
}
