import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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
    const commentId = formData.get('commentId') as string | null
    const commentText = formData.get('commentText') as string | null
    const commentAuthorName = formData.get('commentAuthorName') as string | null
    const commentAuthorEmail = formData.get('commentAuthorEmail') as string | null
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
    const complaintType = commentId ? 'Comment Report' : 'Complaint'
    let emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #dc2626;">New ${complaintType} Submitted</h2>
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Tournament Information</h3>
            <p><strong>Tournament ID:</strong> ${tournamentId}</p>
            <p><strong>Tournament Title:</strong> ${tournamentTitle}</p>
          </div>
          ${commentId ? `
          <div style="background-color: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <h3 style="margin-top: 0; color: #f59e0b;">Reported Comment</h3>
            <p><strong>Comment ID:</strong> ${commentId}</p>
            ${commentAuthorName ? `<p><strong>Author:</strong> ${commentAuthorName}${commentAuthorEmail ? ` (${commentAuthorEmail})` : ''}</p>` : ''}
            <p style="background-color: #ffffff; padding: 10px; border-radius: 4px; margin-top: 10px; font-style: italic; border: 1px solid #e5e7eb;">
              "${commentText ? commentText.replace(/\n/g, '<br>') : 'N/A'}"
            </p>
          </div>
          ` : ''}
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">User Information</h3>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
          </div>
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="margin-top: 0; color: #dc2626;">${commentId ? 'Reason for Reporting' : 'Complaint Message'}</h3>
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

    // Get recipients from environment variable or use defaults
    const recipientsEnv = process.env.COMPLAINT_EMAIL_RECIPIENTS
    const recipients = recipientsEnv 
      ? recipientsEnv.split(',').map(email => email.trim()).filter(email => email.length > 0)
      : ['rg@piqle.io', 'ds@piqle.io'] // Default recipients
    
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No email recipients configured' },
        { status: 500 }
      )
    }

    // Try Resend API first (simpler, no SMTP needed)
    const resendApiKey = process.env.RESEND_API_KEY
    
    if (resendApiKey) {
      // Use Resend API
      const fromEmail = process.env.EMAIL_FROM || 'noreply@piqle.io'
      
      // Prepare attachments for Resend
      const resendAttachments: any[] = []
      if (imageFile) {
        const imageBuffer = await imageFile.arrayBuffer()
        resendAttachments.push({
          filename: imageFile.name,
          content: Buffer.from(imageBuffer).toString('base64'),
        })
      }

      const emailPromises = recipients.map((recipient) =>
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: recipient,
            subject: commentId 
              ? `Comment Report from Tournament: ${tournamentTitle}`
              : `Complaint from Tournament: ${tournamentTitle}`,
            html: emailHtml,
            attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
          }),
        })
      )

      const results = await Promise.all(emailPromises)
      
      // Check if all emails were sent successfully
      for (const result of results) {
        if (!result.ok) {
          const errorData = await result.json()
          throw new Error(`Resend API error: ${errorData.message || 'Failed to send email'}`)
        }
      }
    } else {
      // Fallback to SMTP (if configured)
      const emailHost = process.env.EMAIL_SERVER_HOST
      const emailUser = process.env.EMAIL_SERVER_USER
      const emailPassword = process.env.EMAIL_SERVER_PASSWORD

      if (!emailHost || !emailUser || !emailPassword) {
        console.error('Email configuration missing. Complaint data:', {
          tournamentId,
          tournamentTitle,
          userName,
          userEmail,
          message: message.substring(0, 100) + '...',
          hasImage: !!imageFile,
        })
        
        // In development, log the complaint instead of failing
        if (process.env.NODE_ENV === 'development') {
          console.log('=== COMPLAINT (Email not configured) ===')
          console.log('Tournament:', tournamentTitle, `(${tournamentId})`)
          console.log('User:', userName, `(${userEmail})`)
          console.log('Message:', message)
          console.log('========================================')
          
          return NextResponse.json({
            success: true,
            message: 'Complaint logged (email not configured in development)',
          })
        }
        
        return NextResponse.json(
          { error: 'Email service is not configured. Please set RESEND_API_KEY or SMTP credentials.' },
          { status: 503 }
        )
      }

      // Use SMTP with nodemailer
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        host: emailHost,
        port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
        secure: process.env.EMAIL_SERVER_PORT === '465',
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      })

      const fromEmail = process.env.EMAIL_FROM || emailUser
      
      const emailPromises = recipients.map((recipient) =>
        transporter.sendMail({
          from: fromEmail,
          to: recipient,
          subject: commentId 
            ? `Comment Report from Tournament: ${tournamentTitle}`
            : `Complaint from Tournament: ${tournamentTitle}`,
          html: emailHtml,
          attachments: attachments.length > 0 ? attachments : undefined,
        })
      )

      await Promise.all(emailPromises)
    }

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
