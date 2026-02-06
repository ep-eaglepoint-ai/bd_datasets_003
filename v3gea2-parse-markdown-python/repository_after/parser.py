from html import escape
from textwrap import dedent

MAX_INLINE_CHARS = 100_000


def parse_markdown(markdown: str) -> str:
    if not markdown or markdown.strip() == "":
        return ""

    lines = dedent(markdown).splitlines()
    output = []
    i = 0
    n = len(lines)

    def parse_inline(text: str) -> str:
        if len(text) > MAX_INLINE_CHARS:
            return escape(text)

        result = []
        i = 0
        L = len(text)

        while i < L:
            ch = text[i]

            if ch == "`":
                end = text.find("`", i + 1)
                if end != -1:
                    result.append("<code>" + escape(text[i + 1:end]) + "</code>")
                    i = end + 1
                else:
                    result.append(escape(ch))
                    i += 1

            # Bold (** or __)
            elif text.startswith("**", i) or text.startswith("__", i):
                delim = text[i:i + 2]
                end = text.find(delim, i + 2)
                if end != -1:
                    inner = text[i + 2:end]
                    result.append("<strong>" + parse_inline(inner) + "</strong>")
                    i = end + 2
                else:
                    result.append(escape(delim))
                    i += 2

            # Italic (* or _)
            elif ch in ("*", "_"):
                if i+1 < L and text[i + 1] == ch:
                    result.append(escape(ch * 2))
                    i += 2
                    continue

                end = i + 1
                while True:
                    end = text.find(ch, end)
                    if end == -1:
                        break
                    if not (end + 1 < L and text[end + 1] == ch):
                        break
                    end += 2

                if end != -1:
                    inner = text[i + 1:end]
                    result.append("<em>" + parse_inline(inner) + "</em>")
                    i = end + 1
                else:
                    result.append(escape(ch))
                    i += 1

            # Link
            elif ch == "[":
                close_bracket = text.find("]", i + 1)
                if (
                    close_bracket != -1
                    and close_bracket + 1 < L
                    and text[close_bracket + 1] == "("
                ):
                    close_paren = text.find(")", close_bracket + 2)
                    if close_paren != -1:
                        label = escape(text[i + 1:close_bracket])
                        url = text[close_bracket + 2:close_paren].strip()
                        if not url.lower().startswith("javascript:"):
                            result.append(
                                f'<a href="{escape(url, quote=True)}">{label}</a>'
                            )
                        else:
                            result.append(label)
                        i = close_paren + 1
                        continue
                result.append(escape(ch))
                i += 1

            else:
                result.append(escape(ch))
                i += 1

        return "".join(result)

    # List parsing (recursive)
    def parse_list(start: int, base_indent: int):
        html = []
        i = start
        n = len(lines)
        stack = [] 

        while i < n:
            line = lines[i]
            if not line.strip():
                break

            indent = len(line) - len(line.lstrip(" "))
            stripped = line.lstrip(" ")

            if stripped.startswith(("- ", "* ", "+ ")):
                ltype = "ul"
                content = stripped[2:]
            else:
                j = 0
                while j < len(stripped) and stripped[j].isdigit():
                    j += 1
                if j > 0 and j < len(stripped) and stripped[j] == "." and stripped[j + 1:j + 2] == " ":
                    ltype = "ol"
                    content = stripped[j + 2:]
                else:
                    break  # not a list

            while stack and indent < stack[-1][1]:
                html.append(f"</{stack.pop()[0]}>")

            if not stack or ltype != stack[-1][0] or indent > stack[-1][1]:
                html.append(f"<{ltype}>")
                stack.append((ltype, indent))

            html.append(f"<li>{parse_inline(content)}</li>")
            i += 1

        while stack:
            html.append(f"</{stack.pop()[0]}>")

        return "".join(html), i

    # Main block parser
    while i < n:
        line = lines[i]

        if line.startswith("```"):
            lang = line[3:].strip()
            i += 1
            code = []
            while i < n and not lines[i].startswith("```"):
                code.append(escape(lines[i]))
                i += 1
            i += 1
            class_attr = f' class="language-{escape(lang)}"' if lang else ""
            output.append(
                "<pre><code" + class_attr + ">\n" +
                "\n".join(code) +
                "\n</code></pre>"
            )
            continue

        if line.strip() in ("---", "***", "___"):
            output.append("<hr>")
            i += 1
            continue

        stripped = line.lstrip()
        hashes = 0
        while hashes < len(stripped) and stripped[hashes] == "#":
            hashes += 1
        if 1 <= hashes <= 6 and stripped[hashes:hashes + 1] == " ":
            text = stripped[hashes + 1:].rstrip("# ").strip()
            output.append(f"<h{hashes}>{parse_inline(text)}</h{hashes}>")
            i += 1
            continue

        stripped = line.lstrip(" ")
        indent = len(line) - len(stripped)
        if stripped.startswith(("- ", "* ", "+ ")) or (
            stripped and stripped[0].isdigit() and "." in stripped
        ):
            html, i = parse_list(i, indent)
            output.append(html)
            continue

        if line.strip():
            para = [line.strip()]
            i += 1
            while i < n and lines[i].strip():
                para.append(lines[i].strip())
                i += 1
            output.append(f"<p>{parse_inline(' '.join(para))}</p>")
            continue

        i += 1

    return "\n".join(output)