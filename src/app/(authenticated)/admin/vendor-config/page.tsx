"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VENDOR_COLORS, VENDOR_LABELS } from "@/lib/vendor-colors";
import { Save, Plug, RefreshCw, Users } from "lucide-react";
import type { ApiVendor } from "@/types";

const API_VENDORS: ApiVendor[] = ["cursor", "claude", "copilot", "kiro", "replit"];

const VENDOR_CREDENTIAL_FIELDS: Record<ApiVendor, { key: string; label: string; type?: string }[]> = {
  cursor: [
    { key: "apiKey", label: "Admin API Key", type: "password" },
  ],
  claude: [
    { key: "organizationId", label: "Organization ID" },
    { key: "apiKey", label: "Admin API Key (Enterprise)", type: "password" },
  ],
  copilot: [
    { key: "organization", label: "GitHub Organization" },
    { key: "pat", label: "Personal Access Token", type: "password" },
  ],
  kiro: [
    { key: "teamId", label: "Team ID" },
    { key: "apiKey", label: "API Key", type: "password" },
  ],
  replit: [
    { key: "sessionCookie", label: "Session Cookie (run: npx tsx scripts/replit-auth.ts)", type: "password" },
    { key: "teamSlug", label: "Team Slug (optional)" },
  ],
};

interface VendorConfigData {
  vendor: string;
  hasCredentials: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

export default function VendorConfigPage() {
  const [configs, setConfigs] = useState<Record<string, VendorConfigData>>({});
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncResults, setSyncResults] = useState<Record<string, { success: boolean; count?: number } | null>>({});
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{ membersCreated: number; identitiesMatched: number; recordsLinked: number; totalMembers: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/vendor-config");
      const json = await res.json();
      const configMap: Record<string, VendorConfigData> = {};
      for (const c of json.data || []) {
        configMap[c.vendor] = c;
      }
      setConfigs(configMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  function updateForm(vendor: string, key: string, value: string) {
    setForms((prev) => ({
      ...prev,
      [vendor]: { ...prev[vendor], [key]: value },
    }));
  }

  async function handleSave(vendor: ApiVendor) {
    setSaving((s) => ({ ...s, [vendor]: true }));
    try {
      const res = await fetch(`/api/vendor-config/${vendor}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: forms[vendor] || {} }),
      });
      if (res.ok) {
        fetchConfigs();
        setForms((prev) => ({ ...prev, [vendor]: {} }));
      }
    } finally {
      setSaving((s) => ({ ...s, [vendor]: false }));
    }
  }

  async function handleTest(vendor: ApiVendor) {
    setTesting((t) => ({ ...t, [vendor]: true }));
    setTestResults((r) => ({ ...r, [vendor]: null }));
    try {
      const res = await fetch(`/api/vendor-config/${vendor}`, { method: "POST" });
      const json = await res.json();
      if (json.data?.success) {
        setTestResults((r) => ({ ...r, [vendor]: true }));
      } else {
        setTestResults((r) => ({ ...r, [vendor]: json.data?.message || json.error?.message || false }));
      }
    } catch {
      setTestResults((r) => ({ ...r, [vendor]: false }));
    } finally {
      setTesting((t) => ({ ...t, [vendor]: false }));
    }
  }

  async function handleReconcile() {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch("/api/admin/members/reconcile", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setReconcileResult(json.data);
      }
    } finally {
      setReconciling(false);
    }
  }

  async function handleSync(vendor: ApiVendor) {
    setSyncing((s) => ({ ...s, [vendor]: true }));
    setSyncResults((r) => ({ ...r, [vendor]: null }));
    try {
      const res = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor }),
      });
      const json = await res.json();
      if (res.ok) {
        setSyncResults((r) => ({ ...r, [vendor]: { success: true, count: json.data?.recordsImported } }));
        fetchConfigs();
      } else {
        setSyncResults((r) => ({ ...r, [vendor]: { success: false } }));
      }
    } catch {
      setSyncResults((r) => ({ ...r, [vendor]: { success: false } }));
    } finally {
      setSyncing((s) => ({ ...s, [vendor]: false }));
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">Vendor Configuration</h1>
        <p className="mt-2 text-sm text-(--text-secondary)">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">Vendor Configuration</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Configure API credentials and scraper logins for each vendor.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {API_VENDORS.map((vendor) => {
          const config = configs[vendor];
          const fields = VENDOR_CREDENTIAL_FIELDS[vendor];
          const colors = VENDOR_COLORS[vendor];

          return (
            <Card key={vendor}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: colors.primary }}
                    />
                    {VENDOR_LABELS[vendor]}
                  </CardTitle>
                  {config?.hasCredentials ? (
                    <Badge variant="secondary">Configured</Badge>
                  ) : (
                    <Badge variant="outline">Not configured</Badge>
                  )}
                </div>
                <CardDescription>
                  {config?.lastSyncAt
                    ? `Last sync: ${new Date(config.lastSyncAt).toLocaleString()}`
                    : "Never synced"}
                  {config?.lastSyncStatus && config.lastSyncStatus !== "success" && (
                    <span className="ml-2 text-destructive">({config.lastSyncStatus})</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); handleSave(vendor); }} className="space-y-3">
                  {fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label htmlFor={`${vendor}-${field.key}`} className="text-xs">
                        {field.label}
                      </Label>
                      <Input
                        id={`${vendor}-${field.key}`}
                        type={field.type || "text"}
                        placeholder={config?.hasCredentials ? "••••••••" : `Enter ${field.label}`}
                        value={forms[vendor]?.[field.key] || ""}
                        onChange={(e) => updateForm(vendor, field.key, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saving[vendor]}
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      {saving[vendor] ? "Saving..." : "Save"}
                    </Button>
                    {config?.hasCredentials && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(vendor)}
                        disabled={testing[vendor]}
                      >
                        <Plug className="mr-1.5 h-3.5 w-3.5" />
                        {testing[vendor] ? "Testing..." : "Test Connection"}
                      </Button>
                    )}
                  </div>
                  {config?.hasCredentials && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleSync(vendor)}
                        disabled={syncing[vendor]}
                      >
                        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing[vendor] ? "animate-spin" : ""}`} />
                        {syncing[vendor] ? "Syncing..." : "Sync Now"}
                      </Button>
                    </div>
                  )}
                  {testResults[vendor] !== undefined && testResults[vendor] !== null && (
                    <p className={`text-sm ${testResults[vendor] === true ? "text-green-600" : "text-destructive"}`}>
                      {testResults[vendor] === true ? "Connection successful" : typeof testResults[vendor] === "string" ? testResults[vendor] : "Connection failed"}
                    </p>
                  )}
                  {syncResults[vendor] && (
                    <p className={`text-sm ${syncResults[vendor]!.success ? "text-green-600" : "text-destructive"}`}>
                      {syncResults[vendor]!.success
                        ? `Synced ${syncResults[vendor]!.count ?? 0} records`
                        : "Sync failed"}
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Member Reconciliation
          </CardTitle>
          <CardDescription>
            After syncing, reconcile vendor identities to match users across Cursor, Copilot, and Claude.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            size="sm"
            onClick={handleReconcile}
            disabled={reconciling}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reconciling ? "animate-spin" : ""}`} />
            {reconciling ? "Reconciling..." : "Reconcile Members"}
          </Button>
          {reconcileResult && (
            <p className="mt-2 text-sm text-green-600">
              {reconcileResult.membersCreated} new members, {reconcileResult.identitiesMatched} cross-vendor matches, {reconcileResult.recordsLinked} records linked. Total: {reconcileResult.totalMembers} members.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
