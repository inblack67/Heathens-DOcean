import crypto from 'crypto';

export const encryptMe = (secret: string, ivString: string) => {
    const cipher = crypto.createCipheriv('aes-256-cbc', process.env.CRYPTO_KEY, ivString);
    let encryptedSecret = cipher.update(secret, 'utf-8', 'hex');
    encryptedSecret += cipher.final('hex');
    return encryptedSecret;
};

export const decryptMe = (encryptedSecret: string, ivString: string) => {
    const decipher = crypto.createDecipheriv('aes-256-cbc', process.env.CRYPTO_KEY, ivString);
    let decryptedSecret = decipher.update(encryptedSecret, 'hex', 'utf-8');
    decryptedSecret += decipher.final('utf-8');
    return decryptedSecret;
};
