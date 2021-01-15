import fetch from 'node-fetch';

export const validateHuman = async ( token: string ) =>
{
    const res = await fetch( `https://www.google.com/recaptcha/api/siteverify?secret=${ process.env.RECAPTCHA_SECRET }&response=${ token }`, {
        body: JSON.stringify( token ),
        headers: { 'Content-Type': 'application/json' },
        method: 'post',
    } );

    const data = await res.json();
    return data.success;
};