const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Helper function to extract text from PDF
function extractPDFText(pdfPath) {
  try {
    return execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf-8' });
  } catch (error) {
    console.error(`Error extracting text from ${pdfPath}:`, error.message);
    return '';
  }
}

// Helper function to extract team data (number and player names) from PDF text
function extractTeamData(pdfText) {
  const teams = [];
  const lines = pdfText.split('\n');
  
  // Find the section with teams (after "Teams" header)
  let inTeamsSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for "Teams" header
    if (line.toLowerCase().includes('teams') || line === 'Teams') {
      inTeamsSection = true;
      continue;
    }
    
    if (!inTeamsSection) continue;
    
    // Skip empty lines and headers
    if (line === '' || 
        line.toLowerCase().includes('court') || 
        line.toLowerCase().includes('ps') ||
        line.toLowerCase().includes('w') ||
        line.toLowerCase().includes('l') ||
        line.toLowerCase().includes('pe') ||
        line.toLowerCase().includes('pa') ||
        line.toLowerCase().includes('pd')) {
      continue;
    }
    
    // Check if line is just a number (team number) - typically 1-10 range
    const teamNumberMatch = line.match(/^(\d+)$/);
    if (teamNumberMatch) {
      const num = parseInt(teamNumberMatch[1], 10);
      
      // Team numbers are typically in range 1-20
      if (num <= 0 || num > 20) continue;
      
      // Verify it's a team number by checking if next lines have player names
      let hasValidPlayerInfo = false;
      let nameLinesFound = 0;
      
      for (let checkIdx = i + 1; checkIdx < Math.min(i + 6, lines.length); checkIdx++) {
        const checkLine = lines[checkIdx].trim();
        
        // Stop if we hit another team number
        if (checkLine.match(/^\d+$/) && parseInt(checkLine, 10) <= 20) {
          break;
        }
        
        // Skip empty lines
        if (checkLine === '') continue;
        
        // Skip if it's clearly a score or number (just digits)
        if (checkLine.match(/^[\d\s.]+$/)) continue;
        
        // Check if it looks like a name (has letters, starts with capital)
        if (checkLine.length > 3 && /^[A-Z][a-z]/.test(checkLine)) {
          hasValidPlayerInfo = true;
          nameLinesFound++;
          // For singles, we expect 1 name. For doubles, we expect 2 names.
          // Stop after finding 2 name lines or if we hit scores/numbers
          if (nameLinesFound >= 2) break;
        }
      }
      
      if (!hasValidPlayerInfo) continue;
      
      // Extract player names from following lines
      // After a team number, we expect exactly 2 player names (for 2v2) or 1 name (for 1v1)
      const players = [];
      let j = i + 1;
      let playersFound = 0;
      const maxPlayersToExtract = 2; // Always try to extract 2 players (will be filtered later based on type)
      let consecutiveNonNameLines = 0;
      const maxConsecutiveSkips = 2; // Max consecutive lines we can skip before giving up
      
      while (j < lines.length && playersFound < maxPlayersToExtract && consecutiveNonNameLines < maxConsecutiveSkips) {
        let nameLine = lines[j].trim();
        
        // Stop if we hit another team number
        if (nameLine.match(/^\d+$/) && parseInt(nameLine, 10) <= 20 && parseInt(nameLine, 10) > 0) {
          break;
        }
        
        // Skip empty lines
        if (nameLine === '') {
          j++;
          consecutiveNonNameLines++;
          continue;
        }
        
        // Skip scores and numbers (just digits, possibly with spaces/dots)
        if (nameLine.match(/^[\d\s.]+$/)) {
          j++;
          consecutiveNonNameLines++;
          continue;
        }
        
        // Check if it looks like a player name (starts with capital letter, has at least 3 chars)
        if (nameLine.length >= 3 && /[A-Za-z]/.test(nameLine) && /^[A-Z]/.test(nameLine)) {
          // Remove location info in parentheses
          nameLine = nameLine.replace(/\s*\([^)]*\)\s*$/, '');
          
          // Additional check: make sure it's not just a single capital letter or abbreviation
          if (nameLine.length < 3 || nameLine.match(/^[A-Z]\s*$/)) {
            j++;
            consecutiveNonNameLines++;
            continue;
          }
          
          // Handle "&" separator within a single line (e.g., "J Herron III & C Behrman")
          if (nameLine.includes('&')) {
            const parts = nameLine.split('&').map(p => p.trim()).filter(p => p.length >= 3 && /^[A-Z]/.test(p));
            for (const part of parts) {
              if (playersFound < maxPlayersToExtract) {
                players.push(part);
                playersFound++;
                consecutiveNonNameLines = 0; // Reset counter when we find a name
              }
            }
          } else {
            // Single player name
            players.push(nameLine);
            playersFound++;
            consecutiveNonNameLines = 0; // Reset counter when we find a name
          }
        } else {
          consecutiveNonNameLines++;
        }
        
        j++;
        
        // If we've found 2 players, we can stop looking
        if (playersFound >= maxPlayersToExtract) {
          break;
        }
      }
      
      // Only add if we found at least one player name
      if (players.length > 0) {
        teams.push({
          number: num,
          players: players
        });
      }
    }
  }
  
  // Sort by team number
  teams.sort((a, b) => a.number - b.number);
  return teams;
}

