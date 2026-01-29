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

    // Try Mailchimp Transactional (Mandrill) API first
    const mailchimpApiKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
    
    if (mailchimpApiKey) {
      // Use Mailchimp Transactional API (formerly Mandrill)
      // From: SMTP_FROM / EMAIL_FROM, SMTP_FROM_NAME / EMAIL_FROM_NAME
      const fromEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@piqle.io'
      const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Piqle'
      
      // Prepare attachments for Mailchimp (base64)
      const mailchimpAttachments: { type: string; name: string; content: string }[] = []
      if (imageFile) {
        const imageBuffer = await imageFile.arrayBuffer()
        mailchimpAttachments.push({
          type: imageFile.type || 'application/octet-stream',
          name: imageFile.name,
          content: Buffer.from(imageBuffer).toString('base64'),
        })
      }

      const subject = commentId 
        ? `Comment Report from Tournament: ${tournamentTitle}`
        : `Complaint from Tournament: ${tournamentTitle}`

      // Mailchimp Transactional sends one request per recipient; we send to all in one message
      const response = await fetch('https://mandrillapp.com/api/1.0/messages/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: mailchimpApiKey,
          message: {
            html: emailHtml,
            subject,
            from_email: fromEmail,
            from_name: fromName,
            to: recipients.map((email) => ({ email, type: 'to' as const })),
            attachments: mailchimpAttachments.length > 0 ? mailchimpAttachments : undefined,
          },
        }),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(`Mailchimp API error: ${response.status} ${JSON.stringify(result)}`)
      }
      // Mailchimp returns array of { email, status, _id, reject_reason? }
      if (Array.isArray(result)) {
        const rejected = result.filter((r: { status: string }) => r.status === 'rejected')
        if (rejected.length > 0) {
          throw new Error(`Mailchimp send failed: ${rejected.map((r: any) => r.reject_reason || r.email).join(', ')}`)
        }
      } else if (result.status === 'error') {
        throw new Error(`Mailchimp API error: ${result.message || result.name || 'Unknown error'}`)
      }
    } else {
      // Fallback to SMTP (support both SMTP_* and EMAIL_SERVER_* variable names)
      const emailHost = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST
      const emailUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER
      const emailPassword = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD
      const emailPort = process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || '587'

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
          { error: 'Email service is not configured. Please set MAILCHIMP_TRANSACTIONAL_API_KEY or SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS).' },
          { status: 503 }
        )
      }

      // Use SMTP with nodemailer
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        host: emailHost,
        port: parseInt(emailPort),
        secure: emailPort === '465',
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      })

      const fromEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM || emailUser
      const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME
      const fromAddress = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail

      const emailPromises = recipients.map((recipient) =>
        transporter.sendMail({
          from: fromAddress,
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
