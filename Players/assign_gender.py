#!/usr/bin/env python3
"""
Assign gender to players in CSV based on names and ensure 2M+2F per team
"""

import csv
import re

# Common female first names
FEMALE_NAMES = {
    'robin', 'tina', 'lynn', 'josie', 'kristen', 'annie', 'brittany', 'lea', 'aura', 'bonnie',
    'michele', 'erika', 'kandice', 'milissa', 'adriana', 'diana', 'mary', 'jennifer', 'sara',
    'miriam', 'gigi', 'lisa', 'molly', 'krystal', 'dana', 'hannah', 'abby', 'shannon', 'allison',
    'hanna', 'marcie', 'anna', 'judi', 'tracey', 'shelly', 'denise', 'jill', 'deborah', 'krista',
    'olivia', 'kelly', 'jackie', 'courtney', 'cassie', 'rachel', 'victoria', 'cheryl', 'amy',
    'nancy', 'betty', 'sandra', 'carol', 'ruth', 'sharon', 'michelle', 'laura', 'sarah', 'kimberly'
}

# Common male first names
MALE_NAMES = {
    'lawson', 'tod', 'john', 'jeff', 'glenn', 'michael', 'fabian', 'matthew', 'dave', 'andy',
    'richard', 'george', 'anping', 'ben', 'ian', 'bill', 'ed', 'scott', 'mark', 'rodney', 'cory',
    'ryan', 'anand', 'clive', 'kevin', 'joshua', 'mitch', 'jason', 'jj', 'nathan', 'aaron',
    'james', 'dustin', 'dennis', 'robert', 'frank', 'kyle', 'albert', 'trey', 'jason', 'justin',
    'christopher', 'benjamin', 'mike', 'steve', 'graig', 'logan', 'jon', 'byron', 'noah', 'mitch',
    'will', 'anthony', 'mark', 'donald', 'steven', 'paul'
}

def guess_gender_from_name(first_name):
    """Guess gender from first name"""
    name_lower = first_name.lower().strip()
    
    # Check against known names
    if name_lower in FEMALE_NAMES:
        return 'F'
    if name_lower in MALE_NAMES:
        return 'M'
    
    # Heuristic: names ending in 'a', 'ia', 'elle', 'ette' are often female
    if re.search(r'(a|ia|elle|ette|ine|elle)$', name_lower):
        return 'F'
    
    # Heuristic: names ending in 'n', 'r', 'd', 'k', 's' are often male
    if re.search(r'(n|r|d|k|s)$', name_lower) and len(name_lower) > 3:
        return 'M'
    
    # Default: return None (unknown)
    return None

def assign_gender_to_csv(input_file, output_file):
    """Assign gender to players ensuring 2M+2F per team"""
    
    rows = []
    teams = {}
    
    # Read CSV
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
            team_name = row['Team']
            if team_name not in teams:
                teams[team_name] = []
            teams[team_name].append(row)
    
    # First pass: assign gender based on names
    for row in rows:
        if not row['Gender'] or row['Gender'].strip() == '':
            first_name = row['First Name']
            guessed_gender = guess_gender_from_name(first_name)
            if guessed_gender:
                row['Gender'] = guessed_gender
    
    # Second pass: ensure 2M+2F per team
    for team_name, team_players in teams.items():
        # Count current genders
        males = [p for p in team_players if p.get('Gender', '').strip() == 'M']
        females = [p for p in team_players if p.get('Gender', '').strip() == 'F']
        unknown = [p for p in team_players if not p.get('Gender', '').strip() or p.get('Gender', '').strip() not in ['M', 'F']]
        
        # Need 2 males and 2 females
        needed_males = max(0, 2 - len(males))
        needed_females = max(0, 2 - len(females))
        
        # Assign unknown players to balance the team
        for player in unknown:
            if needed_males > 0:
                player['Gender'] = 'M'
                needed_males -= 1
            elif needed_females > 0:
                player['Gender'] = 'F'
                needed_females -= 1
            else:
                # If we already have 2M+2F, assign remaining randomly but maintain balance
                if len(males) < len(females):
                    player['Gender'] = 'M'
                    males.append(player)
                else:
                    player['Gender'] = 'F'
                    females.append(player)
        
        # If still not balanced, adjust
        males = [p for p in team_players if p.get('Gender', '').strip() == 'M']
        females = [p for p in team_players if p.get('Gender', '').strip() == 'F']
        
        if len(males) != 2 or len(females) != 2:
            # Force balance: change genders of excess players
            if len(males) > 2:
                excess = len(males) - 2
                for i, player in enumerate(males[2:]):
                    if excess > 0:
                        player['Gender'] = 'F'
                        excess -= 1
            elif len(females) > 2:
                excess = len(females) - 2
                for i, player in enumerate(females[2:]):
                    if excess > 0:
                        player['Gender'] = 'M'
                        excess -= 1
            elif len(males) < 2:
                needed = 2 - len(males)
                for i, player in enumerate(females[2:]):
                    if needed > 0:
                        player['Gender'] = 'M'
                        needed -= 1
            elif len(females) < 2:
                needed = 2 - len(females)
                for i, player in enumerate(males[2:]):
                    if needed > 0:
                        player['Gender'] = 'F'
                        needed -= 1
    
    # Write output CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['First Name', 'Last Name', 'Gender', 'Age', 'DUPR ID', 'DUPR rating',
                     'Division', 'Type', 'Age Constraint', 'DUPR Constraint', 'Pool', 'Team']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    # Print statistics
    print(f"✅ Processed {len(rows)} players in {len(teams)} teams")
    
    # Verify teams
    print("\nTeam verification:")
    for team_name, team_players in sorted(teams.items()):
        males = [p for p in team_players if p.get('Gender', '').strip() == 'M']
        females = [p for p in team_players if p.get('Gender', '').strip() == 'F']
        status = "✅" if len(males) == 2 and len(females) == 2 else "❌"
        print(f"  {status} {team_name}: {len(males)}M, {len(females)}F")
    
    print(f"\n📁 Output saved to: {output_file}")

if __name__ == "__main__":
    input_file = "player_list_import_ready.csv"
    output_file = "player_list_import_ready.csv"
    
    try:
        assign_gender_to_csv(input_file, output_file)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

