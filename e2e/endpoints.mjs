import { z } from 'zod';

const payloadSchema = z.object({ test: z.literal('yes') });

export const endpoints = {
  '/ok/{integration}': {
    get: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      response: z.object({
        success: z.boolean(),
      }),
    },
    download: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      response: z.instanceof(Blob),
    },
    delete: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      response: z.object({
        success: z.boolean(),
      }),
    },
    post: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      request: payloadSchema,
      response: z.object({
        success: z.boolean(),
        received: payloadSchema,
      }),
    },
    put: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      request: payloadSchema,
      response: z.object({
        success: z.boolean(),
        received: payloadSchema,
      }),
    },
    patch: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      request: payloadSchema,
      response: z.object({
        success: z.boolean(),
        received: payloadSchema,
      }),
    },
  },
  '/flaky': {
    get: {
      $search: z.object({ failTimes: z.number() }),
      response: z.object({ ok: z.boolean(), attempt: z.number() }),
    },
  },
  '/bad': {
    get: {
      // Backend will not respond with string here
      response: z.string(),
    },
  },
  '/sse': {
    sse: {
      $search: z.object({
        error: z.enum(['never', 'sometimes']),
      }),
      events: {
        message: z.object({ i: z.number() }),
        status: z.object({ ok: z.boolean() }),
        done: z.literal('[DONE]'),
      },
    },
  },
};
