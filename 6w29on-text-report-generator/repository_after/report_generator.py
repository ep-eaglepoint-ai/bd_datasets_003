from typing import List, Dict, Any
from datetime import datetime


class ReportGenerator:
    def __init__(self):
        self.header = ""
        self.footer = ""
    
    def set_header(self, title: str, date: datetime) -> None:
        parts = []
        parts.append("=" * 60)
        parts.append("\n")
        parts.append(f"{title.upper()}")
        parts.append("\n")
        parts.append(f"Generated: {date.strftime('%Y-%m-%d %H:%M:%S')}")
        parts.append("\n")
        parts.append("=" * 60)
        parts.append("\n")
        self.header = "".join(parts)
    
    def set_footer(self, author: str, page_count: int) -> None:
        parts = []
        parts.append("-" * 60)
        parts.append("\n")
        parts.append(f"Author: {author}")
        parts.append("\n")
        parts.append(f"Pages: {page_count}")
        parts.append("\n")
        parts.append("-" * 60)
        self.footer = "".join(parts)
    
    def build_table(self, headers: List[str], rows: List[List[Any]], 
                    col_width: int = 15) -> str:
        table_parts = []
        
        # Header line
        header_cells = []
        for header in headers:
            cell = str(header)
            if len(cell) < col_width:
                cell = cell + (" " * (col_width - len(cell)))
            cell = cell[:col_width]
            header_cells.append(cell)
        
        header_line = "|" + "|".join(header_cells) + "|"
        table_parts.append(header_line)
        table_parts.append("\n")

        # Separator line
        sep_parts = []
        for _ in headers:
            sep_parts.append("-" * col_width)
        sep_line = "+" + "+".join(sep_parts) + "+"
        table_parts.append(sep_line)
        table_parts.append("\n")

        # Rows
        for row in rows:
            row_cells = []
            for cell_value in row:
                cell = str(cell_value)
                if len(cell) < col_width:
                    cell = cell + (" " * (col_width - len(cell)))
                cell = cell[:col_width]
                row_cells.append(cell)
            row_line = "|" + "|".join(row_cells) + "|"
            table_parts.append(row_line)
            table_parts.append("\n")
            
        return "".join(table_parts)
    
    def build_summary(self, data: Dict[str, Any]) -> str:
        parts = []
        parts.append("\nSUMMARY\n")
        parts.append("-" * 40 + "\n")
        for key, value in data.items():
            parts.append(f"{key}: {value}\n")
        return "".join(parts)
    
    def build_list(self, title: str, items: List[str], numbered: bool = False) -> str:
        parts = []
        parts.append("\n" + title + "\n")
        parts.append("-" * len(title) + "\n")
        index = 1
        for item in items:
            if numbered:
                prefix = f"{index}. "
                index = index + 1
            else:
                prefix = "• "
            parts.append(f"{prefix}{item}\n")
        return "".join(parts)
    
    def analyze_text(self, text: str) -> Dict[str, int]:
        stats = {}
        char_count = 0
        letter_count = 0
        digit_count = 0
        space_count = 0
        newline_count = 0
        word_count = 0
        in_word = False
        
        for char in text:
            char_count = char_count + 1
            if char.isalpha():
                letter_count = letter_count + 1
            if char.isdigit():
                digit_count = digit_count + 1
            if char == ' ':
                space_count = space_count + 1
            if char == '\n':
                newline_count = newline_count + 1
            
            if char.isalnum():
                if not in_word:
                    word_count = word_count + 1
                    in_word = True
            else:
                in_word = False
                
        stats['total_chars'] = char_count
        stats['letters'] = letter_count
        stats['digits'] = digit_count
        stats['spaces'] = space_count
        stats['lines'] = newline_count + 1
        stats['words'] = word_count
        return stats
    
    def sanitize_text(self, text: str, replacements: Dict[str, str]) -> str:
        result = text
        for old, new in replacements.items():
            result = result.replace(old, new)
        return result
    
    def build_report(self, sections: List[Dict[str, Any]]) -> str:
        parts = []
        parts.append(self.header)
        parts.append("\n")
        for section in sections:
            section_type = section.get('type', 'text')
            if section_type == 'text':
                parts.append(section.get('content', ''))
                parts.append("\n")
            elif section_type == 'table':
                table = self.build_table(
                    section.get('headers', []),
                    section.get('rows', []),
                    section.get('col_width', 15)
                )
                parts.append(table)
                parts.append("\n")
            elif section_type == 'summary':
                summary = self.build_summary(section.get('data', {}))
                parts.append(summary)
                parts.append("\n")
            elif section_type == 'list':
                lst = self.build_list(
                    section.get('title', 'Items'),
                    section.get('items', []),
                    section.get('numbered', False)
                )
                parts.append(lst)
                parts.append("\n")
        parts.append("\n")
        parts.append(self.footer)
        return "".join(parts)
