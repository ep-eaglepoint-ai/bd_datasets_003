import markdown
import bleach

class MarkdownService:
    # Allowed tags and attributes for sanitization
    ALLOWED_TAGS = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'strong', 'em', 'u', 's', 'ol', 'ul', 'li',
        'blockquote', 'code', 'pre', 'hr', 'a', 'img', 'table',
        'thead', 'tbody', 'tr', 'th', 'td'
    ]
    
    ALLOWED_ATTRIBUTES = {
        'a': ['href', 'title'],
        'img': ['src', 'alt', 'title']
    }

    @staticmethod
    def render_to_html(content: str) -> str:
        """
        Renders markdown to HTML and sanitizes the output.
        """
        # Convert Markdown to HTML
        # Using common extensions for better output
        html = markdown.markdown(content, extensions=['extra', 'codehilite'])
        
        # Sanitize HTML
        sanitized_html = bleach.clean(
            html,
            tags=MarkdownService.ALLOWED_TAGS,
            attributes=MarkdownService.ALLOWED_ATTRIBUTES
        )
        
        return sanitized_html

    @staticmethod
    def sanitize_markdown(content: str) -> str:
        """
        Sanitizes raw markdown content to ensure no malicious tags are stored.
        """
        # We sanitize the raw content to remove any embedded HTML scripts/styles
        # while keeping the markdown syntax intact.
        return bleach.clean(
            content,
            tags=MarkdownService.ALLOWED_TAGS,
            attributes=MarkdownService.ALLOWED_ATTRIBUTES,
            strip=True
        )
