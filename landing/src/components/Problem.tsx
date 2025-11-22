export default function Problem() {
  const problems = [
    {
      title: "Data Leaks",
      description: "RLS policies fail silently. One bug exposes all user data.",
      impact: "Compliance fines, customer churn"
    },
    {
      title: "Manual Testing", 
      description: "Testing by hand doesn't scale. Complex logic breaks.",
      impact: "Hours wasted, bugs slip through"
    },
    {
      title: "No Visibility",
      description: "Deploy hoping policies work. No way to verify.",
      impact: "Deploy anxiety, uncertainty"
    },
    {
      title: "Expensive Fixes",
      description: "Production bugs need emergency hotfixes.",
      impact: "10x more expensive than catching early"
    }
  ]

  return (
    <section className="relative py-12 md:py-16 px-4 overflow-hidden bg-gray-900/20">
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%233E8965' fill-opacity='0.1'%3E%3Cpath d='M0 0h40v40H0z' stroke='%233E8965' stroke-width='0.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />
      
      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-8 xl:px-12">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            RLS Testing is Broken
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Deployed with confidence, only to find users can see each other&apos;s data.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {problems.map((problem, index) => (
            <div 
              key={index}
              className="bg-gray-900/30 backdrop-blur border border-gray-800 rounded-lg p-6 hover:border-gray-700 hover:bg-gray-900/40 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-[#3E8965]/10"
            >
              <h3 className="text-xl font-semibold mb-3 text-white">
                {problem.title}
              </h3>
              <p className="text-gray-400 leading-relaxed mb-3">
                {problem.description}
              </p>
              <div className="text-sm text-[#3E8965] font-medium">
                {problem.impact}
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
