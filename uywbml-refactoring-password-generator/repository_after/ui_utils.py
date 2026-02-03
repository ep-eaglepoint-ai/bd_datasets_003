"""
UI utilities for the Password Generator.

This module provides helper functions and classes for UI operations,
including clipboard management and widget creation helpers.
"""

import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional


class ClipboardManager:
    """Handle clipboard operations safely on the main thread."""
    
    def __init__(self, root: tk.Tk):
        """
        Initialize clipboard manager.
        
        Args:
            root: Tkinter root window
        """
        self._root = root
        self._reset_timer: Optional[str] = None
    
    def copy_text(self, text: str) -> None:
        """
        Copy text to clipboard.
        
        Args:
            text: Text to copy to clipboard
        """
        self._root.clipboard_clear()
        self._root.clipboard_append(text)
    
    def copy_with_feedback(
        self,
        text: str,
        button_widget: tk.Button,
        original_text: str = "Copy",
        feedback_text: str = "Copied!",
        delay_ms: int = 2000
    ) -> None:
        """
        Copy text to clipboard and show feedback on button.
        
        Args:
            text: Text to copy to clipboard
            button_widget: Button widget to update
            original_text: Text to show after reset
            feedback_text: Text to show immediately after copy
            delay_ms: Delay before resetting button text
        """
        # Copy to clipboard
        self.copy_text(text)
        
        # Update button to show feedback
        button_widget.config(text=feedback_text)
        
        # Cancel any existing timer
        if self._reset_timer is not None:
            self._root.after_cancel(self._reset_timer)
        
        # Schedule reset
        self._reset_timer = self._root.after(
            delay_ms,
            lambda: self._reset_button(button_widget, original_text)
        )
    
    def _reset_button(self, button_widget: tk.Button, text: str) -> None:
        """
        Reset button text.
        
        Args:
            button_widget: Button widget to update
            text: Text to set
        """
        button_widget.config(text=text)
        self._reset_timer = None
    
    def cancel_pending_reset(self) -> None:
        """Cancel any pending button reset."""
        if self._reset_timer is not None:
            self._root.after_cancel(self._reset_timer)
            self._reset_timer = None


class WidgetFactory:
    """Factory for creating standardized UI widgets."""
    
    @staticmethod
    def create_label(
        parent,
        text: str,
        font: tuple = ("Arial", 10),
        **kwargs
    ) -> tk.Label:
        """
        Create a label widget.
        
        Args:
            parent: Parent widget
            text: Label text
            font: Font configuration
            **kwargs: Additional widget configuration
            
        Returns:
            Created Label widget
        """
        return tk.Label(parent, text=text, font=font, **kwargs)
    
    @staticmethod
    def create_button(
        parent,
        text: str,
        command: Callable,
        bg: str = "#4CAF50",
        fg: str = "white",
        font: tuple = ("Arial", 10),
        **kwargs
    ) -> tk.Button:
        """
        Create a button widget.
        
        Args:
            parent: Parent widget
            text: Button text
            command: Command callback
            bg: Background color
            fg: Foreground color
            font: Font configuration
            **kwargs: Additional widget configuration
            
        Returns:
            Created Button widget
        """
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            font=font,
            **kwargs
        )
    
    @staticmethod
    def create_checkbox(
        parent,
        text: str,
        variable: tk.BooleanVar,
        font: tuple = ("Arial", 9),
        **kwargs
    ) -> tk.Checkbutton:
        """
        Create a checkbox widget.
        
        Args:
            parent: Parent widget
            text: Checkbox text
            variable: BooleanVar to track state
            font: Font configuration
            **kwargs: Additional widget configuration
            
        Returns:
            Created Checkbutton widget
        """
        return tk.Checkbutton(
            parent,
            text=text,
            variable=variable,
            font=font,
            **kwargs
        )
    
    @staticmethod
    def create_slider(
        parent,
        from_: int,
        to: int,
        orient: str = tk.HORIZONTAL,
        variable: tk.IntVar = None,
        length: int = 200,
        showvalue: int = 0,
        **kwargs
    ) -> tk.Scale:
        """
        Create a slider/scale widget.
        
        Args:
            parent: Parent widget
            from_: Minimum value
            to: Maximum value
            orient: Orientation (horizontal or vertical)
            variable: IntVar to track value
            length: Slider length in pixels
            showvalue: Whether to show current value
            **kwargs: Additional widget configuration
            
        Returns:
            Created Scale widget
        """
        return tk.Scale(
            parent,
            from_=from_,
            to=to,
            orient=orient,
            variable=variable,
            length=length,
            showvalue=showvalue,
            **kwargs
        )
    
    @staticmethod
    def create_text_display(
        parent,
        width: int = 26,
        height: int = 2,
        font: tuple = ("Courier", 12),
        **kwargs
    ) -> tk.Text:
        """
        Create a text display widget.
        
        Args:
            parent: Parent widget
            width: Width in characters
            height: Height in lines
            font: Font configuration
            **kwargs: Additional widget configuration
            
        Returns:
            Created Text widget
        """
        return tk.Text(
            parent,
            width=width,
            height=height,
            font=font,
            wrap=tk.WORD,
            state="disabled",
            relief=tk.SUNKEN,
            borderwidth=2,
            **kwargs
        )


class UIHelpers:
    """Miscellaneous UI helper methods."""
    
    @staticmethod
    def safe_update_label(label: tk.Label, text: str) -> None:
        """
        Safely update a label's text.
        
        Args:
            label: Label widget to update
            text: Text to set
        """
        try:
            label.config(text=text)
        except tk.TclError:
            pass  # Widget was destroyed
    
    @staticmethod
    def safe_update_button_state(button: tk.Button, state: str) -> None:
        """
        Safely update a button's state.
        
        Args:
            button: Button widget to update
            state: New state ('normal' or 'disabled')
        """
        try:
            button.config(state=state)
        except tk.TclError:
            pass  # Widget was destroyed
    
    @staticmethod
    def safe_update_text(widget: tk.Text, text: str) -> None:
        """
        Safely update a text widget's content.
        
        Args:
            widget: Text widget to update
            text: Text to set
        """
        try:
            widget.config(state="normal")
            widget.delete(1.0, tk.END)
            widget.insert(1.0, text)
            widget.config(state="disabled")
        except tk.TclError:
            pass  # Widget was destroyed
