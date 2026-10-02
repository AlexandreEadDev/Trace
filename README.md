This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Package manager

This project uses **[Yarn](https://yarnpkg.com/) (Classic v1)**. Do not use `npm` or `pnpm` — the lockfile is [`yarn.lock`](yarn.lock:1) and `package-lock.json` is intentionally absent.

```bash
# Install dependencies
yarn install

# Add a dependency
yarn add <package>

# Add a dev dependency
yarn add --dev <package>

# Run a one-off binary
yarn dlx <binary>
```

## Getting Started

First, install dependencies and run the development server:

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Start the development server |
| `yarn build` | Create an optimized production build |
| `yarn start` | Start the production server |
| `yarn lint` | Run ESLint via `next lint` |
| `yarn sync:catalog` | Sync the catalog into Supabase |

> **Windows note — paths containing `&`.** Yarn Classic (v1) spawns package
> scripts through a shell using the project directory as the working directory.
> If the project path contains an ampersand (`&`) — e.g.
> `C:\Users\Vicky&Alexandre❤️\...` — the shell treats `&` as a command
> separator and **every** `yarn run <script>` fails with
> `The system cannot find the path specified.` This is a Yarn v1 limitation, not
> a problem with the project.
>
> The scripts are wired through [`scripts/next.mjs`](scripts/next.mjs:1), a thin
> Node launcher that spawns the Next.js CLI directly (bypassing the broken shell
> spawn). On such paths, invoke them with `yarn node` instead of `yarn run`:
>
> ```bash
> yarn node scripts/next.mjs dev     # instead of: yarn dev
> yarn node scripts/next.mjs build   # instead of: yarn build
> yarn node scripts/next.mjs start   # instead of: yarn start
> yarn node scripts/next.mjs lint    # instead of: yarn lint
> yarn node scripts/sync-catalog.mjs # instead of: yarn sync:catalog
> ```
>
> On paths **without** `&` (CI, other machines), the plain `yarn dev` /
> `yarn build` / `yarn start` / `yarn lint` commands work as usual.

### Installing on Windows paths containing `&`

The `postinstall` scripts of some transitive dependencies (`unrs-resolver`,
`sharp`) also fail to resolve their `.bin` shims on such paths. Install with
`--ignore-scripts` to generate the lockfile and link dependencies:

```bash
yarn install --ignore-scripts
```

`sharp` is an optional dependency and is safe to skip; the app falls back to
Next.js' built-in image handling.

## Environment variables

Copy the example values into `.env.local` (see [`.env.local`](.env.local:1)) and restart the dev server after any change:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase connection
- `TMDB_API_KEY` — movies & TV
- `RAWG_API_KEY` — games
- `GOOGLE_BOOKS_API_KEY` — books (optional; Open Library is used as a fallback)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
