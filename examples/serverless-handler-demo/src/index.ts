// Bootstrap: `npm run dev` (KYC_PROVIDER=mock needs no credentials)
import { createApp } from './handlers';
import { createNodeServer, listen } from './node';

// PORT, else KYC_PORT_BASE + this example's offset (table: scripts/lib/ports.mjs)
const PORT_BASE_DEFAULT = 5100;
const PORT_OFFSET = 6;
const port =
  Number(process.env.PORT) ||
  Number(process.env.KYC_PORT_BASE || PORT_BASE_DEFAULT) + PORT_OFFSET;
listen(createNodeServer(createApp().fetch), port).then(origin => {
  console.log(
    `serverless-handler-demo listening at ${origin} (KYC_PROVIDER=${process.env.KYC_PROVIDER || 'sumsub'})`,
  );
});
