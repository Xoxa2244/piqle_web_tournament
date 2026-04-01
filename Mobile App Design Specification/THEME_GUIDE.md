# Piqle Theme System

## Overview

The Piqle app features a complete dark/light theme system with smooth transitions and persistent user preferences.

## Features

✅ **Light & Dark Modes** - Full support for both themes with carefully crafted color palettes
✅ **Smooth Transitions** - Beautiful 300ms animations when switching themes
✅ **Persistent Preferences** - Theme choice is saved to localStorage
✅ **System Preference Detection** - Automatically detects system theme preference on first visit
✅ **Multiple Toggle Components** - Full and compact versions for different UI contexts

## Usage

### Theme Context

The theme is managed through React Context. The `ThemeProvider` wraps the entire app in `/src/app/App.tsx`:

```tsx
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      {/* Your app content */}
    </ThemeProvider>
  );
}
```

### Using the Theme Hook

Access theme state and controls anywhere in your app:

```tsx
import { useTheme } from '../contexts/ThemeContext';

function MyComponent() {
  const { theme, toggleTheme, setTheme } = useTheme();
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
    </div>
  );
}
```

### Theme Toggle Components

Two pre-built components are available:

#### 1. ThemeToggle (Full Version)
Perfect for settings pages. Shows icons, labels, and descriptions.

```tsx
import { ThemeToggle } from '../components/ThemeToggle';

<ThemeToggle />
```

**Location**: Profile Page → Settings Tab

#### 2. ThemeToggleCompact (Minimal Version)
Compact button for headers and navigation. Just the icon with animations.

```tsx
import { ThemeToggleCompact } from '../components/ThemeToggle';

<ThemeToggleCompact />
```

**Locations**: Fixed top-right on Home, Tournaments, Clubs, and Chats pages

## Theme Colors

### Light Mode
- Background: `#ffffff`
- Foreground: `#0a0a0a`
- Card: `#ffffff`
- Surface Elevated: `#f8f9fa`
- Border: `rgba(0, 0, 0, 0.08)`

### Dark Mode
- Background: `#0a0a0a`
- Foreground: `#f8f9fa`
- Card: `#1a1a1a`
- Surface Elevated: `#222222`
- Border: `rgba(255, 255, 255, 0.1)`

### Brand Colors (Theme-Independent)
- Primary: `#00d9ff` (Cyan)
- Secondary: `#00ff88` (Green)
- Accent: `#ff006e` (Pink)
- Purple: `#7b2cbf`

## CSS Variables

All theme colors are defined as CSS custom properties in `/src/styles/theme.css`:

```css
:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  /* ... more colors */
}

.dark {
  --background: #0a0a0a;
  --foreground: #f8f9fa;
  /* ... more colors */
}
```

### Using CSS Variables

In your components, reference colors using Tailwind classes or CSS variables:

```tsx
// Tailwind classes (recommended)
<div className="bg-background text-foreground border-border">

// Direct CSS variables
<div style={{ background: 'var(--background)' }}>

// Tailwind with CSS variables
<div className="bg-[var(--brand-primary)]">
```

## Animations

Theme transitions are smooth thanks to CSS transitions on all color properties:

```css
* {
  transition: background-color 0.3s ease, 
              border-color 0.3s ease, 
              color 0.3s ease;
}
```

The toggle button itself features animated icon rotations and scale effects for a premium feel.

## Testing Themes

1. **Manual Toggle**: Click the theme toggle button in the top-right corner or in Profile → Settings
2. **System Preference**: Clear localStorage and refresh - the app will match your OS theme
3. **Persistence**: Toggle the theme, refresh the page - your choice is remembered

## Customization

### Adding New Colors

1. Add to `:root` and `.dark` in `/src/styles/theme.css`
2. Add to `@theme inline` section for Tailwind support
3. Use in components with `className` or `style`

### Custom Theme Toggle

Create your own toggle using the `useTheme` hook:

```tsx
import { useTheme } from '../contexts/ThemeContext';
import { Moon, Sun } from 'lucide-react';

export function CustomToggle() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button onClick={toggleTheme}>
      {theme === 'light' ? <Moon /> : <Sun />}
    </button>
  );
}
```

## Browser Support

- ✅ Chrome/Edge 88+
- ✅ Firefox 85+
- ✅ Safari 14+
- ✅ iOS Safari 14+
- ✅ Chrome Android 88+

## Accessibility

- Theme toggle buttons have proper `aria-label` attributes
- Color contrast ratios meet WCAG AA standards in both themes
- Focus states are clearly visible in both themes
- System preference is respected for users who rely on OS-level theme settings
