
import React from 'react';

interface WelcomeViewProps {
    onStart: () => void;
}

const WelcomeView: React.FC<WelcomeViewProps> = ({ onStart }) => {
    return (
        <div className="min-h-screen w-full bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 overflow-hidden relative">
            {/* Background Gradient Elements for Futuristic Feel */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]"></div>
                <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px]"></div>
            </div>

            {/* Main Content Wrapper */}
            <main className="relative z-10 flex flex-col items-center justify-between min-h-screen w-full px-6 py-12">
                {/* Branding Top */}
                <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top duration-700">
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                        <span className="material-symbols-outlined text-primary text-3xl">shield_person</span>
                    </div>
                    <h2 className="text-primary font-extrabold tracking-widest text-sm uppercase">MN-NutriApp Pro</h2>
                </div>

                {/* Hero Section */}
                <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
                    {/* Central Visual */}
                    <div className="relative w-full aspect-square flex items-center justify-center mb-8 animate-in zoom-in duration-1000">
                        {/* Decorative Rings */}
                        <div className="absolute inset-0 border-[1px] border-primary/20 rounded-full animate-pulse"></div>
                        <div className="absolute inset-8 border-[1px] border-primary/10 rounded-full"></div>

                        {/* Main Visual Image */}
                        <div className="relative w-64 h-64 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-transparent flex items-center justify-center border border-white/20 backdrop-blur-sm shadow-2xl">
                            <img
                                alt="Futuristic DNA health and nutrition science visual"
                                className="w-full h-full object-cover mix-blend-overlay opacity-80"
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9mzPNLPtfchJWJ06Bb_7lcy1E1S5dvdDwa5xict6zOVUdGEcFdujAOJPbIzx5vwxISWhSaHX7tByKi2pjqQxfyFBnGXt1blFDJTrRKqJLibtNgxtPk-1ymbRLjjUI7kT2mzF_eGUB5LslsribPGSeLMkwdrdywBsxpT_AlfFFO4alC70qVsHacvzvW_Nn5ysKYqMFp93m-FQ7iSoPcp4HhpIGR3h_z7v-vA7vMfXiEsg-SSTl6hN5Xk-HIpuYSOiTCWDoQElHX5sr"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-7xl opacity-90 drop-shadow-glow">biotech</span>
                            </div>
                        </div>
                    </div>

                    {/* Typography Content */}
                    <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom duration-700 delay-300">
                        <h1 className="text-slate-900 dark:text-white text-4xl md:text-5xl font-extrabold leading-tight tracking-tight px-4">
                            Bienvenido a la <span className="text-primary">Élite</span> de tu Salud
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-lg font-medium px-6">
                            Optimización nutricional avanzada impulsada por tecnología de vanguardia.
                        </p>
                    </div>
                </div>

                {/* Action Section (Glassmorphism Container) */}
                <div className="w-full max-w-md pb-8 animate-in fade-in slide-in-from-bottom duration-750 delay-500">
                    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl rounded-2xl p-6 border border-white/50 dark:border-slate-800/50 shadow-xl shadow-primary/5">
                        <button
                            onClick={onStart}
                            className="group relative w-full bg-primary hover:bg-primary/90 text-white font-bold py-5 rounded-xl transition-all duration-300 shadow-glow flex items-center justify-center gap-3 active:scale-[0.98]"
                        >
                            <span className="tracking-[0.1em]">IR AL MENÚ</span>
                            <span className="material-symbols-outlined transition-transform duration-300 group-hover:translate-x-1">arrow_forward_ios</span>
                        </button>
                        <div className="mt-6 flex justify-center items-center gap-6 text-slate-400 dark:text-slate-500 text-xs font-semibold tracking-widest">
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">verified</span>
                                <span>PREMIUM</span>
                            </div>
                            <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">lock</span>
                                <span>SECURE</span>
                            </div>
                            <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">bolt</span>
                                <span>v2.0</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Decorative elements */}
            <div className="fixed top-20 right-10 pointer-events-none opacity-20">
                <span className="material-symbols-outlined text-primary text-9xl">grain</span>
            </div>
            <div className="fixed bottom-40 left-0 pointer-events-none opacity-10">
                <span className="material-symbols-outlined text-primary text-[200px]">blur_on</span>
            </div>
        </div>
    );
};

export default WelcomeView;
