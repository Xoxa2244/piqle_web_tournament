import { Sun, Moon, Palette, Sparkles } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

export function ThemeShowcasePage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-[var(--surface-elevated)] pb-20 px-4 pt-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center">
            <Palette className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl">Theme Showcase</h1>
            <p className="text-muted-foreground">Light & Dark Mode Demo</p>
          </div>
        </div>
      </div>

      {/* Current Theme Card */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-purple)]/10 border-[var(--brand-primary)]/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {theme === 'light' ? (
              <Sun className="w-8 h-8 text-warning" />
            ) : (
              <Moon className="w-8 h-8 text-brand-primary" />
            )}
            <div>
              <h3 className="font-semibold">Current Theme</h3>
              <p className="text-sm text-muted-foreground capitalize">{theme} Mode</p>
            </div>
          </div>
          <Badge className="bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20">
            Active
          </Badge>
        </div>
        <Button 
          onClick={toggleTheme}
          className="w-full rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]"
        >
          Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
        </Button>
      </Card>

      {/* Color Palette */}
      <h3 className="font-semibold mb-4">Brand Colors</h3>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="w-full h-20 rounded-xl bg-[var(--brand-primary)] mb-3" />
          <div className="font-medium">Primary</div>
          <div className="text-sm text-muted-foreground">#28CD41</div>
        </Card>
        <Card className="p-4">
          <div className="w-full h-20 rounded-xl bg-[var(--brand-secondary)] mb-3" />
          <div className="font-medium">Secondary</div>
          <div className="text-sm text-muted-foreground">#00E87C</div>
        </Card>
        <Card className="p-4">
          <div className="w-full h-20 rounded-xl bg-[var(--brand-accent)] mb-3" />
          <div className="font-medium">Accent</div>
          <div className="text-sm text-muted-foreground">#1FA035</div>
        </Card>
        <Card className="p-4">
          <div className="w-full h-20 rounded-xl bg-[var(--brand-purple)] mb-3" />
          <div className="font-medium">Light</div>
          <div className="text-sm text-muted-foreground">#52E068</div>
        </Card>
      </div>

      {/* Surface Colors */}
      <h3 className="font-semibold mb-4">Surface Colors</h3>
      <div className="space-y-3 mb-6">
        <Card className="p-4 bg-background">
          <div className="font-medium mb-1">Background</div>
          <div className="text-sm text-muted-foreground">Main app background</div>
        </Card>
        <Card className="p-4 bg-card">
          <div className="font-medium mb-1">Card</div>
          <div className="text-sm text-muted-foreground">Card and panel surfaces</div>
        </Card>
        <Card className="p-4 bg-[var(--surface-elevated)]">
          <div className="font-medium mb-1">Surface Elevated</div>
          <div className="text-sm text-muted-foreground">Elevated surfaces</div>
        </Card>
      </div>

      {/* Components Showcase */}
      <h3 className="font-semibold mb-4">Components</h3>
      <div className="space-y-3 mb-6">
        <Card className="p-4">
          <h4 className="font-medium mb-3">Buttons</h4>
          <div className="flex flex-wrap gap-2">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="font-medium mb-3">Badges</h4>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge className="bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20">
              Success
            </Badge>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="font-medium mb-3">Typography</h4>
          <div className="space-y-2">
            <h1>Heading 1</h1>
            <h2>Heading 2</h2>
            <h3>Heading 3</h3>
            <h4>Heading 4</h4>
            <p>Body text with <span className="text-[var(--brand-primary)]">primary color</span></p>
            <p className="text-muted-foreground">Muted text</p>
          </div>
        </Card>
      </div>

      {/* Features */}
      <Card className="p-6 bg-gradient-to-br from-[var(--brand-primary)]/5 to-[var(--brand-purple)]/5 border-[var(--brand-primary)]/20">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-[var(--brand-primary)]" />
          <h4 className="font-semibold">Theme Features</h4>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
            Smooth 300ms color transitions
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
            Persistent theme preferences
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
            System preference detection
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
            Premium gradients & animations
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
            WCAG AA contrast compliance
          </li>
        </ul>
      </Card>
    </div>
  );
}