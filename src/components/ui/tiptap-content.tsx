import type { JSONContent } from "@tiptap/react"
import type { ReactNode } from "react"
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
  return (
    <div
      className={cn(
        "text-sm leading-relaxed [&_a]:break-words [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-6 [&_blockquote]:italic [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:break-words [&_p]:leading-6 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:text-zinc-50 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc [&_li]:mt-2",
        className,
      )}
    >
      {renderNodes(content.content ?? [], "root")}
    </div>
  )
}

export function serializeTiptapContentAsHtml(content: JSONContent): string {
  return serializeNodesAsHtml(content.content ?? [])
}

function renderNodes(nodes: JSONContent[], path: string): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, `${path}-${index}`))
}

function renderNode(node: JSONContent, key: string): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderInlineContent(node.content ?? [], key)}</p>
    case "text":
      return renderTextNode(node, key)
    case "hardBreak":
      return <br key={key} />
    case "bulletList":
      return <ul key={key}>{renderNodes(node.content ?? [], key)}</ul>
    case "orderedList":
      return <ol key={key}>{renderNodes(node.content ?? [], key)}</ol>
    case "listItem":
      return <li key={key}>{renderNodes(node.content ?? [], key)}</li>
    case "blockquote":
      return <blockquote key={key}>{renderNodes(node.content ?? [], key)}</blockquote>
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{extractPlainText(node)}</code>
        </pre>
      )
    case "heading":
      return renderHeading(node, key)
    default:
      if (node.type?.endsWith("-mention")) {
        return renderMention(node, key)
      }

      return <span key={key}>{renderNodes(node.content ?? [], key)}</span>
  }
}

function renderInlineContent(nodes: JSONContent[], path: string) {
  return nodes.map((node, index) => renderNode(node, `${path}-inline-${index}`))
}

function renderTextNode(node: JSONContent, key: string) {
  const text = node.text ?? ""
  return applyMarks(text, node.marks, key)
}

function renderMention(node: JSONContent, key: string) {
  const label = typeof node.attrs?.label === "string" ? node.attrs.label : ""
  return (
    <span
      key={key}
      className="rounded-sm bg-primary px-2 py-0.5 text-primary-foreground"
      title={label}
    >
      @{label}
    </span>
  )
}

function renderHeading(node: JSONContent, key: string) {
  const level = getHeadingLevel(node)
  const children = renderInlineContent(node.content ?? [], key)

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
      return `<p>${serializeNodesAsHtml(node.content ?? [])}</p>`
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
        const label =
          typeof node.attrs?.label === "string" ? node.attrs.label : ""
        return `<span data-mention="true">@${escapeHtml(label)}</span>`
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
