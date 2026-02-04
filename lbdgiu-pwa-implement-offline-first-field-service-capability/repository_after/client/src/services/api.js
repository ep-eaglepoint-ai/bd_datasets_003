const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export const uploadReport = async (report, attempt = 0) => {
    const MAX_RETRIES = 5;

    try {
        // send local last_modified to the server
        const response = await fetch(`${SERVER_URL}/reports`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'If-Unmodified-Since': new Date(report.last_modified).toUTCString()
            },
            body: JSON.stringify(report),
        });

        if (response.status === 412) {
            throw new Error('CONFLICT: Server has a newer version of this report.');
        }

        if (!response.ok) throw new Error('Network response was not ok');

        return await response.json();
    } catch (error) {
        // Exponential Backoff
        if (attempt < MAX_RETRIES && !error.message.includes('CONFLICT')) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(res => setTimeout(res, delay));
            return uploadReport(report, attempt + 1);
        }
        throw error;
    }
};