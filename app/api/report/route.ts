import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { tournamentId, tournamentTitle, reportText } = await req.json()

    if (!tournamentId || !reportText) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    })

    // Email content
    const emailSubject = `Tournament Report: ${tournamentTitle || tournamentId}`
    const emailBody = `
Tournament Report

Tournament ID: ${tournamentId}
Tournament Title: ${tournamentTitle || 'N/A'}

Reported by:
- Name: ${session.user.name || 'N/A'}
- Email: ${session.user.email || 'N/A'}
- User ID: ${session.user.id || 'N/A'}

Report Details:
${reportText}
    `.trim()

    // Send email to both recipients
    const recipients = ['rg@piqle.io', 'ds@piqle.io']
    
    await Promise.all(
      recipients.map((to) =>
        transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to,
          subject: emailSubject,
          text: emailBody,
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending report email:', error)
    return NextResponse.json(
      { error: 'Failed to send report' },
      { status: 500 }
    )
  }
}
