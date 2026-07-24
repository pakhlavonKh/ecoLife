import { api } from './client';

/** @returns {Promise<Array<{id:string,code:string,name:string,description:string,depositPercent:number,images:string[],priceFrom:string|null,priceTo:string|null}>>} */
export async function fetchCategories() {
  const { data } = await api.get('/api/v1/categories');
  return data;
}
