import { Suspense } from "react"
import SignInClient from './SignInClient'

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50" />}>
      <SignInClient />
    </Suspense>
  )
}

