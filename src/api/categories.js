import { api } from './client';

/** @returns {Promise<Array<{id:string,code:string,name:string,description:string,depositPercent:number,images:string[],priceFrom:string|null,priceTo:string|null}>>} */
export async function fetchCategories() {
  const { data } = await api.get('/api/v1/categories');
  // Netlify SPA fallback can return HTML with 200 — treat as failure.
  if (typeof data === 'string' || !data || typeof data !== 'object') {
    throw new Error('Invalid categories response');
  }
  return data;
}
