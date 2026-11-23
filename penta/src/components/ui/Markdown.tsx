import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import styles from "./Markdown.module.css";

const safeUrl = /^(https?:\/\/|mailto:)/i;

export function safeMarkdownUrl(url: string): string {
  return safeUrl.test(url) ? url : "";
}

function hostOf(href: string): string | null {
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    return new URL(href).hostname;
  } catch {
    return null;
  }
}

function SafeLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span>{children}</span>;
  const host = hostOf(href);

  return (
    <a href={href} rel="noopener noreferrer nofollow">
      {children}
      {host ? <span className={styles.host}> ({host})</span> : null}
    </a>
  );
}

function ImageAsLink({ src, alt }: ComponentProps<"img">) {
  const href = typeof src === "string" ? src : "";
  return <SafeLink href={href}>{alt || href || "image"}</SafeLink>;
}

const components: Components = {
  a: ({ href, children }) => <SafeLink href={href}>{children}</SafeLink>,
  img: ({ src, alt }) => <ImageAsLink src={src} alt={alt} />,
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
  h5: ({ children }) => <h6>{children}</h6>,
  h6: ({ children }) => <h6>{children}</h6>,
};

type TreeNode = { type: string; value?: string; tagName?: string; properties?: object; children?: TreeNode[] };

const hiddenCharacters =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u034F\u061C\u115F\u1160\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]|[\u{E0000}-\u{E007F}]/gu;
const stackedMarks = /(\p{M}{3})\p{M}+/gu;
const postUrl = /^https?:\/\//i;
const postElements = ["p", "em", "strong", "code", "pre", "ul", "ol", "li", "blockquote", "a", "br", "img", "h1", "h2", "h3", "h4", "h5", "h6"];

export function cleanPostText(value: string): string {
  return value.replace(hiddenCharacters, "").replace(stackedMarks, "$1");
}

export function safePostUrl(url: string): string {
  return postUrl.test(url) ? url : "";
}

function cleanTree(node: TreeNode) {
  if (node.type === "text" && node.value) node.value = cleanPostText(node.value);
  if (node.type === "element" && node.tagName === "code") node.properties = {};
  for (const child of node.children ?? []) cleanTree(child);
}

function cleanPostTree() {
  return cleanTree;
}

function PostLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span>{children}</span>;
  const host = hostOf(href);

  return (
    <a href={href} rel="noopener noreferrer nofollow ugc" referrerPolicy="no-referrer">
      {children}
      {host ? <span className={styles.host}> ({host})</span> : null}
    </a>
  );
}

function asParagraph({ children }: { children?: ReactNode }) {
  return <p>{children}</p>;
}

const postComponents: Components = {
  a: ({ href, children }) => <PostLink href={href}>{children}</PostLink>,
  img: ({ src, alt }) => <PostLink href={typeof src === "string" ? src : ""}>{alt || "image"}</PostLink>,
  h1: asParagraph,
  h2: asParagraph,
  h3: asParagraph,
  h4: asParagraph,
  h5: asParagraph,
  h6: asParagraph,
};

export function PostMarkdown({ children }: { children: string }) {
  return (
    <div className={`${styles.markdown} ${styles.post}`} dir="auto">
      <ReactMarkdown
        allowedElements={postElements}
        unwrapDisallowed
        components={postComponents}
        urlTransform={safePostUrl}
        rehypePlugins={[cleanPostTree]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className={styles.markdown} dir="auto">
      <ReactMarkdown components={components} urlTransform={safeMarkdownUrl}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
