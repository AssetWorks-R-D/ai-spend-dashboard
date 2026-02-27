"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DISPLAY_MODES = [
  { value: "named", label: "Named", description: "Full names visible to all users" },
  { value: "initialed", label: "Initialed", description: "Show initials only (e.g., D.M.)" },
  { value: "anonymous", label: "Anonymous", description: "Rank and stats only, no names" },
] as const;

export default function AdminSettingsPage() {
  const [mode, setMode] = useState<string>("named");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((json) => {
        if (json.data?.leaderboardDisplayMode) {
          setMode(json.data.leaderboardDisplayMode);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderboardDisplayMode: mode }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setMessage({ type: "success", text: "Settings saved" });
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">Settings</h1>
        <p className="mt-4 text-sm text-(--text-secondary)">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-(--text-primary)">Settings</h1>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>Leaderboard Display Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Controls how team member names appear on the leaderboard for non-admin users.
          </p>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label} — {m.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            {message && (
              <span
                className={`text-sm ${
                  message.type === "success" ? "text-green-600" : "text-red-600"
                }`}
              >
                {message.text}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
