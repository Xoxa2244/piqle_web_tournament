import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Piqle Tournament Management
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Comprehensive tournament management system for pickleball tournaments
          </p>
          
          <div className="flex justify-center gap-4">
            <Link
              href="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Tournament Director Console
            </Link>
            <Link
              href="/course/demo"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Scoreboard
            </Link>
          </div>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Tournament Setup</h3>
            <p className="text-gray-600">
              Create tournaments with divisions, constraints, and prizes. Import players from CSV.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Round Robin</h3>
            <p className="text-gray-600">
              Generate round-robin schedules with merged divisions support and live scoring.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Elimination</h3>
            <p className="text-gray-600">
              Automatic bracket generation with play-in rounds and real-time updates.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
