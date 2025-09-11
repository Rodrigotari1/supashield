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
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            How it works
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="bg-gray-900/30 backdrop-blur border border-gray-800 rounded-lg p-6 hover:border-gray-700 transition-colors"
            >
              <h3 className="text-xl font-semibold mb-3 text-white">
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
