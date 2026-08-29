# Plain-text content security boundary

Vira Enterprise GenUI does not treat "sanitized string" as a universal trust primitive.

The MVP security package authorizes one content sink only:

```text
untrusted/generated string
          |
          v
 createPlainTextContent
          |
          v
{ sink: plain-text, value }
          |
          v
   plain-text sink only
```

Markup-looking text is preserved literally. For example, `<script>alert(1)</script>` is valid `PlainTextContent` and must display as text. It is **not** authorized for `innerHTML`, SVG markup, MathML markup, script, style, or URL execution contexts.

This is intentionally stricter than adding an HTML sanitizer. Projects such as DOMPurify solve the specialized problem of sanitizing HTML/MathML/SVG DOM content. Vira can integrate a reviewed sanitizer later if a real trusted-rich-content requirement appears, but the MVP does not open an HTML sink just because a sanitizer exists.

The distinction is architectural: safety belongs to the destination sink. `PlainTextContent` names that destination explicitly rather than presenting a magical globally-safe string.
