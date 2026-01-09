import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

export const sendCronFailureAlert = async (jobName, error, stack = null, context = {}) => {
  try {
    const transporter = createTransporter();
    
    const alertEmails = process.env.ALERT_EMAILS?.split(',') || [];
    if (alertEmails.length === 0) {
      console.warn('⚠️ No alert emails configured. Set ALERT_EMAILS in .env');
      return;
    }

    const subject = `🚨 CRON JOB FAILED: ${jobName}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
          <h1>🚨 Cron Job Failure Alert</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f8f9fa;">
          <h2>Job Details:</h2>
          <p><strong>Job Name:</strong> ${jobName}</p>
          <p><strong>Failed At:</strong> ${new Date().toISOString()}</p>
          <p><strong>Server:</strong> ${process.env.NODE_ENV || 'development'}</p>
          
          <h3>Error Message:</h3>
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px;">
            <code>${error}</code>
          </div>
          
          ${stack ? `
          <h3>Stack Trace:</h3>
          <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; font-size: 12px;">
            ${stack}
          </div>
          ` : ''}
          
          ${Object.keys(context).length > 0 ? `
          <h3>Context Data:</h3>
          <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 10px; border-radius: 4px;">
            <pre>${JSON.stringify(context, null, 2)}</pre>
          </div>
          ` : ''}
          
          <h3>Next Steps:</h3>
          <ul>
            <li>Check server logs for more details</li>
            <li>Verify database connectivity</li>
            <li>Check API rate limits</li>
            <li>Restart the service if necessary</li>
          </ul>
        </div>
        
        <div style="background-color: #6c757d; color: white; padding: 10px; text-align: center; font-size: 12px;">
          This is an automated alert from your Goal Backend system
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: alertEmails.join(', '),
      subject: subject,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Cron failure alert sent for job: ${jobName}`);
    
  } catch (emailError) {
    console.error('❌ Failed to send cron failure alert:', emailError.message);
  }
};

export const sendCronSuccessNotification = async (jobName, stats = {}) => {
  try {
    if (process.env.CRON_SUCCESS_ALERTS !== 'true') return;
    
    const transporter = createTransporter();
    const alertEmails = process.env.ALERT_EMAILS?.split(',') || [];
    
    if (alertEmails.length === 0) return;

    const subject = `✅ CRON JOB SUCCESS: ${jobName}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
          <h1>✅ Cron Job Success</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f8f9fa;">
          <h2>Job Details:</h2>
          <p><strong>Job Name:</strong> ${jobName}</p>
          <p><strong>Completed At:</strong> ${new Date().toISOString()}</p>
          <p><strong>Server:</strong> ${process.env.NODE_ENV || 'development'}</p>
          
          ${Object.keys(stats).length > 0 ? `
          <h3>Job Statistics:</h3>
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 10px; border-radius: 4px;">
            <pre>${JSON.stringify(stats, null, 2)}</pre>
          </div>
          ` : ''}
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: alertEmails.join(', '),
      subject: subject,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Cron success notification sent for job: ${jobName}`);
    
  } catch (emailError) {
    console.error('❌ Failed to send cron success notification:', emailError.message);
  }
};

export const sendHealthCheckAlert = async (message, status = 'unhealthy') => {
  try {
    const transporter = createTransporter();
    const alertEmails = process.env.ALERT_EMAILS?.split(',') || [];
    
    if (alertEmails.length === 0) return;

    const subject = `🏥 SYSTEM HEALTH: ${status.toUpperCase()}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${status === 'healthy' ? '#28a745' : '#dc3545'}; color: white; padding: 20px; text-align: center;">
          <h1>🏥 System Health Check</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f8f9fa;">
          <p><strong>Status:</strong> ${status.toUpperCase()}</p>
          <p><strong>Message:</strong> ${message}</p>
          <p><strong>Checked At:</strong> ${new Date().toISOString()}</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: alertEmails.join(', '),
      subject: subject,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Health check alert sent: ${status}`);
    
  } catch (emailError) {
    console.error('❌ Failed to send health check alert:', emailError.message);
  }
};
