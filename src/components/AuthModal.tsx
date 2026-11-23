import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, legacyDb } from '../lib/firebase';
import { BRAND_ASSETS } from '../lib/assets';
import { buildWhatsappUrl, isAdminEmail } from '../lib/format';
import type { StoreSettings } from '../types';
import { SmartImage } from './SmartImage';

interface AuthModalProps {
  open: boolean;
  settings: StoreSettings;
  onClose: () => void;
  onSuccess: (isAdmin: boolean) => void;
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  settings,
  onClose,
  onSuccess,
  onToast,
}) => {
  const [tab, setTab] = useState<'login' | 'reg'>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const checkAdminRole = async (uid: string, userEmail: string | null, emailVerified: boolean) => {
    try {
      const admSnap = await getDoc(doc(db, 'admins', uid));
      if (admSnap.exists()) return true;
    } catch {
      // Ignore
    }
    if (legacyDb) {
      try {
        const legSnap = await getDoc(doc(legacyDb, 'admins', uid));
        if (legSnap.exists()) return true;
      } catch {
        // Ignore
      }
    }
    return await isAdminEmail(userEmail);
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const isAdm = await checkAdminRole(
        cred.user.uid,
        cred.user.email,
        cred.user.emailVerified
      );
      onToast('Login realizado com sucesso!', 'ok');
      onClose();
      onSuccess(isAdm);
    } catch {
      setErrorMsg('Não foi possível entrar com o Google. Tente novamente ou use e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const isAdm = await checkAdminRole(
        cred.user.uid,
        cred.user.email,
        cred.user.emailVerified
      );
      onToast('Bem-vindo de volta!', 'ok');
      onClose();
      onSuccess(isAdm);
    } catch {
      setErrorMsg('E-mail ou senha incorretos. Confira seus dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanNome = nome.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanNome || !cleanEmail || !password) {
      setErrorMsg('Preencha todos os campos.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrorMsg('Digite um e-mail válido.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanNome });
      await setDoc(doc(db, 'clients', cred.user.uid), {
        nome: cleanNome.slice(0, 120),
        email: cleanEmail.slice(0, 160),
        wpp: '',
        criadoEm: serverTimestamp(),
      });

      if (settings.wpp && settings.msgBoasVindas) {
        const msg = settings.msgBoasVindas.replace('{nome}', cleanNome);
        window.open(buildWhatsappUrl(settings.wpp, msg), '_blank', 'noopener,noreferrer');
      }

      onToast('Conta criada com sucesso!', 'ok');
      onClose();
      onSuccess(false);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const msgs: Record<string, string> = {
        'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'Use uma senha com pelo menos 6 caracteres.',
      };
      setErrorMsg(msgs[code] || 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Digite seu e-mail acima para receber o link de redefinição.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      onToast(`Link enviado para ${cleanEmail}.`, 'ok');
    } catch {
      setErrorMsg('Não foi possível enviar o link para este e-mail.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1E1712]/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#E6DFD5] rounded-2xl w-full max-w-md p-6 sm:p-8 relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 w-9 h-9 rounded-lg flex items-center justify-center text-[#5C5147] hover:bg-[#F2EDE6]"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <SmartImage
            src={settings.logo || BRAND_ASSETS.logo}
            fallbackSrc={BRAND_ASSETS.logo}
            alt="BW Parfum"
            fit="cover"
            containerClassName="w-16 h-16 rounded-full mx-auto mb-3 border border-[#E6DFD5]"
          />
          <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
            BW Parfum Imports
          </h2>
          <p className="text-xs text-[#7A6E65] mt-1">
            Acompanhe seus pedidos e salve seu endereço de entrega
          </p>
        </div>

        <div className="flex bg-[#F2EDE6] p-1 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              tab === 'login' ? 'bg-white text-[#1E1712]' : 'text-[#6B5E53]'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('reg');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              tab === 'reg' ? 'bg-white text-[#1E1712]' : 'text-[#6B5E53]'
            }`}
          >
            Criar Conta
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-[#A93226]/10 border border-[#A93226]/20 text-xs text-[#A93226]">
            {errorMsg}
          </div>
        )}

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="space-y-3">
          {tab === 'reg' && (
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome completo"
              autoComplete="name"
              className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
            />
          )}

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Seu e-mail"
            autoComplete="email"
            className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
          />

          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'reg' ? 'Crie uma senha (mín. 6 caracteres)' : 'Sua senha'}
              autoComplete={tab === 'reg' ? 'new-password' : 'current-password'}
              className="w-full px-3.5 py-2.5 pr-10 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm text-[#1E1712] focus:border-[#9A7437] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              aria-label="Mostrar senha"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6E65]"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1E1712] text-white text-sm font-semibold rounded-lg hover:bg-[#9A7437] transition-colors disabled:opacity-60"
          >
            {loading
              ? 'Processando...'
              : tab === 'login'
                ? 'Entrar na Conta'
                : 'Criar Minha Conta'}
          </button>

          {tab === 'login' && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-center text-xs text-[#7A6E65] hover:text-[#9A7437] pt-1"
            >
              Esqueci minha senha
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
