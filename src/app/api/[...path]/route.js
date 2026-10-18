// Неизвестный адрес API — JSON, а не HTML-страница 404
const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
