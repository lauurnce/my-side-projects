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

export function Markdown({ children }: { children: string }) {
  return (
    <div className={styles.markdown} dir="auto">
      <ReactMarkdown components={components} urlTransform={safeMarkdownUrl}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
