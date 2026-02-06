
# Trajectory: High-Performance Streaming Markdown Parser

## The Problem: Memory Exhaustion and Complex Lookahead

Right now, most standard Markdown parsers act like a person who has to read an entire book before they can tell you what happened on page one. If that book is 10,000 pages long (a multi-gigabyte text file), the server will run out of memory (OOM) and crash.

Additionally, Markdown uses the same character (`*`) for multiple things—italics, bold, or just a bullet point. Without using complex "Regular Expressions" (which are slow and memory-heavy), it is difficult for a computer to know exactly what a `*` means until it sees what comes after it.

## The Solution: A Streaming Finite State Machine (FSM)

Instead of reading the whole file, we use a **Streaming FSM**. Think of this like a person reading a ticker tape one letter at a time:

1. **State Management:** The parser always knows its "context." If it is at the start of a line, it looks for `#` (Headers). If it is in the middle of a sentence, it looks for `*` (Emphasis).
2. **Constant Memory:** By using Go's `io.Reader` and `io.Writer`, we only ever keep a single character (a `rune`) in memory at a time. This allows the parser to process a 10GB file using only a few kilobytes of RAM.
3. **Atomic "Unreading":** If the parser sees a `#` but the next character isn't a space, it realizes it's not a header. It "unreads" that character back into the stream so it can be treated as normal text.

## Implementation Steps

1. **Rune-by-Rune Processing:** We use `bufio.ReadRune()` to ensure we handle UTF-8 characters (like emojis or non-English text) correctly without "breaking" them in half.
2. **Recursive Inline Parsing:** When the parser finds a `*`, it starts a sub-process to look for the closing `*`. If it finds another `*` immediately, it levels up to "Bold" mode.
3. **List Tracking:** We use a global `inList` boolean. When a line starts with `- `, we open a `<ul>`. We keep it open across multiple lines until we hit a line that *doesn't* start with a dash.

## Why I did it this way (Refinement)

Initially, I considered closing every HTML tag (like `</i>`) as soon as the line ended.

* **Correction:** I realized that some Markdown users leave "trailing asterisks" or "broken styles" (e.g., `Text *italic without end`). I refined the logic to be "forgiving"—if a marker isn't closed properly, the parser avoids generating broken HTML tags to keep the output clean.

## Testing

We use a **Table-Driven Test** suite. Instead of writing 20 different functions, we created a list of "Inputs" and "Expected Outputs."

* **Simulated Streaming:** Our tests use `bytes.Buffer` to simulate a real-time data stream. This proves that our parser works exactly the same way whether it's reading from a local file or a live network connection.

---

### 📚 Recommended Resources

**1. Watch: Go Interfaces (Reader/Writer) Explained**
A guide to understanding why streaming data is the "Go way" to handle large files.

* [YouTube: io.Reader and io.Writer in Go](https://www.google.com/search?q=https://www.youtube.com/watch%3Fv%3Dh7RnhTuc_88)

**2. Watch: Writing a Parser from Scratch**
A visual explanation of how a Finite State Machine (FSM) handles text without Regular Expressions.

* [YouTube: Building a Simple Parser](https://www.google.com/search?q=https://www.youtube.com/watch%3Fv%3DN5tYFp_TID0)

**3. Read: Strings, Runes, and UTF-8 in Go**
Understanding why we process "Runes" instead of "Bytes" to support international languages.

* [Article: The Go Blog - Strings and Runes](https://go.dev/blog/strings)