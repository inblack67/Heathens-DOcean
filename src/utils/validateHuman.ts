import fetch from 'node-fetch';
import { ErrorResponse } from './ErrorResponse';

export const validateHuman = async (token: string) => {
    const res = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${ process.env.RECAPTCHA_SECRET }&response=${ token }`, {
        body: JSON.stringify(token),
        headers: { 'Content-Type': 'application/json' },
        method: 'post',
    });

    const data = await res.json();
    return data.success;
};

export const recaptchaTest = async (recaptchaToken?: string) => {
    if (process.env.NODE_ENV !== 'development' && !recaptchaToken) {
        throw new ErrorResponse('Where is your recaptcha token?', 401);
    }

    if (recaptchaToken) {
        const isHuman = await validateHuman(recaptchaToken);

        console.log('isHuman = ', isHuman);

        if (!isHuman) {
            throw new ErrorResponse('Are you a robot?', 401);
        }
    }
    return true;
};
