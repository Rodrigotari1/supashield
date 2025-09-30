export default function WhySupaShield() {
  return (
    <section className="relative py-12 md:py-16 px-4 bg-gray-900/20 overflow-hidden">
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%233E8965' fill-opacity='0.1'%3E%3Cpath d='M0 0h40v40H0z' stroke='%233E8965' stroke-width='0.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />
      
      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-8 xl:px-12">
        <div className="text-center mb-6 md:mb-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Example output
          </h2>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 font-mono text-sm overflow-x-auto hover:border-gray-700 transition-all duration-300 hover:shadow-lg hover:shadow-[#3E8965]/5 hover:bg-gray-900/90">
            <div className="text-gray-400 mb-2">$ supashield test</div>
            <div className="space-y-1">
              <div className="text-white">Testing public.users:</div>
              <div className="ml-4 space-y-1">
                <div className="text-gray-300">anonymous_user:</div>
                <div className="ml-4 space-y-1">
                  <div className="text-red-400">    SELECT: ALLOW (expected DENY) - FAIL</div>
                  <div className="text-emerald-400">    INSERT: DENY (expected DENY) - PASS</div>
                </div>
                <div className="text-gray-300">authenticated_user:</div>
                <div className="ml-4 space-y-1">
                  <div className="text-emerald-400">    SELECT: ALLOW (expected ALLOW) - PASS</div>
                  <div className="text-red-400">    INSERT: DENY (expected ALLOW) - FAIL</div>
                </div>
              </div>
              <div className="text-white mt-4">2 passed, 2 failed</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
