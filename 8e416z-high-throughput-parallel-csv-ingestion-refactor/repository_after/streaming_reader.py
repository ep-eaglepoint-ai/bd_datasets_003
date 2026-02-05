import csv

def stream_csv_reader(file_path):
    """
    Streaming CSV reader that yields rows incrementally without loading the full file.
    
    Yields:
        tuple: (line_number, row_dict) where line_number is 1-indexed from source file
    """
    with open(file_path, 'r', newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        for line_number, row in enumerate(reader, start=2):
            yield (line_number, row)
