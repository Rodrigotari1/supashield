import Hero from '@/components/Hero'
import Problem from '@/components/Problem'
import Features from '@/components/Features'
import Installation from '@/components/Installation'
import WhySupaShield from '@/components/WhySupaShield'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Hero />
      <Problem />
      <Features />
      <WhySupaShield />
      <Installation />
      <Footer />
    </main>
  )
}