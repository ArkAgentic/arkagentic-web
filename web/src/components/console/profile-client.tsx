"use client";

import { useEffect, useState } from "react";
import { buildMockJwt, parseJwtPayload, setAuthToken } from "@/lib/auth-provider";
import { readSessionUser, writeSessionUser } from "@/lib/auth-session";

type ProfilePayload = {
  userId: string;
  email: string;
  name: string;
  phone: string;
  role: "user" | "admin";
  createdAt: string;
};

export function ProfileClientPanel() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/console/profile", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load profile");
        return (await res.json()) as ProfilePayload;
      })
      .then((data) => {
        setProfile(data);
        setName(data.name || "");
        setEmail(data.email || "");
        setPhone(data.phone || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load profile"));
  }, []);

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/console/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const body = (await res.json()) as ProfilePayload | { error?: string };
      if (!res.ok) throw new Error((body as { error?: string }).error || "Update failed");
      const next = body as ProfilePayload;
      setProfile(next);
      setName(next.name || "");
      setEmail(next.email || "");
      setPhone(next.phone || "");

      const sessionUser = readSessionUser();
      if (sessionUser) {
        writeSessionUser({ ...sessionUser, email: next.email, name: next.name });
      }

      const token = typeof window !== "undefined" ? window.localStorage.getItem("ark_jwt_token") : null;
      if (token) {
        const payload = parseJwtPayload(token);
        if (payload) {
          setAuthToken(
            buildMockJwt({
              ...payload,
              email: next.email,
            }),
          );
        }
      }

      setMessage("Profile updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (!profile && !error) {
    return <div className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 text-sm text-stone-600">Loading profile...</div>;
  }

  return (
    <div className="rounded-2xl border border-amber-100/60 bg-white/90 p-6 shadow-[0_16px_34px_rgba(92,56,19,0.10)]">
      <h2 className="text-lg font-semibold text-stone-900">Profile</h2>
      <p className="mt-1 text-sm text-stone-600">Update your account information for contact and billing notifications.</p>

      <div className="mt-6 grid gap-4">
        <label className="grid gap-1.5 text-sm text-stone-700">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-stone-900" />
        </label>

        <label className="grid gap-1.5 text-sm text-stone-700">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-stone-900" />
        </label>

        <label className="grid gap-1.5 text-sm text-stone-700">
          <span>Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+86 ..." className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-stone-900" />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-[#D6A04D] via-[#D7963A] to-[#B4693D] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
        {message ? <span className="text-sm text-emerald-700">{message}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
