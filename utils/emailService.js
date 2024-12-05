//BACKEND: utils/emailService.js
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    this.templates = {};
  }

  async loadTemplate(name) {
    if (this.templates[name]) {
      return this.templates[name];
    }

    const templatePath = path.join(__dirname, '../templates', `${name}.hbs`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    this.templates[name] = handlebars.compile(templateContent);
    return this.templates[name];
  }

  async sendWelcomeEmail(user) {
    try {
      const template = await this.loadTemplate('welcome');
      const html = template({
        name: user.name,
        email: user.email,
        loginUrl: `${process.env.CLIENT_URL}/login`
      });

      await this.transporter.sendMail({
        from: `"Booking Street" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Welcome to Booking Street!',
        html: html
      });

      console.log(`Welcome email sent to ${user.email}`);
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }
  }
}

module.exports = new EmailService();