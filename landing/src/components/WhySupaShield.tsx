export default function WhySupaShield() {
  return (
    <section className="py-24 px-4 bg-gray-900/20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Example output
          </h2>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 font-mono text-sm overflow-x-auto">
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
