// webpack.config.js
const path = require('path');
const webpack = require('webpack'); // <— nieuw

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    target: 'web',
    entry: './src/app.js',
    devtool: isProd ? 'source-map' : 'inline-source-map',

    output: {
      filename: 'bundle.js',
      path: __dirname,
      clean: false,
    },

    module: {
      rules: [
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.m?js$/,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: 'babel-loader',
            options: {
                presets: [
                ['@babel/preset-env', {
                    targets: {
                        browsers: [
                          'last 2 Chrome versions',
                          'last 2 Firefox versions',
                          'last 2 Safari versions',
                          'last 2 Edge versions'
                        ]
                    },
                    bugfixes: true,
                    useBuiltIns: 'usage',
                    corejs: 3
                }]
            ]
            },
          },
        },
      ],
    },

    resolve: {
      fallback: {
        fs: false,
        path: false,
        stream: require.resolve('stream-browserify'),
        timers: require.resolve('timers-browserify'),
        util: require.resolve('util/'),
        zlib: require.resolve('browserify-zlib'),

        buffer: require.resolve('buffer/'),
        process: require.resolve('process/browser'),
        assert: require.resolve('assert/'),
        events: require.resolve('events/'),
        crypto: require.resolve('crypto-browserify'),
      },
    },

    plugins: [
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: ['process'],
      }),
    ],

    devServer: {
      port: 8080,
      open: true,
      hot: true,
      static: { directory: path.resolve(__dirname) },
      historyApiFallback: true,
    },

    // optioneel, om de volledige foutdetails te zien in je terminal:
     stats: { errorDetails: true },
  };
};