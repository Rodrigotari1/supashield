import Link from 'next/link'

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 via-black to-black" />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23047857' fill-opacity='0.1'%3E%3Cpath d='M0 0h40v40H0z' stroke='%23047857' stroke-width='0.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 text-center">
        {/* Logo/Brand */}
        <div className="mb-8">
          <h1 className="text-5xl md:text-7xl font-bold mb-4">
            <span className="text-emerald-400">Supa</span>
            <span className="text-white">Shield</span>
          </h1>
          <div className="flex justify-center items-center gap-2 text-sm text-gray-400">
            <span className="bg-emerald-600 text-white px-2 py-1 rounded text-xs">v0.1.0</span>
            <span>•</span>
            <span>MIT License</span>
          </div>
        </div>

        {/* Main headline */}
        <div className="mb-8">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Test your Supabase
            <br />
            <span className="text-emerald-400">RLS policies</span>
          </h2>
          
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            Automated testing for Row Level Security policies.
            <br />
            Find permission bugs before your users do.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <Link 
            href="#installation"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors min-w-[200px] inline-block text-center"
          >
            Get Started
          </Link>
          <Link 
            href="https://github.com/Rodrigotari1/supa-shield" 
            target="_blank"
            className="border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors min-w-[200px] inline-block text-center"
          >
            View on GitHub
          </Link>
        </div>

        {/* Quick install command */}
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-lg p-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Quick Install</span>
            <button className="text-gray-400 hover:text-white text-sm">
              Copy
            </button>
          </div>
          <code className="text-emerald-400 text-lg font-mono">
            npm install -g supashield
          </code>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-gray-600 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-gray-600 rounded-full mt-2 animate-pulse" />
        </div>
      </div>
    </section>
  )
}
