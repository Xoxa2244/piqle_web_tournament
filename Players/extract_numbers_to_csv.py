#!/usr/bin/env python3
"""
Extract data from Numbers file and convert to CSV
Numbers files are ZIP archives containing .iwa files (Apple's binary format)
This script attempts to extract readable data from the Numbers file.
"""

import zipfile
import json
import re
import sys
import os

def extract_numbers_data(numbers_file_path):
    """Extract data from Numbers file"""
    try:
        with zipfile.ZipFile(numbers_file_path, 'r') as zip_ref:
            # Extract all files
            extract_dir = 'numbers_temp'
            zip_ref.extractall(extract_dir)
            
            # Look for data in .iwa files
            # Numbers stores data in protobuf-like format in .iwa files
            # This is a simplified extraction - may need more sophisticated parsing
            
            data_rows = []
            
            # Try to find table data files
            for root, dirs, files in os.walk(extract_dir):
                for file in files:
                    if file.endswith('.iwa'):
                        file_path = os.path.join(root, file)
                        try:
                            with open(file_path, 'rb') as f:
                                content = f.read()
                                
                                # Try to extract text data (simplified approach)
                                # Look for readable strings in the binary data
                                text_content = content.decode('utf-8', errors='ignore')
                                
                                # Try to find patterns that look like table data
                                # This is a heuristic approach
                                lines = text_content.split('\n')
                                for line in lines:
                                    # Look for lines that might contain player data
                                    if len(line) > 10 and any(char.isalpha() for char in line):
                                        # Check if line might be a name or data row
                                        if re.search(r'[A-Z][a-z]+\s+[A-Z][a-z]+', line):
                                            # Might be a name
                                            pass
                        except Exception as e:
                            pass
            
            # Cleanup
            import shutil
            if os.path.exists(extract_dir):
                shutil.rmtree(extract_dir)
                
            return data_rows
            
    except Exception as e:
        print(f"Error extracting Numbers file: {e}")
        return None

def main():
    numbers_file = "player list.numbers"
    
    if not os.path.exists(numbers_file):
        print(f"Error: {numbers_file} not found")
        return
    
    print("Attempting to extract data from Numbers file...")
    print("Note: Numbers files use a binary format that's difficult to parse directly.")
    print("For best results, please export the file manually from Numbers app:")
    print("  1. Open 'player list.numbers' in Numbers")
    print("  2. File → Export To → CSV")
    print("  3. Save as 'player_list.csv'")
    print("\nAlternatively, if you can share the data structure, I can create a template CSV.")
    
    # Try to extract anyway
    data = extract_numbers_data(numbers_file)
    
    if data:
        print(f"\nExtracted {len(data)} rows")
    else:
        print("\nCould not automatically extract data from Numbers file.")
        print("Please export manually or provide the data structure.")

if __name__ == "__main__":
    main()

