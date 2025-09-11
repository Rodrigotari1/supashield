import Hero from '@/components/Hero'
import Features from '@/components/Features'
import Installation from '@/components/Installation'
import WhySupaShield from '@/components/WhySupaShield'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Hero />
      <Features />
      <WhySupaShield />
      <Installation />
      <Footer />
    </main>
  )
}