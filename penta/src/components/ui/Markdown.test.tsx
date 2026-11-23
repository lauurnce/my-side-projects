import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanPostText, Markdown, PostMarkdown, safeMarkdownUrl, safePostUrl } from "@/components/ui/Markdown";

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

describe("PostMarkdown", () => {
  function html(body: string): string {
    return render(<PostMarkdown>{body}</PostMarkdown>).container.innerHTML;
  }

  it("renders a script tag as text", () => {
    const { container } = render(<PostMarkdown>{"hello <script>window.postScriptRan = true</script>"}</PostMarkdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>window.postScriptRan = true</script>");
    expect((window as { postScriptRan?: boolean }).postScriptRan).toBeUndefined();
  });

  it.each([
    "<img src=x onerror=alert(1)>",
    "<iframe src=https://evil.example></iframe>",
    "<svg onload=alert(1)>",
    "<style>body{display:none}</style>",
    "<b>bold</b> <!-- c -->",
  ])("never turns raw markup into an element: %s", (body) => {
    const { container } = render(<PostMarkdown>{body}</PostMarkdown>);
    expect(container.querySelector("img, iframe, svg, style, b, script")).toBeNull();
  });

  it.each([
    "[a](javascript:alert(1))",
    "[a](JaVaScRiPt:alert(1))",
    "[a](data:text/html;base64,PHNjcmlwdD4=)",
    "[a](vbscript:x)",
    "<javascript:alert(1)>",
    "[a](java&#x73;cript:alert(1))",
    "[a]( javascript:alert(1))",
    "[a](/logout)",
    "[a](//evil.example)",
    "[a](mailto:t@x.example?subject=hi&bcc=a@b.example)",
    "[a][r]\n\n[r]: javascript:alert(1)",
  ])("does not make a link of %s", (body) => {
    const { container } = render(<PostMarkdown>{body}</PostMarkdown>);
    expect(container.querySelector("a")).toBeNull();
  });

  it("makes a safe link with the host shown and no opener", () => {
    const { container } = render(<PostMarkdown>{"[the docs](https://penta.edu@evil.example/x)"}</PostMarkdown>);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://penta.edu@evil.example/x");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow ugc");
    expect(link.getAttribute("target")).toBeNull();
    expect(link.textContent).toBe("the docs (evil.example)");
  });

  it("keeps the words of a heading as a paragraph", () => {
    expect(html("# Heading words\n\nbody")).toContain("<p>Heading words</p>");
    expect(html("Please help me\n===\nnext")).toContain("<p>Please help me</p>");
    expect(html("my answer is 5\n---\nnext line")).toContain("<p>my answer is 5</p>");
    const { container } = render(<PostMarkdown>{"# One\n\n## Two"}</PostMarkdown>);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
  });

  it("turns an image into a link and loads nothing", () => {
    const { container } = render(<PostMarkdown>{"![alt text](https://evil.example/p.gif)"}</PostMarkdown>);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.textContent).toBe("alt text (evil.example)");
  });

  it("keeps emphasis, code, lists, quotes and hard breaks", () => {
    const out = html("*a* **b** `c`\n\n- one\n  1. two\n\n> q  \n> r\n\n```\ncode\n```");
    for (const tag of ["<em>", "<strong>", "<code>", "<ul>", "<ol>", "<blockquote>", "<br>", "<pre>"]) {
      expect(out).toContain(tag);
    }
  });

  it("drops the language class a student chose for a code block", () => {
    const { container } = render(<PostMarkdown>{"```anything\ncode\n```"}</PostMarkdown>);
    expect(container.querySelector("code")?.getAttribute("class")).toBeNull();
  });

  it("strips hidden and direction characters written as references", () => {
    const { container } = render(<PostMarkdown>{"abc &#x202E;txt.exe &rlm; &#8238; &zwj; &#x2066; done &#8203;"}</PostMarkdown>);
    expect(container.textContent).not.toMatch(/[​-‏‪-‮⁦-⁩]/);
    expect(container.textContent).toContain("txt.exe");
  });

  it("caps stacked combining marks at three", () => {
    expect(cleanPostText(`z${"́".repeat(50)}`)).toBe(`z${"́".repeat(3)}`);
  });

  it("leaves tables and bare addresses as plain text", () => {
    const { container } = render(<PostMarkdown>{"| a | b |\n| - | - |\n\nhttps://evil.example"}</PostMarkdown>);
    expect(container.querySelector("table, a")).toBeNull();
  });

  it("only accepts http and https for post links", () => {
    expect(safePostUrl("https://a.example")).toBe("https://a.example");
    expect(safePostUrl("mailto:a@b.example")).toBe("");
    expect(safePostUrl("javascript:alert(1)")).toBe("");
  });
});
