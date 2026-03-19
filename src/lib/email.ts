import nodemailer from 'nodemailer';

// Configuración del servidor SMTP usando variables de entorno
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true para 465, false para otros
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface SendWelcomeEmailParams {
  to: string;
  name: string;
  tempPassword?: string; // Opcional si se invita sin clave inicial
  role: string;
}

export async function sendWelcomeEmail({ to, name, tempPassword, role }: SendWelcomeEmailParams) {
  // En desarrollo o si no hay credenciales SMTP, simulamos el envío en consola para no bloquear la creación
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('------------------------------------------------------');
    console.log('SIMULACIÓN DE EMAIL (Faltan credenciales SMTP en .env)');
    console.log(`Para: ${to}`);
    console.log(`Asunto: Bienvenido a Gestión de Planta`);
    console.log(`Nombre: ${name}`);
    console.log(`Rol: ${role}`);
    if (tempPassword) console.log(`Contraseña temporal: ${tempPassword}`);
    console.log('------------------------------------------------------');
    return { success: true, simulated: true };
  }

  const roleName = role === 'ADMIN' ? 'Administrador' : 'Operario';
  const loginUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000/login';

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Bienvenido a Gestión de Planta</h2>
      <p>Hola <strong>${name}</strong>,</p>
      <p>Se ha creado tu cuenta con el rol de <strong>${roleName}</strong> en el sistema de gestión.</p>
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Tus credenciales de acceso:</strong></p>
        <p style="margin: 0 0 5px 0;">Email: <strong>${to}</strong></p>
        ${tempPassword ? `<p style="margin: 0;">Contraseña temporal: <strong>${tempPassword}</strong></p>` : ''}
      </div>

      <p>Puedes iniciar sesión accediendo al siguiente enlace:</p>
      <a href="${loginUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
        Iniciar Sesión
      </a>

      ${tempPassword ? `<p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Te recomendamos cambiar esta contraseña la primera vez que ingreses al sistema.</p>` : ''}
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Gestión de Planta" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject: 'Bienvenido al Sistema de Gestión de Planta',
      html,
    });
    
    console.log('Email de bienvenida enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error enviando email:', error);
    return { success: false, error };
  }
}
