"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Member {
  id: string;
  name: string;
  email: string;
}

interface ManualEntry {
  id: string;
  memberId: string;
  memberName: string | null;
  vendor: string;
  spendCents: number;
  tokens: number | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export default function ManualEntryPage() {
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    memberId: "",
    vendor: "replit",
    spendDollars: "",
    tokens: "",
    periodStart: "",
    periodEnd: "",
  });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ManualEntry | null>(null);
  const [editForm, setEditForm] = useState({ spendDollars: "", tokens: "" });
  const [editing, setEditing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, membersRes] = await Promise.all([
        fetch("/api/manual-entry"),
        fetch("/api/members"),
      ]);
      const entriesJson = await entriesRes.json();
      const membersJson = await membersRes.json();
      setEntries(entriesJson.data || []);
      setMembers(membersJson.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set default period to current month
  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setForm((f) => ({
      ...f,
      periodStart: start.toISOString().split("T")[0],
      periodEnd: end.toISOString().split("T")[0],
    }));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const res = await fetch("/api/manual-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: form.memberId,
          vendor: form.vendor,
          spendDollars: parseFloat(form.spendDollars),
          tokens: form.tokens ? parseInt(form.tokens) : null,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error?.message || "Failed to create entry");
        return;
      }
      setCreateOpen(false);
      setForm((f) => ({ ...f, memberId: "", spendDollars: "", tokens: "" }));
      fetchData();
    } catch {
      setCreateError("Failed to create entry");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(entry: ManualEntry) {
    setEditEntry(entry);
    setEditForm({
      spendDollars: (entry.spendCents / 100).toString(),
      tokens: entry.tokens?.toString() || "",
    });
    setEditOpen(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editEntry) return;
    setEditing(true);
    try {
      await fetch(`/api/manual-entry/${editEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spendDollars: parseFloat(editForm.spendDollars),
          tokens: editForm.tokens ? parseInt(editForm.tokens) : null,
        }),
      });
      setEditOpen(false);
      fetchData();
    } finally {
      setEditing(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/manual-entry/${id}`, { method: "DELETE" });
    fetchData();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">Manual Entry</h1>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Enter usage data manually for vendors without API access (Replit).
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Entry
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-(--card-border) bg-(--card-bg)">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="w-25">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-(--text-secondary)">Loading...</TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-(--text-secondary)">
                  No manual entries yet
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.memberName || "Unknown"}</TableCell>
                  <TableCell className="capitalize">{entry.vendor}</TableCell>
                  <TableCell>${(entry.spendCents / 100).toFixed(2)}</TableCell>
                  <TableCell>{entry.tokens?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell className="text-(--text-secondary) text-sm">
                    {new Date(entry.periodStart).toLocaleDateString()} – {new Date(entry.periodEnd).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Entry Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Entry</DialogTitle>
            <DialogDescription>Enter usage data for a team member.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Member</Label>
              <Select value={form.memberId} onValueChange={(v) => setForm((f) => ({ ...f, memberId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select value={form.vendor} onValueChange={(v) => setForm((f) => ({ ...f, vendor: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="replit">Replit</SelectItem>
                  <SelectItem value="cursor">Cursor</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                  <SelectItem value="copilot">Copilot</SelectItem>
                  <SelectItem value="kiro">Kiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Spend ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.spendDollars}
                  onChange={(e) => setForm((f) => ({ ...f, spendDollars: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tokens (optional)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.tokens}
                  onChange={(e) => setForm((f) => ({ ...f, tokens: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                  required
                />
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Adding..." : "Add Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>Update spend and token values.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Spend ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editForm.spendDollars}
                onChange={(e) => setEditForm((f) => ({ ...f, spendDollars: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tokens (optional)</Label>
              <Input
                type="number"
                min="0"
                value={editForm.tokens}
                onChange={(e) => setEditForm((f) => ({ ...f, tokens: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editing}>
                {editing ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
