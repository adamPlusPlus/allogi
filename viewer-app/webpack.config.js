const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const API_TARGET = process.env.API_TARGET || 'http://localhost:3002';
  
  return {
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      fallback: {
        process: require.resolve('process/browser')
      }
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic' }],
                '@babel/preset-typescript'
              ]
            }
          }
        },
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic' }]
              ]
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        filename: 'index.html',
      }),
      new webpack.DefinePlugin({
        'process.env': JSON.stringify({})
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser'
      })
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, 'public'),
      },
      compress: true,
      port: Number(process.env.PORT || 3001),
      hot: true,
      open: false,
      historyApiFallback: true,
      proxy: [
        {
          context: ['/api'],
          target: API_TARGET,
          changeOrigin: true,
          ws: true,
          onProxyReq: (proxyReq) => {
            // Tag requests as coming from the viewer for server-side logging/metrics
            proxyReq.setHeader('X-Source-ID', 'viewer-app');
          }
        }
      ]
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
      },
    },
  };
};