// Helper function to split name into first and last name
function splitName(fullName) {
  if (!fullName || fullName.trim() === '') {
    return { firstName: 'Player', lastName: '' };
  }
  
  const parts = fullName.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  
  // Last part is last name, everything else is first name
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  
  return { firstName, lastName };
}

// Helper function to extract division name from PDF text
function getDivisionFromPDFText(pdfText) {
  const lines = pdfText.split('\n');
  
  // Look for division name in lines containing "OPEN", "Doubles", or "Singles"
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match patterns like "Men's Doubles OPEN - Prize $$ Event" or "Women's Doubles OPEN"
    // Handle different apostrophe characters: ' ' ' ` etc.
    const doublesMatch = trimmed.match(/(Men[''`]\s*s|Women[''`]\s*s)\s+Doubles\s+(OPEN|Open)/i);
    if (doublesMatch) {
      const genderPart = doublesMatch[1].replace(/[''`]\s*s/i, '');
      const gender = genderPart.charAt(0).toUpperCase() + genderPart.slice(1).toLowerCase();
      return `${gender}'s Doubles Open`;
    }
    
    // Match patterns like "Men's Singles 4.0" or "Men's Singles 4.5"
    const singlesMatch = trimmed.match(/(Men[''`]\s*s|Women[''`]\s*s)\s+Singles\s+(\d+\.\d+)/i);
    if (singlesMatch) {
      const genderPart = singlesMatch[1].replace(/[''`]\s*s/i, '');
      const gender = genderPart.charAt(0).toUpperCase() + genderPart.slice(1).toLowerCase();
      const rating = singlesMatch[2];
      return `${gender}'s Singles ${rating}`;
    }
    
    // Also try without strict apostrophe matching
    if (trimmed.includes('Doubles') && (trimmed.includes("Men") || trimmed.includes("Women"))) {
      if (trimmed.includes("Men")) {
        return "Men's Doubles Open";
      } else if (trimmed.includes("Women")) {
        return "Women's Doubles Open";
      }
    }
    
    if (trimmed.includes('Singles') && (trimmed.includes("Men") || trimmed.includes("Women"))) {
      // Extract rating
      const ratingMatch = trimmed.match(/(\d+\.\d+)/);
      const rating = ratingMatch ? ratingMatch[1] : '';
      if (trimmed.includes("Men")) {
        return `Men's Singles ${rating}`;
      } else if (trimmed.includes("Women")) {
        return `Women's Singles ${rating}`;
      }
    }
  }
  
  // Fallback: return null if not found (should not happen with valid PDFs)
  return null;
}

// Helper function to get pool number from PDF text
function getPoolFromPDFText(pdfText) {
  // Look for pattern like "Pool 1 : 5 Team Round Robin" or "Pool 1 :"
  const match = pdfText.match(/Pool\s+(\d+)\s*:/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // If not found, return null
  return null;
}

// Main function to process all PDFs
function processPDFs() {
  const gamesDir = __dirname;
  
  // Exclude general/overview files (they duplicate data from pool-specific files)
  const excludedFiles = ['WD open .pdf', 'md open.pdf'];
  
  const pdfFiles = fs.readdirSync(gamesDir)
    .filter(file => {
      const lowerFile = file.toLowerCase();
      return lowerFile.endsWith('.pdf') && !excludedFiles.includes(file);
    })
    .sort();
  
  console.log(`Found ${pdfFiles.length} PDF files (excluding general files)`);
  
  const csvRows = [];
  const header = 'First Name,Last Name,Gender,Age,DUPR ID,DUPR rating,Division,Type,Age Constraint,DUPR Constraint,Pool,Team';
  csvRows.push(header);
  
  // Track team numbering per division (resets for each new division)
  let currentDivision = null;
  let teamCounter = 0; // Will be incremented before first use, so starts at 1
  
  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(gamesDir, pdfFile);
    console.log(`Processing ${pdfFile}...`);
    
    const pdfText = extractPDFText(pdfPath);
    const teams = extractTeamData(pdfText);
    
    console.log(`  Found ${teams.length} teams`);
    
    // Extract division name and pool number from PDF text
    const divisionName = getDivisionFromPDFText(pdfText);
    const poolNumber = getPoolFromPDFText(pdfText);
    
    if (!divisionName) {
      console.warn(`  Warning: Could not extract division name from ${pdfFile}, skipping...`);
      continue;
    }
    
    console.log(`  Division: ${divisionName}, Pool: ${poolNumber || 'N/A'}`);
    
    // Reset team counter if this is a new division
    if (currentDivision !== divisionName) {
      if (currentDivision !== null) {
        console.log(`  Starting new division: ${divisionName} (resetting team counter)`);
      }
      currentDivision = divisionName;
      teamCounter = 0; // Will be incremented before use, so first team will be 1
    }
    
    // Determine gender and type from division
    let gender = 'M';
    let type = '2v2';
    let ageConstraint = '18-50';
    let duprConstraint = '2.5-4.5';
    
    if (divisionName.toLowerCase().includes("women's") || divisionName.toLowerCase().includes('wd')) {
      gender = 'F';
    }
    
    if (divisionName.toLowerCase().includes('singles') || divisionName.toLowerCase().includes('1v1')) {
      type = '1v1';
    } else {
      type = '2v2';
    }
    
    // Adjust constraints based on division
    if (divisionName.includes('4.0')) {
      duprConstraint = '3.5-4.5';
    } else if (divisionName.includes('4.5')) {
      duprConstraint = '4.0-5.0';
    }
    
    // Create rows for each team
    for (const team of teams) {
      // Use sequential team counter instead of team.number from PDF
      // This ensures continuous numbering across pools within the same division
      teamCounter++;
      const teamName = `Team ${teamCounter}`;
      const players = team.players;
      
      // Determine how many players we need (2 for 2v2, 1 for 1v1)
      const requiredPlayers = type === '2v2' ? 2 : 1;
      
      // Use actual player names if available, otherwise use placeholder
      for (let i = 0; i < requiredPlayers; i++) {
        let firstName, lastName;
        
        if (i < players.length && players[i]) {
          const nameParts = splitName(players[i]);
          firstName = nameParts.firstName;
          lastName = nameParts.lastName;
        } else {
          // Fallback to placeholder
          firstName = type === '2v2' ? (i === 0 ? 'Player' : 'Partner') : 'Player';
          lastName = `T${teamCounter}${i > 0 ? 'B' : 'A'}`;
        }
        
        // Use teamCounter for DUPR ID to match the sequential team numbering
        const duprId = `TEAM${teamCounter.toString().padStart(3, '0')}${i > 0 ? 'B' : 'A'}`;
        
        // Generate blank data
        const age = '25';
        let duprRating = type === '1v1' ? '4.0' : '3.5';
        
        // Adjust DUPR rating based on division
        if (divisionName.includes('4.0')) {
          duprRating = '3.75';
        } else if (divisionName.includes('4.5')) {
          duprRating = '4.25';
        }
        
        const row = [
          firstName,
          lastName,
          gender,
          age,
          duprId,
          duprRating,
          divisionName,
          type,
          ageConstraint,
          duprConstraint,
          poolNumber || '',
          teamName
        ].join(',');
        
        csvRows.push(row);
      }
    }
    
    // teamCounter is now incremented per team above, no need to add here
  }
  
  // Write CSV file
  const outputPath = path.join(gamesDir, 'participants.csv');
  fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf-8');
  
  console.log(`\n✅ CSV file created: ${outputPath}`);
  console.log(`Total rows: ${csvRows.length - 1} (excluding header)`);
  console.log(`Total teams: ${teamCounter - 1}`);
}

// Run the script
try {
  processPDFs();
} catch (error) {
  console.error('Error processing PDFs:', error);
  process.exit(1);
}

