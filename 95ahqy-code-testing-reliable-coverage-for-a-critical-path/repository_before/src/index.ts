import app from './app';

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`Payments API listening on port ${port}`));
