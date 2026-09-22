import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Missing email or OTP code' });
  }

  try {
    const data = await resend.emails.send({
      from: 'Onboarding <onboarding@resend.dev>', // Free default testing domain
      to: [email],
      subject: 'رمز التحقق الخاص بك - حاشية',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; background-color: #f0f6ff; border-radius: 10px;">
          <h2 style="color: #1565c0;">منصة حاشية - تغيير كلمة المرور</h2>
          <p style="font-size: 1rem; color: #334155;">رمز التحقق الخاص بك لإعادة ضبط كلمة المرور هو:</p>
          <div style="background-color: #ffffff; border: 2px dashed #1565c0; padding: 15px; text-align: center; font-size: 2rem; font-weight: bold; letter-spacing: 6px; color: #0f172a; border-radius: 8px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 0.85rem; color: #64748b;">هذا الرمز صالِح لمدة 10 دقائق فقط. إذا لم تطلب هذا الرمز، يُرجى تجاهل هذه الرسالة.</p>
        </div>
      `
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Resend Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
