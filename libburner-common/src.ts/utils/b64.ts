export const b64 = {
    encode: (str: string) => {
        return btoa(unescape(encodeURIComponent(str)))
            .replace(/=+$/, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
    },

    decode: (str: string) => {
        try {
            let modifiedStr = str.replace(/-/g, '+').replace(/_/g, '/')
            return decodeURIComponent(escape(atob(modifiedStr)))
        } catch (err) {
            throw new Error('Error decoding Base64 string:' + (<Error> err).toString())
        }
    },
}

export default b64
