from typing import List, Dict, Any
from datetime import datetime


class ReportGenerator:
    def __init__(self):
        self.header = ""
        self.footer = ""
    
    def set_header(self, title: str, date: datetime) -> None:
        self.header = ""
        self.header = self.header + "=" * 60
        self.header = self.header + "\n"
        self.header = self.header + title.upper()
        self.header = self.header + "\n"
        self.header = self.header + "Generated: " + date.strftime("%Y-%m-%d %H:%M:%S")
        self.header = self.header + "\n"
        self.header = self.header + "=" * 60
        self.header = self.header + "\n"
    
    def set_footer(self, author: str, page_count: int) -> None:
        self.footer = ""
        self.footer = self.footer + "-" * 60
        self.footer = self.footer + "\n"
        self.footer = self.footer + "Author: " + author
        self.footer = self.footer + "\n"
        self.footer = self.footer + "Pages: " + str(page_count)
        self.footer = self.footer + "\n"
        self.footer = self.footer + "-" * 60
    
    def build_table(self, headers: List[str], rows: List[List[Any]], 
                    col_width: int = 15) -> str:
        table = ""
        header_line = "|"
        for header in headers:
            cell = str(header)
            while len(cell) < col_width:
                cell = cell + " "
            cell = cell[:col_width]
            header_line = header_line + cell + "|"
        table = table + header_line + "\n"
        sep_line = "+"
        for _ in headers:
            sep = ""
            for _ in range(col_width):
                sep = sep + "-"
            sep_line = sep_line + sep + "+"
        table = table + sep_line + "\n"
        for row in rows:
            row_line = "|"
            for cell_value in row:
                cell = str(cell_value)
                while len(cell) < col_width:
                    cell = cell + " "
                cell = cell[:col_width]
                row_line = row_line + cell + "|"
            table = table + row_line + "\n"
        return table
    
    def build_summary(self, data: Dict[str, Any]) -> str:
        summary = ""
        summary = summary + "\nSUMMARY\n"
        summary = summary + "-" * 40 + "\n"
        for key, value in data.items():
            line = ""
            line = line + key
            line = line + ": "
            line = line + str(value)
            line = line + "\n"
            summary = summary + line
        return summary
    
    def build_list(self, title: str, items: List[str], numbered: bool = False) -> str:
        result = ""
        result = result + "\n" + title + "\n"
        result = result + "-" * len(title) + "\n"
        index = 1
        for item in items:
            if numbered:
                prefix = str(index) + ". "
                index = index + 1
            else:
                prefix = "• "
            result = result + prefix + item + "\n"
        return result
    
    def analyze_text(self, text: str) -> Dict[str, int]:
        stats = {}
        char_count = 0
        for char in text:
            char_count = char_count + 1
        stats['total_chars'] = char_count
        letter_count = 0
        for char in text:
            if char.isalpha():
                letter_count = letter_count + 1
        stats['letters'] = letter_count
        digit_count = 0
        for char in text:
            if char.isdigit():
                digit_count = digit_count + 1
        stats['digits'] = digit_count
        space_count = 0
        for char in text:
            if char == ' ':
                space_count = space_count + 1
        stats['spaces'] = space_count
        newline_count = 0
        for char in text:
            if char == '\n':
                newline_count = newline_count + 1
        stats['lines'] = newline_count + 1
        word_count = 0
        in_word = False
        for char in text:
            if char.isalnum():
                if not in_word:
                    word_count = word_count + 1
                    in_word = True
            else:
                in_word = False
        stats['words'] = word_count
        return stats
    
    def sanitize_text(self, text: str, replacements: Dict[str, str]) -> str:
        result = text
        for old, new in replacements.items():
            new_result = ""
            i = 0
            while i < len(result):
                found = True
                if i + len(old) <= len(result):
                    for j in range(len(old)):
                        if result[i + j] != old[j]:
                            found = False
                            break
                else:
                    found = False
                if found:
                    new_result = new_result + new
                    i = i + len(old)
                else:
                    new_result = new_result + result[i]
                    i = i + 1
            result = new_result
        return result
    
    def build_report(self, sections: List[Dict[str, Any]]) -> str:
        report = ""
        report = report + self.header
        report = report + "\n"
        for section in sections:
            section_type = section.get('type', 'text')
            if section_type == 'text':
                report = report + section.get('content', '')
                report = report + "\n"
            elif section_type == 'table':
                table = self.build_table(
                    section.get('headers', []),
                    section.get('rows', []),
                    section.get('col_width', 15)
                )
                report = report + table
                report = report + "\n"
            elif section_type == 'summary':
                summary = self.build_summary(section.get('data', {}))
                report = report + summary
                report = report + "\n"
            elif section_type == 'list':
                lst = self.build_list(
                    section.get('title', 'Items'),
                    section.get('items', []),
                    section.get('numbered', False)
                )
                report = report + lst
                report = report + "\n"
        report = report + "\n"
        report = report + self.footer
        return report
