// Bootstrap: `npm run dev` (KYC_PROVIDER=mock needs no credentials)
import { createServer } from './server';
import { createStartSession } from './session';

const port = Number(process.env.PORT || 4100);
createServer(createStartSession())
  .start(port)
  .then(({ url }) => {
    console.log(
      `access-token-demo listening at ${url} (KYC_PROVIDER=${process.env.KYC_PROVIDER || 'sumsub'})`,
    );
  });
