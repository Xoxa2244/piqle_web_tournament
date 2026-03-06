import { ArrowLeft, Bell, Lock, Globe, HelpCircle, Mail, Shield, Eye, UserX, Trash2, LogOut, ChevronRight, Smartphone, Moon, Languages, Volume2, Download, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { ThemeToggle } from "../components/ThemeToggle";

export function SettingsPage() {
  const navigate = useNavigate();

  const [settings, setSettings] = useState({
    notifications: {
      tournamentUpdates: true,
      matchReminders: false,
      chatMessages: true,
      clubAnnouncements: true,
      emailNotifications: false,
      pushNotifications: true,
    },
    privacy: {
      publicProfile: true,
      showStats: true,
      showLocation: true,
      allowMessages: true,
      showActivity: false,
    },
    preferences: {
      soundEffects: true,
      hapticFeedback: true,
      autoPlayVideos: false,
    }
  });

  const toggleSetting = (category: keyof typeof settings, key: string) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: !prev[category][key as keyof typeof prev[typeof category]]
      }
    }));
  };

  const SettingItem = ({ 
    icon: Icon, 
    title, 
    description, 
    value, 
    onChange, 
    type = "switch",
    onClick
  }: { 
    icon: any; 
    title: string; 
    description?: string; 
    value?: boolean; 
    onChange?: () => void;
    type?: "switch" | "link";
    onClick?: () => void;
  }) => (
    <div 
      className="flex items-center justify-between py-3 cursor-pointer active:opacity-70 transition-opacity"
      onClick={type === "link" ? onClick : undefined}
    >
      <div className="flex items-center gap-3 flex-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-purple)]/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[var(--brand-primary)]" />
        </div>
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          {description && (
            <div className="text-sm text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      {type === "switch" && value !== undefined && onChange && (
        <Switch checked={value} onCheckedChange={onChange} />
      )}
      {type === "link" && (
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      )}
    </div>
  );

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
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent font-semibold">Settings</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Account Section */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Account</h3>
          <div className="divide-y divide-border">
            <SettingItem
              icon={Mail}
              title="Email"
              description="alex@example.com"
              type="link"
              onClick={() => {}}
            />
            <SettingItem
              icon={Lock}
              title="Change Password"
              type="link"
              onClick={() => {}}
            />
            <SettingItem
              icon={Smartphone}
              title="Two-Factor Authentication"
              description="Add extra security to your account"
              type="link"
              onClick={() => {}}
            />
          </div>
        </Card>

        {/* Appearance */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Appearance</h3>
          <div className="space-y-4">
            <div>
              <Label className="flex items-center gap-2 mb-3">
                <Moon className="w-4 h-4 text-muted-foreground" />
                Theme
              </Label>
              <ThemeToggle />
            </div>
            <div className="pt-3 border-t border-border">
              <SettingItem
                icon={Languages}
                title="Language"
                description="English (US)"
                type="link"
                onClick={() => {}}
              />
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-[var(--brand-primary)]" />
            Notifications
          </h3>
          <div className="space-y-1 divide-y divide-border">
            <SettingItem
              icon={Bell}
              title="Push Notifications"
              description="Receive notifications on your device"
              value={settings.notifications.pushNotifications}
              onChange={() => toggleSetting("notifications", "pushNotifications")}
            />
            <SettingItem
              icon={Mail}
              title="Email Notifications"
              description="Get updates via email"
              value={settings.notifications.emailNotifications}
              onChange={() => toggleSetting("notifications", "emailNotifications")}
            />
            <SettingItem
              icon={Bell}
              title="Tournament Updates"
              description="Schedule changes and announcements"
              value={settings.notifications.tournamentUpdates}
              onChange={() => toggleSetting("notifications", "tournamentUpdates")}
            />
            <SettingItem
              icon={Bell}
              title="Match Reminders"
              description="Remind me before scheduled matches"
              value={settings.notifications.matchReminders}
              onChange={() => toggleSetting("notifications", "matchReminders")}
            />
            <SettingItem
              icon={Bell}
              title="Chat Messages"
              description="New messages from chats"
              value={settings.notifications.chatMessages}
              onChange={() => toggleSetting("notifications", "chatMessages")}
            />
            <SettingItem
              icon={Bell}
              title="Club Announcements"
              description="Updates from your clubs"
              value={settings.notifications.clubAnnouncements}
              onChange={() => toggleSetting("notifications", "clubAnnouncements")}
            />
          </div>
        </Card>

        {/* Privacy & Security */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--brand-primary)]" />
            Privacy & Security
          </h3>
          <div className="space-y-1 divide-y divide-border">
            <SettingItem
              icon={Eye}
              title="Public Profile"
              description="Allow others to view your profile"
              value={settings.privacy.publicProfile}
              onChange={() => toggleSetting("privacy", "publicProfile")}
            />
            <SettingItem
              icon={Eye}
              title="Show Stats"
              description="Display your stats publicly"
              value={settings.privacy.showStats}
              onChange={() => toggleSetting("privacy", "showStats")}
            />
            <SettingItem
              icon={Globe}
              title="Show Location"
              description="Display your location on profile"
              value={settings.privacy.showLocation}
              onChange={() => toggleSetting("privacy", "showLocation")}
            />
            <SettingItem
              icon={Mail}
              title="Allow Messages"
              description="Let other users message you"
              value={settings.privacy.allowMessages}
              onChange={() => toggleSetting("privacy", "allowMessages")}
            />
            <SettingItem
              icon={Eye}
              title="Show Activity"
              description="Let others see your recent activity"
              value={settings.privacy.showActivity}
              onChange={() => toggleSetting("privacy", "showActivity")}
            />
            <SettingItem
              icon={UserX}
              title="Blocked Users"
              type="link"
              onClick={() => {}}
            />
          </div>
        </Card>

        {/* About & Support */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">About & Support</h3>
          <div className="divide-y divide-border">
            <SettingItem
              icon={HelpCircle}
              title="Help Center"
              type="link"
              onClick={() => {}}
            />
            <SettingItem
              icon={ExternalLink}
              title="Terms of Service"
              type="link"
              onClick={() => {}}
            />
            <SettingItem
              icon={ExternalLink}
              title="Privacy Policy"
              type="link"
              onClick={() => {}}
            />
            <SettingItem
              icon={Mail}
              title="Contact Support"
              type="link"
              onClick={() => {}}
            />
          </div>
          <div className="mt-4 pt-4 border-t border-border text-center text-sm text-muted-foreground">
            Piqle v1.0.0
          </div>
        </Card>

        {/* Data & Storage */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Data & Storage</h3>
          <div className="divide-y divide-border">
            <SettingItem
              icon={Download}
              title="Download My Data"
              description="Get a copy of your data"
              type="link"
              onClick={() => {}}
            />
            <SettingItem
              icon={Trash2}
              title="Clear Cache"
              description="Free up storage space"
              type="link"
              onClick={() => {}}
            />
          </div>
        </Card>

        {/* Account Actions */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Account Actions</h3>
          <div className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full rounded-full justify-start"
              onClick={() => {}}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log Out
            </Button>
            <Button 
              variant="destructive" 
              className="w-full rounded-full justify-start"
              onClick={() => navigate("/profile/edit")}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}