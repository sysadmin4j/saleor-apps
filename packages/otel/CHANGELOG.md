# @saleor/apps-otel

## 1.2.1

### Patch Changes

- 37ecb246: Update pnpm to 9.2.0 version. It means that we also dropped support for Node.js less than 16.

## 1.2.0

### Minor Changes

- e1ea31be: Wrapped OTEL flushing logic with [waitUntil](https://vercel.com/docs/functions/functions-api-reference#waituntil).
  Now response from a webhook should be immediate, but flushing will not be terminated by Vercel.

### Patch Changes

- 64d88b24: Update packages to ESM. See node [docs](https://nodejs.org/api/esm.html) for more info.
- 5cbd3b63: Updated @saleor/app-sdk package to 0.50.1

## 1.1.0

### Minor Changes

- 67afe8e4: Add urql exchange for GraphQL OTEL

## 1.0.0

### Major Changes

- d9e4cb3: Added initial OTEL setup with common, shared utilities
