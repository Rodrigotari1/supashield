import Link from 'next/link'

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pb-16">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#3E8965]/10 via-black to-black" />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%233E8965' fill-opacity='0.1'%3E%3Cpath d='M0 0h40v40H0z' stroke='%233E8965' stroke-width='0.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-8 xl:px-12 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left side - Content */}
        <div className="text-left">
        {/* Logo/Brand */}
        <div className="mb-8">
          <h1 className="text-5xl md:text-7xl font-bold mb-4">
            <span className="text-[#3E8965]">Supa</span>
            <span className="text-white">Shield</span>
          </h1>
          <div className="flex justify-start items-center gap-2 text-sm text-gray-400">
            <span className="bg-[#3E8965] text-white px-2 py-1 rounded text-xs font-medium">v0.1.0</span>
            <span>•</span>
            <span>MIT License</span>
          </div>
        </div>

        {/* Main headline */}
        <div className="mb-8">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Test your Supabase
            <br />
            <span className="text-[#3E8965]">RLS policies</span>
          </h2>
          
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl leading-relaxed">
            Catch Supabase RLS security vulnerabilities before they reach production.
            <br />
            Find permission bugs before your users do.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-start justify-start gap-4 mb-12">
          <Link 
            href="#installation"
            className="bg-[#3E8965] hover:bg-[#3E8965]/90 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-300 min-w-[200px] inline-block text-center hover:scale-105 hover:shadow-lg hover:shadow-[#3E8965]/20"
          >
            Find Your Bugs Now
          </Link>
          <Link 
            href="https://github.com/Rodrigotari1/supa-shield" 
            target="_blank"
            className="border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-300 min-w-[200px] inline-block text-center hover:scale-105 hover:bg-gray-800/20"
          >
            View on GitHub
          </Link>
        </div>

        {/* Social proof */}
        <div className="mb-6">
          <p className="text-sm text-gray-400">
            Trusted by developers building production Supabase apps
          </p>
        </div>

        {/* Quick install command */}
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-lg p-6 max-w-2xl hover:border-gray-700 transition-all duration-300 hover:bg-gray-900/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Quick Install</span>
            <button className="text-gray-400 hover:text-white text-sm transition-colors duration-200 hover:scale-110">
              Copy
            </button>
          </div>
          <code className="text-[#3E8965] text-lg font-mono">
            npm install -g supashield
          </code>
        </div>
        </div>

        {/* Right side - Visual */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="relative">
            {/* Terminal window mockup */}
            <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-2xl max-w-md hover:border-gray-600 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(62,137,101,0.1)] hover:scale-105">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-gray-400 text-sm ml-2">supashield test</span>
              </div>
              <div className="p-4 font-mono text-sm">
                <div className="text-[#3E8965]">$ supashield test</div>
                <div className="text-gray-300 mt-2">
                  <div>✓ Connecting to database...</div>
                  <div>✓ Loading RLS policies...</div>
                  <div>✓ Running security tests...</div>
                  <div className="mt-2 text-green-400">✓ All tests passed! Your policies are secure.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </section>
  )
}
