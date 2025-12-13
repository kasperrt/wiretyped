---
title: FAQ
---

# FAQ

## Why is the error first in the tuple?

So you can’t avoid handling it. Putting the error first forces you to look at it.

But in all seriousness: handling the error first (and returning early) also gives you clean type narrowing for the data half of the tuple.

## How can I access the response with status code and all that?

If you care about the status code, it’s almost always because of an error. On success, you care about the data, not the status code.

## Why always return both error and data?

So you don’t end up with “floaty” types. You either have an `error` defined *or* you have `data` defined.

## I saw `safeWrap` and `safeWrapAsync` internally, what is it?

I hate runtime errors, and I absolutely despise try/catch in JavaScript (and friends): you lose context, have to keep a mental model, and jump around the code to understand what failed.

`safeWrap` / `safeWrapAsync` “safe wrap” a value-producing expression and return it as an error-first tuple. That means the error is handled at the line where you try to consume the data, so you can read code top-to-bottom like normal.

It’s not currently exported as part of the public API (might be soon™ though), but you can find the implementation here: [`src/utils/wrap.ts`](https://github.com/kasperrt/wiretyped/blob/main/src/utils/wrap.ts)

## What's next

- Check supported imports and entrypoints in [`/reference/entrypoints`](/reference/entrypoints).
- See provider interfaces in [`/reference/providers`](/reference/providers).
