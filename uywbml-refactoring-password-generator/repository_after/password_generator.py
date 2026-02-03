"""
Main Password Generator application.

A production-ready Tkinter-based password generator that addresses all
the reliability and performance issues from the legacy implementation.

Key improvements:
- All UI operations on main thread using after()
- No background polling threads
- Proper event-driven architecture
- Thread-safe data structures
- No memory leaks or unbounded growth
"""

import tkinter as tk
from typing import Optional

from password_generator_core import PasswordGeneratorCore
from ui_utils import ClipboardManager, WidgetFactory, UIHelpers


class PasswordGenerator:
    """
    Thread-safe password generator with proper UI state management.
    
    All UI operations are performed on the main thread using tkinter's
    after() method to avoid race conditions and Tcl errors.
    """
    
    DEFAULT_PASSWORD_LENGTH = 12
    MIN_PASSWORD_LENGTH = 4
    MAX_PASSWORD_LENGTH = 32
    
    def __init__(self, root: Optional[tk.Tk] = None):
        """
        Initialize the password generator application.
        
        Args:
            root: Tkinter root window (creates new if None)
        """
        if root is None:
            self._own_root = True
            self.root = tk.Tk()
            self.root.title("Password Generator")
            self.root.geometry("450x350")
            self.root.resizable(False, False)
        else:
            self._own_root = False
            self.root = root
        
        # Initialize core logic
        self._core = PasswordGeneratorCore()
        
        # Initialize clipboard manager
        self._clipboard_manager = ClipboardManager(self.root)
        
        # Setup UI components
        self._setup_variables()
        self._setup_ui()
        self._setup_traces()
        
    def _setup_variables(self):
        """Initialize tkinter variables with default values."""
        self.length_var = tk.IntVar(value=self.DEFAULT_PASSWORD_LENGTH)
        self.use_letters = tk.BooleanVar(value=True)
        self.use_digits = tk.BooleanVar(value=True)
        self.use_symbols = tk.BooleanVar(value=True)
        
    def _setup_ui(self):
        """Create all UI elements in their correct positions."""
        # Title label
        title_label = WidgetFactory.create_label(
            self.root,
            text="Password Generator",
            font=("Arial", 16, "bold")
        )
        title_label.pack(pady=15)
        
        # Length frame with slider and label
        length_frame = tk.Frame(self.root)
        length_frame.pack(pady=10)
        
        self.length_label = WidgetFactory.create_label(
            length_frame,
            text=f"Length: {self.DEFAULT_PASSWORD_LENGTH}",
            font=("Arial", 10)
        )
        self.length_label.pack(side=tk.LEFT, padx=5)
        
        length_slider = WidgetFactory.create_slider(
            length_frame,
            from_=self.MIN_PASSWORD_LENGTH,
            to=self.MAX_PASSWORD_LENGTH,
            variable=self.length_var,
            length=200,
            command=self._on_length_change
        )
        length_slider.pack(side=tk.LEFT)
        
        # Checkbox frame
        checkbox_frame = tk.Frame(self.root)
        checkbox_frame.pack(pady=10)
        
        WidgetFactory.create_checkbox(
            checkbox_frame,
            text="Letters (A-z)",
            variable=self.use_letters
        ).pack(anchor=tk.W)
        
        WidgetFactory.create_checkbox(
            checkbox_frame,
            text="Numbers (0-9)",
            variable=self.use_digits
        ).pack(anchor=tk.W)
        
        WidgetFactory.create_checkbox(
            checkbox_frame,
            text="Symbols (!@#$)",
            variable=self.use_symbols
        ).pack(anchor=tk.W)
        
        # Generate button
        self.generate_btn = WidgetFactory.create_button(
            self.root,
            text="Generate Password",
            command=self._generate_password,
            bg="#4CAF50",
            fg="white",
            font=("Arial", 11, "bold"),
            padx=20,
            pady=5
        )
        self.generate_btn.pack(pady=15)
        
        # Result frame with password display and copy button
        result_frame = tk.Frame(self.root)
        result_frame.pack(pady=10)
        
        self.result_text = WidgetFactory.create_text_display(result_frame)
        self.result_text.pack(side=tk.LEFT, padx=5)
        
        # Set initial placeholder text
        UIHelpers.safe_update_text(self.result_text, "Your password will appear here")
        
        self.copy_button = WidgetFactory.create_button(
            result_frame,
            text="Copy",
            command=self._copy_to_clipboard,
            bg="#2196F3",
            fg="white",
            font=("Arial", 9),
            width=6,
            height=2
        )
        self.copy_button.pack(side=tk.LEFT, padx=5)
        
        # Initial button state validation
        self._update_button_state()
        
    def _setup_traces(self):
        """Setup variable traces for automatic validation updates."""
        # Trace checkbox variables to update button state automatically
        self.use_letters.trace_add(
            "write",
            lambda *args: self._update_button_state()
        )
        self.use_digits.trace_add(
            "write",
            lambda *args: self._update_button_state()
        )
        self.use_symbols.trace_add(
            "write",
            lambda *args: self._update_button_state()
        )
        
    def _on_length_change(self, value):
        """Handle length slider changes - update label immediately."""
        UIHelpers.safe_update_label(
            self.length_label,
            f"Length: {value}"
        )
        
    def _generate_password(self) -> str:
        """
        Generate a secure password based on selected options.
        
        Returns:
            Generated password string
        """
        length = self.length_var.get()
        
        try:
            password = self._core.generate_password(
                length=length,
                use_letters=self.use_letters.get(),
                use_digits=self.use_digits.get(),
                use_symbols=self.use_symbols.get()
            )
            
            # Display the password
            UIHelpers.safe_update_text(self.result_text, password)
            
            return password
            
        except ValueError as e:
            # Handle validation errors
            error_message = str(e)
            if "character type" in error_message.lower():
                UIHelpers.safe_update_text(
                    self.result_text,
                    "Please select at least one character type!"
                )
            else:
                UIHelpers.safe_update_text(self.result_text, error_message)
            return ""
        
        except Exception:
            # Handle any unexpected errors
            UIHelpers.safe_update_text(
                self.result_text,
                "An error occurred during password generation."
            )
            return ""
    
    def _update_button_state(self):
        """Enable/disable generate button based on character selection."""
        has_selection = (
            self.use_letters.get() or 
            self.use_digits.get() or 
            self.use_symbols.get()
        )
        state = "normal" if has_selection else "disabled"
        UIHelpers.safe_update_button_state(self.generate_btn, state)
    
    def _copy_to_clipboard(self):
        """Copy current password to clipboard."""
        password = self.result_text.get(1.0, tk.END).strip()
        
        # Don't copy placeholder or error messages
        if not password or password == "Your password will appear here":
            return
        
        if "Please select" in password:
            return
        
        # Copy to clipboard with feedback
        self._clipboard_manager.copy_with_feedback(
            text=password,
            button_widget=self.copy_button,
            original_text="Copy",
            feedback_text="Copied!",
            delay_ms=2000
        )
        
        # Add to clipboard history
        self._core.add_to_clipboard_history(password)
    
    # Public API methods for testing and external access
    
    def get_password_history(self) -> list:
        """Get password history."""
        return self._core.get_password_history()
    
    def get_clipboard_history(self) -> list:
        """Get clipboard history."""
        return self._core.get_clipboard_history()
    
    def clear_histories(self):
        """Clear all history data."""
        self._core.clear_all_histories()
    
    def run(self):
        """Start the main event loop."""
        self.root.mainloop()
    
    def destroy(self):
        """Destroy the application and cleanup resources."""
        self._clipboard_manager.cancel_pending_reset()
        if self._own_root:
            self.root.destroy()


def main():
    """Main entry point for the password generator application."""
    app = PasswordGenerator()
    app.run()


if __name__ == "__main__":
    main()
