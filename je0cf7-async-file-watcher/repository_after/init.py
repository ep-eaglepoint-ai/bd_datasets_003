"""
Async File Watcher Package

Provides AsyncFileWatcher for monitoring file system changes asynchronously.
"""

from .async_file_watcher import AsyncFileWatcher, AsyncEventHandler

__all__ = ['AsyncFileWatcher', 'AsyncEventHandler']
__version__ = '1.0.0'