"use client";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../mst/wallet-provider";
import { signAppMessage } from "@/lib/mst/wallet";
import { saveProfileAction } from "@/app/actions/profile";
import type { ProfilePrivate } from "@/lib/db/types";
import { Avatar, Button, Modal } from "../ui";

type Me = { address: string | null; hasProfile: boolean; profile: ProfilePrivate | null; dbReady: boolean };

function friendly(error: string): string {
  if (error === "USER_REJECTED") return "Signature rejected in your wallet. Press Sign in again to retry.";
  if (error === "NONCE_EXPIRED") return "Sign-in request expired. Press Sign in again.";
  if (error === "USERNAME_TAKEN") return "That username is taken. Try another.";
  if (error === "INVALID_USERNAME") return "Username must be 3-30 chars: lowercase letters, numbers, underscores.";
  if (error === "INVALID_PHONE") return "Phone must be E.164, e.g. +14155552671.";
  if (error === "DB_NOT_READY") return "Live database is not migrated yet. Run supabase/migrations/0001_init.sql, then retry.";
  if (error === "UNAUTHENTICATED") return "Sign in with your wallet first.";
  return "Something went wrong. Try again.";
}

export function AuthGate() {
  const { address, isConnected } = useWallet();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", bio: "", phone: "", location: "", avatarUrl: "" });

  const refresh = useCallback(async () => {
    if (!address) { setMe(null); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      setMe((await r.json()) as Me);
    } catch { setMe(null); }
    finally { setLoading(false); }
  }, [address]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDismissed(false); setError("");
    if (!address) {
      setMe(null);
      void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      return;
    }
    void refresh();
  }, [address, refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const signIn = async () => {
    if (!address || signing) return;
    setSigning(true); setError("");
    try {
      const n = await (await fetch("/api/auth/nonce", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }),
      })).json() as { message?: string; error?: string };
      if (!n.message) throw new Error(n.error || "NONCE_FAILED");
      const { signature } = await signAppMessage(n.message, address);
      const v = await (await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, signature }),
      })).json() as { ok?: boolean; error?: string };
      if (!v.ok) throw new Error(v.error || "VERIFY_FAILED");
      await refresh();
    } catch (e) {
      setError(friendly(e instanceof Error ? e.message : "SIGN_IN_FAILED"));
    } finally { setSigning(false); }
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarPending(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await (await fetch("/api/uploads/avatar", { method: "POST", body: fd })).json() as { url?: string; error?: string };
      if (!r.url) throw new Error(r.error || "UPLOAD_FAILED");
      setForm((f) => ({ ...f, avatarUrl: r.url ?? "" }));
    } catch (e) {
      setError(friendly(e instanceof Error ? e.message : "UPLOAD_FAILED"));
    } finally { setAvatarPending(false); }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true); setError("");
    const r = await saveProfileAction({
      username: form.username,
      displayName: form.displayName || undefined,
      bio: form.bio || undefined,
      phone: form.phone || undefined,
      avatarUrl: form.avatarUrl || undefined,
      location: form.location || undefined,
    });
    if (!r.ok) { setError(friendly(r.error)); setSaving(false); return; }
    setSaving(false);
    await refresh();
  };

  if (!isConnected || !address) return null;
  const needsAuth = !loading && me && !me.address;
  const needsProfile = !!me?.address && !me.hasProfile;
  const mustAct = !!needsAuth || !!needsProfile;
  if (!mustAct) return null;

  return <>
    {dismissed && <button onClick={() => setDismissed(false)}
      className="fixed bottom-20 md:bottom-6 right-4 z-[70] rounded-full bg-white text-black px-4 py-2 text-xs font-medium shadow-xl">
      {needsAuth ? "Sign in for live features" : "Finish your live profile"}</button>}
    <Modal open={!dismissed} onClose={() => setDismissed(true)}>
      {needsAuth ? <>
        <div className="font-semibold text-lg">Sign in to Echo</div>
        <p className="muted text-sm mt-1">One signature proves you own <span className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span>. No password, no email — and signing never moves funds.</p>
        {!me?.dbReady && <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-200">Live database not migrated yet. You can still browse mock samples; run supabase/migrations/0001_init.sql to unlock live posts, likes, comments and Orbit history.</p>}
        <Button onClick={() => void signIn()} disabled={signing} className="w-full mt-4">
          {signing ? "Check your wallet…" : "Sign in with wallet"}</Button>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
        <button onClick={() => setDismissed(true)} className="mt-3 text-xs muted hover:text-white">Continue read-only for now</button>
      </> : <>
        <div className="font-semibold text-lg">Create your live profile</div>
        <p className="muted text-sm mt-1">This writes one row keyed by your wallet. Mock samples stay untouched.</p>
        <div className="flex items-center gap-3 mt-4">
          <Avatar name={form.displayName || form.username || "YO"} src={form.avatarUrl || null} size={52} />
          <label className="text-xs muted hover:text-white cursor-pointer">
            {avatarPending ? "Uploading…" : form.avatarUrl ? "Change photo" : "Add profile photo (optional)"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
              onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
          </label>
        </div>
        <label className="block text-xs muted mt-4">Username *</label>
        <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="e.g. gajanan" className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-teal-300/50" />
        <label className="block text-xs muted mt-3">Display name</label>
        <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          placeholder="e.g. Gajanan" className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-teal-300/50" />
        <label className="block text-xs muted mt-3">Bio</label>
        <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2}
          placeholder="What do you make?" className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-teal-300/50" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs muted mt-3">Phone (optional)</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+14155552671" className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-teal-300/50" /></div>
          <div><label className="block text-xs muted mt-3">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Mumbai" className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-teal-300/50" /></div>
        </div>
        <Button onClick={() => void save()} disabled={saving || !form.username.trim()} className="w-full mt-4">
          {saving ? "Saving…" : "Save live profile"}</Button>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
        <button onClick={() => setDismissed(true)} className="mt-3 text-xs muted hover:text-white">Decide later</button>
      </>}
    </Modal>
  </>;
}
