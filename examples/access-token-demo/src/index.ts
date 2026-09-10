// Bootstrap: `npm run dev` (KYC_PROVIDER=mock needs no credentials)
import { createServer } from './server';
import { createStartSession } from './session';

// PORT, else KYC_PORT_BASE + this example's offset (table: scripts/lib/ports.mjs)
const PORT_BASE_DEFAULT = 5100;
const PORT_OFFSET = 3;
const port =
  Number(process.env.PORT) ||
  Number(process.env.KYC_PORT_BASE || PORT_BASE_DEFAULT) + PORT_OFFSET;
createServer(createStartSession())
  .start(port)
  .then(({ url }) => {
    console.log(
      `access-token-demo listening at ${url} (KYC_PROVIDER=${process.env.KYC_PROVIDER || 'sumsub'})`,
    );
  });
