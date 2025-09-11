'use client'

import { useState } from 'react'

const installMethods = [
  {
    title: 'npm',
    command: 'npm install -g supashield',
    description: 'Install globally with npm'
  },
  {
    title: 'yarn',
    command: 'yarn global add supashield',
    description: 'Install globally with yarn'
  },
  {
    title: 'pnpm',
    command: 'pnpm add -g supashield',
    description: 'Install globally with pnpm'
  }
]

const quickStartCommands = [
  {
    command: 'supashield init',
    description: 'Discover tables and generate tests'
  },
  {
    command: 'supashield test',
    description: 'Test all RLS policies'
  },
  {
    command: 'supashield test --table public.users',
    description: 'Test specific table'
  },
  {
    command: 'supashield test --as-user admin@company.com',
    description: 'Test with real user context'
  },
  {
    command: 'supashield users',
    description: 'List users from auth.users for testing'
  }
]

export default function Installation() {
  const [activeTab, setActiveTab] = useState(0)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedCommand(command)
      setTimeout(() => setCopiedCommand(null), 2000)
    } catch (err) {
      console.error('Failed to copy command:', err)
    }
  }

  return (
    <section id="installation" className="relative py-12 md:py-16 px-4 overflow-hidden">
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%233E8965' fill-opacity='0.1'%3E%3Cpath d='M0 0h40v40H0z' stroke='%233E8965' stroke-width='0.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />
      
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="text-center mb-6 md:mb-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Installation
          </h2>
        </div>

        {/* Installation */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-wrap gap-2 mb-6">
            {installMethods.map((method, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 hover:scale-105 ${
                  activeTab === index
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {method.title}
              </button>
            ))}
          </div>
          
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-all duration-300 hover:bg-gray-900/90">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                {installMethods[activeTab].description}
              </span>
              <button
                onClick={() => copyCommand(installMethods[activeTab].command)}
                className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded border border-gray-700 hover:border-gray-600 transition-all duration-200 hover:scale-105 hover:bg-gray-800/50"
              >
                {copiedCommand === installMethods[activeTab].command ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <code className="text-emerald-400 text-lg font-mono">
              {installMethods[activeTab].command}
            </code>
          </div>
        </div>

        {/* Quick Start */}
        <div>
          <h3 className="text-2xl font-bold mb-6">Usage</h3>
          <div className="space-y-4">
            {quickStartCommands.map((item, index) => (
              <div key={index} className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-all duration-300 hover:bg-gray-900/90 hover:scale-[1.02]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">{item.description}</span>
                  <button
                    onClick={() => copyCommand(item.command)}
                    className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded border border-gray-700 hover:border-gray-600 transition-all duration-200 hover:scale-105 hover:bg-gray-800/50"
                  >
                    {copiedCommand === item.command ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <code className="text-emerald-400 font-mono">{item.command}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
