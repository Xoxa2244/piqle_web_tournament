import { X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Checkbox } from "../ui/checkbox";
import { useState } from "react";

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
}

export function FilterSheet({ open, onClose }: FilterSheetProps) {
  const [priceRange, setPriceRange] = useState([0, 200]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);

  const formats = ["Round Robin", "Single Elimination", "Double Elimination", "Indy League", "Ladder"];
  const divisions = ["Open", "Pro", "4.5+", "4.0", "3.5", "3.0", "Beginner"];

  const toggleFormat = (format: string) => {
    setSelectedFormats(prev =>
      prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]
    );
  };

  const toggleDivision = (division: string) => {
    setSelectedDivisions(prev =>
      prev.includes(division) ? prev.filter(d => d !== division) : [...prev, division]
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl p-6 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Filters</h2>
        </div>

        <div className="space-y-6 overflow-y-auto h-[calc(100%-120px)] pr-2">
          {/* Price Range */}
          <div className="space-y-3">
            <Label>Price Range</Label>
            <div className="px-2">
              <Slider
                value={priceRange}
                onValueChange={setPriceRange}
                min={0}
                max={200}
                step={5}
              />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground px-2">
              <span>${priceRange[0]}</span>
              <span>${priceRange[1]}</span>
            </div>
          </div>

          {/* Format */}
          <div className="space-y-3">
            <Label>Format</Label>
            <div className="space-y-2">
              {formats.map((format) => (
                <div key={format} className="flex items-center space-x-2">
                  <Checkbox
                    id={`format-${format}`}
                    checked={selectedFormats.includes(format)}
                    onCheckedChange={() => toggleFormat(format)}
                  />
                  <label
                    htmlFor={`format-${format}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {format}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Divisions */}
          <div className="space-y-3">
            <Label>Divisions</Label>
            <div className="flex flex-wrap gap-2">
              {divisions.map((division) => (
                <Button
                  key={division}
                  variant={selectedDivisions.includes(division) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleDivision(division)}
                  className="rounded-full"
                >
                  {division}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-border bg-background flex gap-3">
          <Button variant="outline" className="flex-1 rounded-full" onClick={() => {
            setPriceRange([0, 200]);
            setSelectedFormats([]);
            setSelectedDivisions([]);
          }}>
            Clear All
          </Button>
          <Button className="flex-1 rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]" onClick={onClose}>
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}