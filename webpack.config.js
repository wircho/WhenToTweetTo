var path = require('path');
var webpack = require('webpack');
 
module.exports = {
  entry: './src/main.js',
  output: { path: './public', filename: 'bundle.js' },
  module: {
    loaders: [
      {
        include: /\.json$/,
        loaders: ["json-loader"]
      },
      {
        test: /.js?$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['', '.js', '.json'] 
  }
};