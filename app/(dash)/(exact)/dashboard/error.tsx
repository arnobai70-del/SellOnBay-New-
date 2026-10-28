'use client';

/*
 * Pages that answer a real 404 for an unknown id or address live in this group, outside app/(dash)/dashboard/loading.tsx: a loading screen
 * starts the response (status 200) before the page can call notFound(). Same addresses, same error screen as the rest of the dashboard.
 */
export { default } from '../../dashboard/error';
