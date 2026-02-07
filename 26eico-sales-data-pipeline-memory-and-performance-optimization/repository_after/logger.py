import logging
import os

LOG_FILE = "malformed_rows.log"

def setup_logger():
    # Remove existing log file to start fresh
    if os.path.exists(LOG_FILE):
        try:
            os.remove(LOG_FILE)
        except OSError:
            pass

    logger = logging.getLogger("malformed_rows")
    logger.setLevel(logging.ERROR)
    
    handler = logging.FileHandler(LOG_FILE)
    formatter = logging.Formatter('%(message)s')
    handler.setFormatter(formatter)
    
    logger.addHandler(handler)
    return logger

logger = setup_logger()

def log_malformed_row(original_line_num: int, reason: str, raw_data: str = ""):
    """
    Log a malformed row.
    Format: Line {num}: {reason} | Raw: {raw}
    """
    msg = f"Line {original_line_num}: {reason}"
    if raw_data:
        msg += f" | Raw: {raw_data}"
    logger.error(msg)
