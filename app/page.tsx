import Header from '@/components/Header'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="flex items-center justify-center pt-16">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            Piqle Tournament Management
          </h1>
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="h-px bg-gray-300 flex-1 max-w-32"></div>
            <div className="text-2xl font-semibold text-gray-700">
              Under Construction
            </div>
            <div className="h-px bg-gray-300 flex-1 max-w-32"></div>
          </div>
        </div>
        
        <div className="text-lg text-gray-600 mb-8">
          We are working hard to bring you an amazing tournament management experience.
          <br />
          Please check back soon!
        </div>
        
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
        </div>
      </div>
      </div>
    </div>
  )
}
