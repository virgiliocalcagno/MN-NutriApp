import React from 'react';
import { useStore } from '../context/StoreContext';

const LoginScreen: React.FC = () => {
    const { login } = useStore();

    return (
        <div id="auth-screen" className="fixed top-0 left-0 w-full h-full z-[3000] flex items-center justify-center p-5 text-center bg-[radial-gradient(circle_at_top_right,#e2e8f0,#f8fafc)]">
            <div className="bg-white p-10 py-12 rounded-[30px] shadow-2xl max-w-[400px] w-full">
                <h2 className="font-extrabold text-[28px] mb-2 text-slate-900">¡Bienvenido Pro! 🚀</h2>
                <p className="text-slate-500 text-sm mb-8">Tu plan de nutrición premium, siempre sincronizado en la nube.</p>

                <button onClick={() => login('google')} className="flex items-center justify-center gap-3 w-full p-4 rounded-2xl border-[1.5px] border-slate-200 bg-white font-bold hover:bg-slate-50 transition mb-3 cursor-pointer text-slate-700">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="Google" />
                    Continuar con Google
                </button>

                <button onClick={() => login('facebook')} className="flex items-center justify-center gap-3 w-full p-4 rounded-2xl border-none bg-[#1877f2] text-white font-bold hover:bg-[#166fe5] transition cursor-pointer">
                    <span className="text-xl font-bold">f</span>
                    Continuar con Facebook
                </button>

                <p className="text-[11px] text-slate-400 mt-6 leading-relaxed">Al continuar, aceptas que tus datos se guarden de forma segura para tu seguimiento personalizado.</p>
            </div>
        </div>
    );
};

export default LoginScreen;
