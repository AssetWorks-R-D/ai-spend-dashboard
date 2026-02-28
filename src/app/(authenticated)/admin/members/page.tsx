"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VENDOR_COLORS, VENDOR_LABELS } from "@/lib/vendor-colors";
import { Plus, Link2, Unlink } from "lucide-react";
import type { VendorType } from "@/types";

interface Member {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  identities?: Identity[];
}

interface Identity {
  id: string;
  vendor: string;
  vendorUsername: string | null;
  vendorEmail: string | null;
}

const ALL_VENDORS: VendorType[] = ["cursor", "claude", "copilot", "kiro", "replit", "openai"];

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Create member dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "" });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Link identity dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkMember, setLinkMember] = useState<Member | null>(null);
  const [linkForm, setLinkForm] = useState({ vendor: "", vendorUsername: "", vendorEmail: "" });
  const [linking, setLinking] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/members");
      const json = await res.json();
      const memberList = json.data || [];
      // Fetch identities for each member
      const enriched = await Promise.all(
        memberList.map(async (m: Member) => {
          const detailRes = await fetch(`/api/members/${m.id}`);
          const detail = await detailRes.json();
          return { ...m, identities: detail.data?.identities || [] };
        })
      );
      setMembers(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error?.message || "Failed to create member");
        return;
      }
      setCreateOpen(false);
      setCreateForm({ name: "", email: "" });
      fetchMembers();
    } catch {
      setCreateError("Failed to create member");
    } finally {
      setCreating(false);
    }
  }

  function openLink(member: Member) {
    setLinkMember(member);
    setLinkForm({ vendor: "", vendorUsername: "", vendorEmail: "" });
    setLinkOpen(true);
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkMember) return;
    setLinking(true);
    try {
      await fetch(`/api/members/${linkMember.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkForm),
      });
      setLinkOpen(false);
      fetchMembers();
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(memberId: string, identityId: string) {
    await fetch(`/api/members/${memberId}?identityId=${identityId}`, { method: "DELETE" });
    fetchMembers();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">
            Members
            {!loading && (
              <span className="ml-2 text-base font-normal text-(--text-secondary)">
                ({members.length})
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Manage team members and link vendor accounts.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Member
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-(--card-border) bg-(--card-bg)">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Linked Accounts</TableHead>
              <TableHead className="w-25">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-(--text-secondary)">Loading...</TableCell>
              </TableRow>
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-(--text-secondary)">
                  No members yet. Add your team members to start tracking.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(m.identities || []).map((id) => (
                        <Badge
                          key={id.id}
                          variant="outline"
                          className="gap-1"
                          style={{ borderColor: VENDOR_COLORS[id.vendor as VendorType]?.primary }}
                        >
                          {VENDOR_LABELS[id.vendor as VendorType] || id.vendor}
                          <button
                            onClick={() => handleUnlink(m.id, id.id)}
                            className="ml-0.5 opacity-50 hover:opacity-100"
                            title="Unlink"
                          >
                            <Unlink className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {(m.identities || []).length === 0 && (
                        <span className="text-xs text-(--text-secondary)">None linked</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openLink(m)} title="Link account">
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Member Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>Add a team member to track their AI tool usage.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Identity Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Vendor Account</DialogTitle>
            <DialogDescription>
              Link a vendor account to {linkMember?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLink} className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select value={linkForm.vendor} onValueChange={(v) => setLinkForm((f) => ({ ...f, vendor: v }))}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {ALL_VENDORS.map((v) => (
                    <SelectItem key={v} value={v}>{VENDOR_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Username (optional)</Label>
              <Input
                value={linkForm.vendorUsername}
                onChange={(e) => setLinkForm((f) => ({ ...f, vendorUsername: e.target.value }))}
                placeholder="Vendor-specific username"
              />
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={linkForm.vendorEmail}
                onChange={(e) => setLinkForm((f) => ({ ...f, vendorEmail: e.target.value }))}
                placeholder="Email used on this vendor"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={linking}>
                {linking ? "Linking..." : "Link Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
