const features = [
  {
    title: 'Policy Testing',
    description: 'Test all CRUD operations against your RLS policies with different user roles.'
  },
  {
    title: 'Schema Discovery',
    description: 'Automatically finds your tables and generates test scenarios.'
  },
  {
    title: 'Real User Testing',
    description: 'Test with actual JWT claims to validate permissions work correctly.'
  },
  {
    title: 'CI Integration',
    description: 'Run tests in your deployment pipeline to catch issues early.'
  }
]

export default function Features() {
  return (
    <section className="relative py-12 sm:py-16 md:py-20 px-4 overflow-hidden">
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%233E8965' fill-opacity='0.1'%3E%3Cpath d='M0 0h40v40H0z' stroke='%233E8965' stroke-width='0.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />
      
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 md:px-8 xl:px-12">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 hover:text-[#3E8965] transition-colors duration-300 cursor-default">
            How it works
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-gray-900/30 backdrop-blur border border-gray-800 rounded-lg p-4 sm:p-6 hover:border-gray-700 hover:bg-gray-900/40 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-[#3E8965]/10"
            >
              <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3 text-white">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
