import esbuild from 'esbuild';
import esbuildPluginTypecheck from '@jgoz/esbuild-plugin-typecheck';

let argv = process.argv.slice (2);
let isServeMode = (argv.length > 0 && argv[0] == 'serve');
let buildParams = {
    entryPoints: ['source/main.ts'],
    format: 'esm',
    plugins: [
        esbuildPluginTypecheck.typecheckPlugin ()
    ],
    bundle: true,
    minify: true,
    outdir: 'public'
};

if (isServeMode) {
    let context = await esbuild.context (buildParams);
    await context.watch ();
    let { host, port } = await context.serve ({
        servedir : '.'
    });
    console.log ('Serving: http://localhost:' + port.toString ());
} else {
    await esbuild.build (buildParams);
}
