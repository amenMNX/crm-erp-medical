
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  portalGetProfile,
  portalUpdateProfile,
  portalChangePassword,
  type PortalPatient,
  type PortalAccount,
} from "@/lib/patient-portal-api";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { User, Bell, Lock, Save, Eye, EyeOff } from "lucide-react";
 
export const Route = createFileRoute("/patient-portal/profile")({
  component: ProfilePage,
});
 
function ProfilePage() {
  const [patient,  setPatient]  = useState<PortalPatient | null>(null);
  const [account,  setAccount]  = useState<PortalAccount | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [msgType,  setMsgType]  = useState<"ok" | "err">("ok");
 
  // Password fields
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd,     setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [pwdMsg,     setPwdMsg]     = useState("");
  const [pwdType,    setPwdType]    = useState<"ok" | "err">("ok");
  const [pwdLoading, setPwdLoading] = useState(false);
 
  useEffect(() => {
    portalGetProfile()
      .then(({ patient: p, account: a }) => {
        setPatient(p);
        setAccount(a);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
 
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!patient || !account) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await portalUpdateProfile(
        { phone: patient.phone, email: patient.email, address: patient.address },
        { notify_email: account.notify_email, notify_sms: account.notify_sms }
      );
      setPatient(res.patient);
      setAccount(res.account);
      setMsg("Profil mis à jour avec succès.");
      setMsgType("ok");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Erreur.");
      setMsgType("err");
    } finally {
      setSaving(false);
    }
  }
 
  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setPwdMsg("Les mots de passe ne correspondent pas.");
      setPwdType("err");
      return;
    }
    setPwdLoading(true);
    setPwdMsg("");
    try {
      await portalChangePassword(currentPwd, newPwd, confirmPwd);
      setPwdMsg("Mot de passe modifié avec succès.");
      setPwdType("ok");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e: unknown) {
      setPwdMsg(e instanceof Error ? e.message : "Erreur.");
      setPwdType("err");
    } finally {
      setPwdLoading(false);
    }
  }
 
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-64 bg-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }
 
  if (!patient || !account) return null;
 
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Mon profil</h1>
 
      {/* ── Coordonnées + Notifications ── */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-5">
          <User className="h-4 w-4 text-primary" />
          Mes coordonnées
        </h2>
 
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Prénom</Label>
              <Input value={patient.first_name} disabled className="mt-1 bg-gray-50" />
            </div>
            <div>
              <Label className="text-xs">Nom</Label>
              <Input value={patient.last_name} disabled className="mt-1 bg-gray-50" />
            </div>
          </div>
 
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={patient.email ?? ""}
              onChange={(e) => setPatient({ ...patient, email: e.target.value })}
              className="mt-1"
            />
          </div>
 
          <div>
            <Label className="text-xs">Téléphone</Label>
            <Input
              value={patient.phone ?? ""}
              onChange={(e) => setPatient({ ...patient, phone: e.target.value })}
              className="mt-1"
            />
          </div>
 
          <div>
            <Label className="text-xs">Adresse</Label>
            <Input
              value={patient.address ?? ""}
              onChange={(e) => setPatient({ ...patient, address: e.target.value })}
              className="mt-1"
            />
          </div>
 
          {/* Notifications */}
          <div className="pt-2 border-t space-y-3">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={account.notify_email}
                onChange={(e) =>
                  setAccount({ ...account, notify_email: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <div>
                <p className="text-sm text-gray-700">Notifications par email</p>
                <p className="text-xs text-gray-400">Rappels de RDV, messages, résultats</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={account.notify_sms}
                onChange={(e) =>
                  setAccount({ ...account, notify_sms: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <div>
                <p className="text-sm text-gray-700">Notifications par SMS</p>
                <p className="text-xs text-gray-400">Rappels de rendez-vous uniquement</p>
              </div>
            </label>
          </div>
 
          {msg && (
            <p
              className={`text-sm rounded-lg p-2 ${
                msgType === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {msg}
            </p>
          )}
 
          <Button type="submit" disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </form>
      </div>
 
      {/* ── Changement MDP ── */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-5">
          <Lock className="h-4 w-4 text-primary" />
          Changer de mot de passe
        </h2>
 
        <form onSubmit={handlePasswordChange} className="space-y-4">
          {[
            { id: "curr", label: "Mot de passe actuel",  val: currentPwd, set: setCurrentPwd },
            { id: "new",  label: "Nouveau mot de passe", val: newPwd,     set: setNewPwd     },
            { id: "conf", label: "Confirmer",            val: confirmPwd, set: setConfirmPwd },
          ].map(({ id, label, val, set }) => (
            <div key={id}>
              <Label className="text-xs">{label}</Label>
              <div className="relative mt-1">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
 
          {pwdMsg && (
            <p
              className={`text-sm rounded-lg p-2 ${
                pwdType === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {pwdMsg}
            </p>
          )}
 
          <Button type="submit" disabled={pwdLoading} variant="outline" className="w-full">
            {pwdLoading ? "Modification..." : "Changer le mot de passe"}
          </Button>
        </form>
 
        <p className="text-xs text-gray-400 mt-3 text-center">
          Minimum 8 caractères · Session expirée après 30 min d'inactivité
        </p>
      </div>
    </div>
  );
}