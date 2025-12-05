#!/bin/bash
# Script to convert Numbers file to CSV using AppleScript

osascript <<APPLESCRIPT
tell application "Numbers"
    set docPath to POSIX file "$(pwd)/player list.numbers"
    open docPath
    set doc to front document
    set sheet to active sheet of doc
    set table to first table of sheet
    
    -- Get table data
    set rowCount to count of rows of table
    set colCount to count of columns of table
    
    set csvData to ""
    
    -- Get headers
    repeat with col from 1 to colCount
        set cellValue to value of cell col of row 1 of table
        if cellValue is missing value then set cellValue to ""
        set csvData to csvData & cellValue
        if col < colCount then set csvData to csvData & ","
    end repeat
    set csvData to csvData & return
    
    -- Get data rows
    repeat with row from 2 to rowCount
        repeat with col from 1 to colCount
            set cellValue to value of cell col of row row of table
            if cellValue is missing value then set cellValue to ""
            set csvData to csvData & cellValue
            if col < colCount then set csvData to csvData & ","
        end repeat
        set csvData to csvData & return
    end repeat
    
    -- Write to file
    set outputPath to POSIX file "$(pwd)/player_list.csv"
    set fileRef to open for access outputPath with write permission
    write csvData to fileRef as «class utf8»
    close access fileRef
    
    close doc
end tell
APPLESCRIPT
