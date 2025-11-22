import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="py-16 border-t border-gray-800">
      <div className="max-w-6xl mx-auto px-6 md:px-8 xl:px-12">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-2xl font-bold">
                <span className="text-[#3ECF8E]">Supa</span>
                <span className="text-white">Shield</span>
              </h3>
              <span className="bg-[#3ECF8E] text-black px-2 py-1 rounded text-xs font-medium">v0.2.1</span>
            </div>
            <p className="text-gray-400 max-w-md">
              Test your Supabase RLS policies automatically.
            </p>
          </div>

          {/* Community - Only working links */}
          <div>
            <h4 className="font-semibold mb-4">Links</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link 
                  href="https://github.com/Rodrigotari1/supa-shield" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  GitHub
                </Link>
              </li>
              <li>
                <Link 
                  href="https://github.com/Rodrigotari1/supa-shield/issues" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Issues
                </Link>
              </li>
              <li>
                <Link 
                  href="https://www.npmjs.com/package/supashield" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  NPM Package
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-800">
          <div className="flex items-center gap-6">
            <Link 
              href="https://github.com/Rodrigotari1/supa-shield"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </Link>
            
            <div className="text-gray-400 text-sm">
              Built by{' '}
              <Link 
                href="https://github.com/Rodrigotari1" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3ECF8E] hover:text-[#3ECF8E]/80 transition-colors"
              >
                @Rodrigotari1
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
