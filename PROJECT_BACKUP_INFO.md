# Piqle Tournament Management - Project Backup Information

## Backup Date: October 14, 2025

## Current Project State

### ✅ Completed Features
- **Full English Translation**: All UI text, comments, and documentation translated from Russian to English
- **CSV Import System**: Complete CSV import functionality with proper validation
- **Tournament Management**: Full CRUD operations for tournaments
- **Division Management**: Create, edit, and manage tournament divisions
- **Team Management**: Drag-and-drop team assignment to pools
- **Player Management**: Player creation, editing, and assignment to teams
- **Round Robin System**: Generate and manage round robin matches
- **Playoff System**: Play-In and Play-Off bracket generation
- **Public Scoreboard**: Public tournament viewing
- **Delete Tournament**: Safe tournament deletion with confirmation

### 🔧 Recent Fixes Applied
1. **Database Schema Mapping**: Fixed `tournamentId` field mapping with `@map("tournament_id")`
2. **DUPR Fields Separation**: 
   - Added `DUPR ID` field to CSV template
   - Fixed mapping: `dupr` (String) for DUPR ID, `duprRating` (Decimal) for DUPR rating
3. **Pool Assignment**: Fixed pool naming from "Pool A/B" to "1/2" and corrected team assignment logic
4. **CSV Template Updates**: Updated with typical US names instead of Russian names

### 📁 Project Structure
```
Piqle_web/
├── app/                    # Next.js App Router pages
├── components/             # React components
├── server/routers/         # tRPC API routes
├── prisma/                # Database schema and migrations
├── lib/                   # Utility libraries
├── public/                # Static assets and CSV templates
└── tests/                 # Test files
```

### 🗄️ Database Schema
- **PostgreSQL** with Prisma ORM
- **User management** with role-based access
- **Tournament structure** with divisions, teams, players
- **Match system** with games and scoring
- **Audit logging** for all actions

### 🚀 Deployment
- **Vercel** deployment configured
- **Environment variables** set up
- **Database migrations** applied

## Backup Files Created

### 1. Git Tag Backup
- **Tag**: `backup-20251014-173024`
- **Description**: Git tag for easy rollback to current state
- **Restore**: `git checkout backup-20251014-173024`

### 2. Lightweight Backup
- **File**: `Piqle_web_backup_20251014_173024.tar.gz` (18.7 MB)
- **Contains**: All source code, excludes node_modules and logs
- **Restore**: `tar -xzf Piqle_web_backup_20251014_173024.tar.gz`

### 3. Full Backup
- **File**: `Piqle_web_full_backup_20251014_173030.tar.gz` (258 MB)
- **Contains**: Complete project including node_modules
- **Restore**: `tar -xzf Piqle_web_full_backup_20251014_173030.tar.gz`

## How to Restore

### Option 1: Git Tag (Recommended)
```bash
cd /path/to/restore/location
git clone https://github.com/Xoxa2244/piqle_web_tournament.git
cd piqle_web_tournament
git checkout backup-20251014-173024
npm install
```

### Option 2: Lightweight Backup
```bash
cd /path/to/restore/location
tar -xzf Piqle_web_backup_20251014_173024.tar.gz
cd Piqle_web
npm install
```

### Option 3: Full Backup
```bash
cd /path/to/restore/location
tar -xzf Piqle_web_full_backup_20251014_173030.tar.gz
cd Piqle_web
# Ready to run immediately
```

## Environment Setup After Restore

1. **Install dependencies**: `npm install`
2. **Set up environment variables**: Copy `.env.example` to `.env`
3. **Database setup**: `npx prisma migrate deploy`
4. **Generate Prisma client**: `npx prisma generate`

## Key Configuration Files

- `package.json` - Dependencies and scripts
- `prisma/schema.prisma` - Database schema
- `next.config.js` - Next.js configuration
- `tailwind.config.ts` - Styling configuration
- `vercel.json` - Deployment configuration

## Important Notes

- All Russian text has been translated to English
- CSV import now requires both "DUPR ID" and "DUPR rating" columns
- Pool names in CSV should be "1", "2", etc. (not "Pool A", "Pool B")
- Database uses snake_case column names with Prisma camelCase mapping

## Contact Information

- **Repository**: https://github.com/Xoxa2244/piqle_web_tournament
- **Deployment**: Vercel
- **Database**: PostgreSQL via Supabase
