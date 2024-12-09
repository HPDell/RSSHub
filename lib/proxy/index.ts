import { Hono } from 'hono';
import bilibili from './bilibili';

const proxy = new Hono();

proxy.get('/bilibili', bilibili);

export default proxy;
