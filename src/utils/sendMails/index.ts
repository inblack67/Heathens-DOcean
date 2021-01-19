import { createTransport } from 'nodemailer';
import { IEmail } from '../interfaces';
import hbs from 'handlebars';
import fs from 'fs';

export const readHTMLFile = (path: string) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path, { encoding: 'utf-8' }, (err, html) => {
            if (err) reject(err);
            resolve(html);
        });
    });
};

export const sendMail = async ({ to, subject, text, templatePath }: IEmail) => {

    if (process.env.NODE_ENV !== 'production') {
        console.log(`Dev => Mail not sent`.blue.bold);
        return;
    }

    try {
        const templateFile = await readHTMLFile(templatePath);
        const template = hbs.compile(templateFile);
        const variables = {
            name: 'you',
            url: 'https://app.21heathens.tk'
        };
        const toBeSentHTML = template(variables);

        const transporter = createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL,
                pass: process.env.PASSWORD
            },
        });

        await transporter.sendMail({
            from: process.env.EMAIL,
            to,
            subject,
            text,
            html: toBeSentHTML
        });

        console.log(`Mail sent`.green.bold);
    } catch (err) {
        console.log(`Error sending the mail`.red.bold);
        console.error(err);
    }
};
