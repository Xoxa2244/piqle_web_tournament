import { ArrowLeft, Camera, Save, User, Mail, MapPin, Phone, Calendar, Award, Instagram, Twitter, Link as LinkIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

export function ProfileEditPage() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "Alex",
    lastName: "Morgan",
    username: "alexm",
    email: "alex@example.com",
    phone: "+1 (555) 123-4567",
    location: "Los Angeles, CA",
    bio: "Passionate pickleball player. Love the competitive spirit and community vibes! 🎾",
    birthdate: "1995-05-15",
    skillLevel: "4.23",
    preferredPosition: "Both",
    instagram: "alexm_pickleball",
    twitter: "alexm",
    website: ""
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    navigate("/profile");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-[var(--surface-elevated)] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 h-16">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent font-semibold">Edit Profile</h1>
          <Button
            onClick={handleSave}
            className="h-9 px-4 rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]"
          >
            {isSaving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Save className="w-4 h-4" />
              </motion.div>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Profile Photo */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Profile Photo</h3>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--brand-secondary)] to-[var(--brand-primary)] flex items-center justify-center text-white text-2xl font-bold">
                AM
              </div>
              <button className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-[var(--brand-primary)] flex items-center justify-center text-white border-4 border-card shadow-lg">
                <Camera className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-2">
                Click the camera icon to upload a new photo
              </p>
              <p className="text-xs text-muted-foreground">
                Recommended: Square image, at least 400x400px
              </p>
            </div>
          </div>
        </Card>

        {/* Personal Information */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Personal Information</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="firstName" className="mb-2 block text-sm text-muted-foreground">
                First Name
              </Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="lastName" className="mb-2 block text-sm text-muted-foreground">
                Last Name
              </Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="username" className="mb-2 block text-sm text-muted-foreground">
                Username
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => handleChange("username", e.target.value)}
                  className="rounded-xl pl-8"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="bio" className="mb-2 block text-sm text-muted-foreground">
                Bio
              </Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleChange("bio", e.target.value)}
                className="rounded-xl min-h-24 resize-none"
                placeholder="Tell us about yourself..."
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                {formData.bio.length}/200 characters
              </p>
            </div>
          </div>
        </Card>

        {/* Contact Information */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Contact Information</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="mb-2 block text-sm text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="mb-2 block text-sm text-muted-foreground">
                Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="location" className="mb-2 block text-sm text-muted-foreground">
                Location
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleChange("location", e.target.value)}
                className="rounded-xl"
                placeholder="City, State"
              />
            </div>

            <div>
              <Label htmlFor="birthdate" className="mb-2 block text-sm text-muted-foreground">
                Birth Date
              </Label>
              <Input
                id="birthdate"
                type="date"
                value={formData.birthdate}
                onChange={(e) => handleChange("birthdate", e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
        </Card>

        {/* Pickleball Profile */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-[var(--brand-primary)]" />
            <h3 className="font-semibold">Pickleball Profile</h3>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="skillLevel" className="mb-2 block text-sm text-muted-foreground">
                DUPR Rating
              </Label>
              <Input
                id="skillLevel"
                type="number"
                step="0.01"
                value={formData.skillLevel}
                onChange={(e) => handleChange("skillLevel", e.target.value)}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Your current DUPR skill rating
              </p>
            </div>

            <div>
              <Label htmlFor="preferredPosition" className="mb-2 block text-sm text-muted-foreground">
                Preferred Position
              </Label>
              <select
                id="preferredPosition"
                value={formData.preferredPosition}
                onChange={(e) => handleChange("preferredPosition", e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[var(--input-background)] border border-border text-foreground"
              >
                <option value="Singles">Singles</option>
                <option value="Doubles">Doubles</option>
                <option value="Both">Both</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Social Links */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Social Links</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="instagram" className="mb-2 block text-sm text-muted-foreground">
                Instagram
              </Label>
              <div className="flex items-center gap-2 bg-[var(--input-background)] border border-border rounded-xl px-3">
                <Instagram className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">@</span>
                <input
                  id="instagram"
                  value={formData.instagram}
                  onChange={(e) => handleChange("instagram", e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none py-2.5 text-foreground"
                  placeholder="username"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="twitter" className="mb-2 block text-sm text-muted-foreground">
                Twitter / X
              </Label>
              <div className="flex items-center gap-2 bg-[var(--input-background)] border border-border rounded-xl px-3">
                <Twitter className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">@</span>
                <input
                  id="twitter"
                  value={formData.twitter}
                  onChange={(e) => handleChange("twitter", e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none py-2.5 text-foreground"
                  placeholder="username"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="website" className="mb-2 block text-sm text-muted-foreground">
                Website
              </Label>
              <div className="flex items-center gap-2 bg-[var(--input-background)] border border-border rounded-xl px-3">
                <LinkIcon className="w-4 h-4 text-muted-foreground" />
                <input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none py-2.5 text-foreground"
                  placeholder="https://your-website.com"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}