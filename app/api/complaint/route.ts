import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as nodemailer from 'nodemailer'

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

    const formData = await req.formData()
    const message = formData.get('message') as string
    const tournamentId = formData.get('tournamentId') as string
    const tournamentTitle = formData.get('tournamentTitle') as string || 'Unknown Tournament'
    const imageFile = formData.get('image') as File | null

    if (!message || !tournamentId) {
      return NextResponse.json(
        { error: 'Message and tournament ID are required' },
        { status: 400 }
      )
    }

    // Prepare email content
    const userEmail = session.user.email || 'Unknown'
    const userName = session.user.name || 'Unknown User'
    const userImage = session.user.image || ''

    // Create email HTML
    let emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #dc2626;">New Complaint Submitted</h2>
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Tournament Information</h3>
            <p><strong>Tournament ID:</strong> ${tournamentId}</p>
            <p><strong>Tournament Title:</strong> ${tournamentTitle}</p>
          </div>
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">User Information</h3>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
          </div>
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="margin-top: 0; color: #dc2626;">Complaint Message</h3>
            <p style="white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
          </div>
        </body>
      </html>
    `

    // Prepare attachments if image is provided
    const attachments: any[] = []
    if (imageFile) {
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
      attachments.push({
        filename: imageFile.name,
        content: imageBuffer,
        contentType: imageFile.type,
      })
    }

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    })

    // Send email to both recipients
    const recipients = ['rg@piqle.io', 'ds@piqle.io']
    
    const emailPromises = recipients.map((recipient) =>
      transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER,
        to: recipient,
        subject: `Complaint from Tournament: ${tournamentTitle}`,
        html: emailHtml,
        attachments: attachments.length > 0 ? attachments : undefined,
      })
    )

    await Promise.all(emailPromises)

    return NextResponse.json({
      success: true,
      message: 'Complaint sent successfully',
    })
  } catch (error: any) {
    console.error('Error sending complaint email:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send complaint' },
      { status: 500 }
    )
  }
}
