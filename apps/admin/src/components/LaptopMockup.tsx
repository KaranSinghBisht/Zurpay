'use client';

export function LaptopMockup({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative mx-auto max-w-5xl">
            {/* Glow effect behind laptop */}
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/20 via-emerald-500/5 to-transparent blur-3xl -z-10" />

            {/* Laptop frame */}
            <div className="relative">
                {/* Screen bezel */}
                <div className="relative bg-zinc-800 rounded-t-xl p-2 pt-6 mx-8">
                    {/* Camera notch */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-zinc-700" />

                    {/* Screen content */}
                    <div className="bg-zinc-950 rounded-lg overflow-hidden aspect-[16/10] relative">
                        {children}
                    </div>
                </div>

                {/* Keyboard base */}
                <div className="relative">
                    <div className="h-4 bg-gradient-to-b from-zinc-700 to-zinc-800 rounded-b-lg mx-4" />
                    <div className="h-2 bg-zinc-800 rounded-b-xl mx-0" />
                </div>

                {/* Stand/reflection */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-zinc-800/50 blur-sm rounded-full" />
            </div>
        </div>
    );
}
