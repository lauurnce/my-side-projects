import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown, safeMarkdownUrl } from "@/components/ui/Markdown";

afterEach(cleanup);

const dangerous = "script, iframe, style, svg, form, base, img, input, object, embed, link, meta";

describe("Markdown", () => {
  it("renders a script tag as text and creates no element from raw HTML", () => {
    const { container } = render(
      <Markdown>{'Before <script>alert("x")</script> after\n\n<img src="https://evil.example/p.gif" onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n<form action="https://evil.example"><input name="password"></form>'}</Markdown>,
    );
    expect(container.querySelector(dangerous)).toBeNull();
    expect(container.textContent).toContain('<script>alert("x")</script>');
    expect(container.textContent).toContain("<iframe");
  });

  it("never loads an image, inline or by reference", () => {
    const { container } = render(
      <Markdown>{"![chart](https://evil.example/p.gif?lesson=42)\n\n![ref][t]\n\n[t]: https://evil.example/q.gif\n\n![data](data:image/png;base64,AAAA)"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://evil.example/p.gif?lesson=42",
      "https://evil.example/q.gif",
    ]);
    expect(container.textContent).toContain("data");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example",
    "/hub",
    "irc://evil.example",
    "xmpp:someone@evil.example",
  ])("does not make a link for %s", (target) => {
    const { container } = render(<Markdown>{`[click me](${target})`}</Markdown>);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("click me");
  });

  it("keeps http, https and mailto links with safe rel and no target", () => {
    render(<Markdown>{"[docs](https://example.com/a) and [mail](mailto:teacher@example.com)"}</Markdown>);
    const [docs, mail] = screen.getAllByRole("link");
    expect(docs.getAttribute("href")).toBe("https://example.com/a");
    expect(docs.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(docs.hasAttribute("target")).toBe(false);
    expect(docs.textContent).toBe("docs (example.com)");
    expect(mail.getAttribute("href")).toBe("mailto:teacher@example.com");
  });

  it("shows the real host beside link text that names another site", () => {
    render(<Markdown>{"[https://penta.example/login](https://evil.example/login)"}</Markdown>);
    expect(screen.getByRole("link").textContent).toContain("(evil.example)");
  });

  it("never produces an h1 from the body", () => {
    const { container } = render(<Markdown>{"# One\n\n## Two\n\n###### Six"}</Markdown>);
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("One");
    expect(container.querySelector("h3")?.textContent).toBe("Two");
    expect(container.querySelector("h6")?.textContent).toBe("Six");
  });

  it("renders plain markdown: emphasis, lists and code", () => {
    const { container } = render(<Markdown>{"**bold** and `code`\n\n- one\n- two\n\n```\nlong line\n```"}</Markdown>);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("pre code")?.textContent).toContain("long line");
  });

  it("does not render task list checkboxes or tables", () => {
    const { container } = render(<Markdown>{"- [ ] task\n\n| a | b |\n| - | - |\n| 1 | 2 |"}</Markdown>);
    expect(container.querySelector("input, table")).toBeNull();
  });

  it("renders a 50,000 character body", () => {
    const { container } = render(<Markdown>{"word ".repeat(10000)}</Markdown>);
    expect(container.textContent?.length).toBeGreaterThan(49000);
  });
});

describe("safeMarkdownUrl", () => {
  it("keeps only http, https and mailto", () => {
    expect(safeMarkdownUrl("https://a.example")).toBe("https://a.example");
    expect(safeMarkdownUrl("HTTP://a.example")).toBe("HTTP://a.example");
    expect(safeMarkdownUrl("mailto:a@b.example")).toBe("mailto:a@b.example");
    expect(safeMarkdownUrl(" javascript:alert(1)")).toBe("");
    expect(safeMarkdownUrl("/\\evil.example")).toBe("");
    expect(safeMarkdownUrl("")).toBe("");
  });
});
