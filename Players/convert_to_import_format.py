#!/usr/bin/env python3
"""
Convert player list CSV to import format
"""

import csv
import re

def parse_name(full_name):
    """Parse full name into first and last name"""
    if not full_name or not full_name.strip():
        return ("", "")
    
    parts = full_name.strip().split()
    if len(parts) == 0:
        return ("", "")
    elif len(parts) == 1:
        return (parts[0], "")
    else:
        # First name is first part, last name is everything else
        return (parts[0], " ".join(parts[1:]))

def parse_dupr_rating(rating_str):
    """Parse DUPR rating, handle 'NR' (Not Rated)"""
    if not rating_str or rating_str.strip() == "" or rating_str.strip().upper() == "NR":
        return ""
    try:
        # Remove trailing dots and convert to float
        rating = rating_str.strip().rstrip('.')
        float(rating)  # Validate it's a number
        return rating
    except:
        return ""

def convert_csv(input_file, output_file):
    """Convert CSV from Numbers format to import format"""
    
    current_division = None
    rows = []
    
    # Read input file with semicolon delimiter
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter=';')
        
        for row in reader:
            if not row or len(row) == 0:
                continue
            
            # Join row to string for regex matching
            line_str = ';'.join(row)
            
            # Check if this is a division header
            division_match = re.search(r'Division\s*:\s*(DUPR\s*\d+)', line_str, re.IGNORECASE)
            if division_match:
                current_division = division_match.group(1).strip()
                print(f"Found division: {current_division}")
                continue
            
            # Skip header rows
            if len(row) > 1 and row[1] == 'Team':
                continue
            
            # Skip empty separator rows
            if len(row) <= 1 or (len(row) >= 2 and not row[1].strip() and not any(r.strip() for r in row[2:])):
                continue
            
            # Get team name (second column, index 1)
            team_name = row[1].strip() if len(row) > 1 else ""
            if not team_name or team_name.startswith('Division') or team_name.startswith('Date') or team_name.startswith('Time') or team_name.startswith('Court'):
                continue
            
            # Extract partner data
            # Format: ;Team;Here?;Scan?;Partner1;;Here?;Scan?;Partner2;;Here?;Scan?;Partner3;;Here?;Scan?;Partner4;;Email1;DUPR_ID1;Rating1;Email2;DUPR_ID2;Rating2;...
            # Team is at index 1
            # Partners are at indices: 4, 8, 12, 16
            # Emails/IDs/Ratings start at index 18 (after Partner 4 and empty columns)
            
            partners = []
            partner_indices = [4, 8, 12, 16]  # Updated indices based on structure
            
            for i, partner_idx in enumerate(partner_indices):
                if partner_idx < len(row) and row[partner_idx] and row[partner_idx].strip():
                    partner_name = row[partner_idx].strip()
                    
                    # Find corresponding email, DUPR ID, and rating
                    # Email index: 18 + i*3
                    # DUPR ID index: 19 + i*3
                    # Rating index: 20 + i*3
                    email_idx = 18 + i * 3
                    dupr_id_idx = 19 + i * 3
                    rating_idx = 20 + i * 3
                    
                    email = row[email_idx].strip() if email_idx < len(row) else ""
                    dupr_id = row[dupr_id_idx].strip() if dupr_id_idx < len(row) else ""
                    dupr_rating = row[rating_idx].strip() if rating_idx < len(row) else ""
                    
                    if partner_name:
                        first_name, last_name = parse_name(partner_name)
                        if first_name:  # Only add if we have at least a first name
                            partners.append({
                                'first_name': first_name,
                                'last_name': last_name,
                                'email': email,
                                'dupr_id': dupr_id,
                                'dupr_rating': parse_dupr_rating(dupr_rating),
                                'team': team_name,
                                'division': current_division or "Unknown"
                            })
            
            # Add all partners to rows
            for partner in partners:
                rows.append(partner)
    
    # Write output CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        
        # Write header
        writer.writerow([
            'First Name', 'Last Name', 'Gender', 'Age', 'DUPR ID', 'DUPR rating',
            'Division', 'Type', 'Age Constraint', 'DUPR Constraint', 'Pool', 'Team'
        ])
        
        # Write data rows
        for row in rows:
            writer.writerow([
                row['first_name'],
                row['last_name'],
                '',  # Gender - empty, needs to be filled manually for MLP
                '',  # Age - empty
                row['dupr_id'],
                row['dupr_rating'],
                row['division'],
                '4v4',  # Type - always 4v4 for MLP
                '',  # Age Constraint - empty
                '',  # DUPR Constraint - empty
                '',  # Pool - empty
                row['team']
            ])
    
    print(f"✅ Converted {len(rows)} players from {len(set(r['team'] for r in rows))} teams")
    print(f"📁 Output saved to: {output_file}")
    print(f"\n⚠️  Note: Gender and Age fields are empty and need to be filled manually for MLP tournaments")
    if rows:
        print(f"\nDivisions found: {', '.join(set(r['division'] for r in rows))}")

if __name__ == "__main__":
    input_file = "player list_csv.csv"
    output_file = "player_list_import_ready.csv"
    
    try:
        convert_csv(input_file, output_file)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
